-- Atomic OCR row import.
-- One OCR preview row (all transaction splits, optional bill, optional debt) is
-- committed as one idempotent operation. This migration is source-only.

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS client_generated_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_client_generated_id
  ON public.debts(user_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ocr_row_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row_id UUID NOT NULL,
  payload_hash TEXT NOT NULL,
  transaction_ids UUID[] NOT NULL,
  bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
  debt_id UUID REFERENCES public.debts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, row_id)
);

CREATE INDEX IF NOT EXISTS idx_ocr_row_operations_user_id
  ON public.ocr_row_operations(user_id);

ALTER TABLE public.ocr_row_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ocr_row_operations FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.create_ocr_transaction_row_atomic(UUID, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.create_ocr_transaction_row_atomic(
  p_row_id UUID,
  p_splits JSONB,
  p_bill JSONB DEFAULT NULL,
  p_debt JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_payload_hash TEXT;
  v_operation public.ocr_row_operations%ROWTYPE;
  v_item JSONB;
  v_expected_item JSONB;
  v_existing_tx public.transactions%ROWTYPE;
  v_existing_bill public.bills%ROWTYPE;
  v_existing_debt public.debts%ROWTYPE;
  v_existing_bill_item RECORD;
  v_person_id UUID;
  v_person_name TEXT;
  v_transaction_ids UUID[] := ARRAY[]::UUID[];
  v_transaction_id UUID;
  v_bill_id UUID;
  v_debt_id UUID;
  v_client_id UUID;
  v_pos INTEGER;
  v_item_count INTEGER;
  v_split_count INTEGER;
  v_total_minor BIGINT := 0;
  v_items_total_minor BIGINT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_row_id IS NULL
    OR p_splits IS NULL
    OR jsonb_typeof(p_splits) <> 'array'
    OR jsonb_array_length(p_splits) < 1
    OR jsonb_array_length(p_splits) > 50 THEN
    RAISE EXCEPTION 'Invalid OCR row payload';
  END IF;

  v_payload_hash := md5(jsonb_build_object(
    'splits', p_splits,
    'bill', COALESCE(p_bill, 'null'::JSONB),
    'debt', COALESCE(p_debt, 'null'::JSONB)
  )::TEXT);

  -- Serialize retries for this row before looking up the operation record.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT || ':' || p_row_id::TEXT, 0)
  );

  SELECT * INTO v_operation
  FROM public.ocr_row_operations
  WHERE user_id = v_user_id AND row_id = p_row_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_operation.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'OCR row idempotency key already used with a different payload';
    END IF;
    RETURN jsonb_build_object(
      'transaction_ids', to_jsonb(v_operation.transaction_ids),
      'bill_id', v_operation.bill_id,
      'debt_id', v_operation.debt_id
    );
  END IF;

  v_split_count := jsonb_array_length(p_splits);
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_splits) AS x(value)
    GROUP BY (x.value->>'client_generated_id')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'OCR split client_generated_id values must be unique';
  END IF;

  -- Validate every split before creating any dependent object. The called
  -- create_manual_transaction RPC repeats ownership and payload validation for
  -- existing idempotency keys.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
    IF NULLIF(v_item->>'client_generated_id', '') IS NULL
      OR NULLIF(v_item->>'account_id', '') IS NULL
      OR v_item->>'type' IS NULL
      OR v_item->>'type' NOT IN ('income', 'expense')
      OR v_item->>'amount_minor' IS NULL
      OR (v_item->>'amount_minor')::BIGINT <= 0
      OR v_item->>'occurred_at' IS NULL THEN
      RAISE EXCEPTION 'Invalid OCR split payload';
    END IF;
    v_total_minor := v_total_minor + (v_item->>'amount_minor')::BIGINT;
  END LOOP;

  IF p_bill IS NOT NULL THEN
    IF jsonb_typeof(p_bill) <> 'object'
      OR p_bill->>'channel_type' IS NULL
      OR p_bill->>'declared_total_minor' IS NULL
      OR (p_bill->>'declared_total_minor')::BIGINT < 0
      OR jsonb_typeof(COALESCE(p_bill->'items', '[]'::JSONB)) <> 'array' THEN
      RAISE EXCEPTION 'Invalid OCR bill payload';
    END IF;
    IF (p_bill->>'declared_total_minor')::BIGINT <> v_total_minor THEN
      RAISE EXCEPTION 'OCR bill total does not match transaction amount';
    END IF;
    IF p_bill->>'channel_type' = 'online' THEN
      IF NULLIF(p_bill->>'online_marketplace', '') IS NULL
        OR (p_bill->>'online_marketplace') NOT IN ('shopee', 'lazada', 'tiktok_shop', 'other')
        OR (p_bill->>'online_marketplace') = 'other'
          AND NULLIF(TRIM(p_bill->>'online_marketplace_other'), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid online OCR bill payload';
      END IF;
      IF p_bill->>'online_marketplace' <> 'other'
        AND NULLIF(p_bill->>'online_marketplace_other', '') IS NOT NULL THEN
        RAISE EXCEPTION 'online_marketplace_other is only valid for marketplace other';
      END IF;
      IF NULLIF(p_bill->>'store_name', '') IS NOT NULL THEN
        RAISE EXCEPTION 'store_name is invalid for an online OCR bill';
      END IF;
    ELSIF p_bill->>'channel_type' = 'offline' THEN
      IF NULLIF(TRIM(p_bill->>'store_name'), '') IS NULL
        OR NULLIF(p_bill->>'online_marketplace', '') IS NOT NULL
        OR NULLIF(p_bill->>'online_marketplace_other', '') IS NOT NULL THEN
        RAISE EXCEPTION 'Invalid offline OCR bill payload';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid OCR bill channel';
    END IF;
  END IF;

  IF p_debt IS NOT NULL THEN
    IF jsonb_typeof(p_debt) <> 'object'
      OR (NULLIF(p_debt->>'person_id', '') IS NULL AND NULLIF(TRIM(p_debt->>'person_name'), '') IS NULL)
      OR (p_debt->>'type') IS NULL
      OR p_debt->>'type' NOT IN ('lend', 'borrow')
      OR p_debt->>'original_amount' IS NULL
      OR (p_debt->>'original_amount')::BIGINT <= 0
      OR (p_debt->>'original_amount')::BIGINT > v_total_minor THEN
      RAISE EXCEPTION 'Invalid OCR debt payload';
    END IF;
    IF NULLIF(p_debt->>'person_id', '') IS NOT NULL THEN
      v_person_id := (p_debt->>'person_id')::UUID;
      IF NOT EXISTS (
        SELECT 1 FROM public.people
        WHERE id = v_person_id AND user_id = v_user_id
      ) THEN
        RAISE EXCEPTION 'OCR debt person does not belong to the authenticated user';
      END IF;
    ELSE
      v_person_name := BTRIM(p_debt->>'person_name');
      -- Keep person resolution inside the row transaction. The advisory lock
      -- also serializes two OCR rows that introduce the same person name.
      PERFORM pg_advisory_xact_lock(
        hashtextextended(v_user_id::TEXT || ':person:' || LOWER(v_person_name), 0)
      );
      SELECT id INTO v_person_id
      FROM public.people
      WHERE user_id = v_user_id AND LOWER(name) = LOWER(v_person_name)
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;
      IF v_person_id IS NULL THEN
        INSERT INTO public.people (user_id, name)
        VALUES (v_user_id, v_person_name)
        RETURNING id INTO v_person_id;
      END IF;
    END IF;
  END IF;

  -- Create or recover all transactions. Any exception rolls back the whole
  -- function, so no partial split can survive a bill/debt failure.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
    v_client_id := (v_item->>'client_generated_id')::UUID;
    v_transaction_id := public.create_manual_transaction(
      v_client_id,
      (v_item->>'type')::transaction_type,
      (v_item->>'account_id')::UUID,
      (v_item->>'amount_minor')::BIGINT,
      COALESCE(v_item->>'currency', 'VND')::CHAR(3),
      (v_item->>'occurred_at')::TIMESTAMPTZ,
      NULLIF(v_item->>'category_id', '')::UUID,
      NULLIF(v_item->>'global_category_id', '')::UUID,
      NULLIF(v_item->>'payee', ''),
      NULLIF(v_item->>'note', ''),
      'manual'
    );
    v_transaction_ids := array_append(v_transaction_ids, v_transaction_id);
  END LOOP;

  IF p_bill IS NOT NULL THEN
    SELECT * INTO v_existing_bill
    FROM public.bills
    WHERE transaction_id = v_transaction_ids[1]
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_bill.user_id IS DISTINCT FROM v_user_id
        OR v_existing_bill.channel_type IS DISTINCT FROM p_bill->>'channel_type'
        OR v_existing_bill.online_marketplace IS DISTINCT FROM NULLIF(p_bill->>'online_marketplace', '')
        OR v_existing_bill.online_marketplace_other IS DISTINCT FROM NULLIF(p_bill->>'online_marketplace_other', '')
        OR v_existing_bill.store_name IS DISTINCT FROM NULLIF(p_bill->>'store_name', '')
        OR v_existing_bill.declared_total_minor IS DISTINCT FROM (p_bill->>'declared_total_minor')::BIGINT THEN
        RAISE EXCEPTION 'OCR bill idempotency payload conflict';
      END IF;
      v_bill_id := v_existing_bill.id;
      v_item_count := jsonb_array_length(COALESCE(p_bill->'items', '[]'::JSONB));
      IF v_existing_bill.item_count IS DISTINCT FROM v_item_count THEN
        RAISE EXCEPTION 'OCR bill items idempotency payload conflict';
      END IF;
      FOR v_pos IN 0..(v_item_count - 1) LOOP
        v_item := (p_bill->'items')->v_pos;
        SELECT * INTO v_existing_bill_item
        FROM public.bill_items
        WHERE bill_id = v_bill_id AND position = v_pos;
        IF NOT FOUND
          OR v_existing_bill_item.product_name IS DISTINCT FROM v_item->>'product_name'
          OR v_existing_bill_item.quantity IS DISTINCT FROM (v_item->>'quantity')::NUMERIC
          OR v_existing_bill_item.unit_price_minor IS DISTINCT FROM (v_item->>'unit_price_minor')::BIGINT
          OR v_existing_bill_item.line_total_minor IS DISTINCT FROM (v_item->>'line_total_minor')::BIGINT
          OR v_existing_bill_item.note IS DISTINCT FROM NULLIF(v_item->>'note', '') THEN
          RAISE EXCEPTION 'OCR bill items idempotency payload conflict';
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.bills (
        user_id, transaction_id, channel_type, online_marketplace,
        online_marketplace_other, store_name, declared_total_minor,
        item_count, raw_ocr
      ) VALUES (
        v_user_id,
        v_transaction_ids[1],
        p_bill->>'channel_type',
        NULLIF(p_bill->>'online_marketplace', ''),
        NULLIF(p_bill->>'online_marketplace_other', ''),
        NULLIF(p_bill->>'store_name', ''),
        (p_bill->>'declared_total_minor')::BIGINT,
        jsonb_array_length(COALESCE(p_bill->'items', '[]'::JSONB)),
        '{}'::JSONB
      ) RETURNING id INTO v_bill_id;

      v_item_count := jsonb_array_length(COALESCE(p_bill->'items', '[]'::JSONB));
      FOR v_pos IN 0..(v_item_count - 1) LOOP
        v_item := (p_bill->'items')->v_pos;
        IF NULLIF(v_item->>'product_name', '') IS NULL
          OR v_item->>'quantity' IS NULL
          OR (v_item->>'quantity')::NUMERIC <= 0
          OR v_item->>'unit_price_minor' IS NULL
          OR (v_item->>'unit_price_minor')::BIGINT < 0
          OR v_item->>'line_total_minor' IS NULL
          OR (v_item->>'line_total_minor')::BIGINT < 0 THEN
          RAISE EXCEPTION 'Invalid OCR bill item payload';
        END IF;
        v_items_total_minor := v_items_total_minor + (v_item->>'line_total_minor')::BIGINT;
        INSERT INTO public.bill_items (
          bill_id, user_id, position, product_name, quantity,
          unit_price_minor, line_total_minor, note
        ) VALUES (
          v_bill_id,
          v_user_id,
          v_pos,
          v_item->>'product_name',
          (v_item->>'quantity')::NUMERIC,
          (v_item->>'unit_price_minor')::BIGINT,
          (v_item->>'line_total_minor')::BIGINT,
          NULLIF(v_item->>'note', '')
        );
      END LOOP;
      IF v_item_count > 0 AND v_items_total_minor <> (p_bill->>'declared_total_minor')::BIGINT THEN
        RAISE EXCEPTION 'OCR bill item total does not match declared total';
      END IF;
    END IF;
  END IF;

  IF p_debt IS NOT NULL THEN
    SELECT * INTO v_existing_debt
    FROM public.debts
    WHERE user_id = v_user_id AND client_generated_id = p_row_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_debt.person_id IS DISTINCT FROM v_person_id
        OR v_existing_debt.type IS DISTINCT FROM p_debt->>'type'
        OR v_existing_debt.original_amount IS DISTINCT FROM (p_debt->>'original_amount')::BIGINT
        OR v_existing_debt.notes IS DISTINCT FROM NULLIF(p_debt->>'notes', '') THEN
        RAISE EXCEPTION 'OCR debt idempotency payload conflict';
      END IF;
      v_debt_id := v_existing_debt.id;
    ELSE
      INSERT INTO public.debts (
        user_id, person_id, type, counterparty_name, original_amount,
        remaining_amount, status, notes, client_generated_id
      ) VALUES (
        v_user_id,
        v_person_id,
        p_debt->>'type',
        (SELECT name FROM public.people WHERE id = v_person_id AND user_id = v_user_id),
        (p_debt->>'original_amount')::BIGINT,
        (p_debt->>'original_amount')::BIGINT,
        'active',
        NULLIF(p_debt->>'notes', ''),
        p_row_id
      ) RETURNING id INTO v_debt_id;
    END IF;
  END IF;

  INSERT INTO public.ocr_row_operations (
    user_id, row_id, payload_hash, transaction_ids, bill_id, debt_id
  ) VALUES (
    v_user_id, p_row_id, v_payload_hash, v_transaction_ids, v_bill_id, v_debt_id
  );

  RETURN jsonb_build_object(
    'transaction_ids', to_jsonb(v_transaction_ids),
    'bill_id', v_bill_id,
    'debt_id', v_debt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_ocr_transaction_row_atomic(UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ocr_transaction_row_atomic(UUID, JSONB, JSONB, JSONB) TO authenticated;
