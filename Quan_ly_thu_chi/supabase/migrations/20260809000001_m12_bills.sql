-- ============================================================
-- Migration: M12 - Bills (chụp bill siêu thị)
-- Tables: bills (1:1 with transactions), bill_items (line items)
-- ============================================================

-- ============================================================
-- 1) bills - Bill siêu thị / hoá đơn mua sắm (1:1 với transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('online', 'offline')),
  online_marketplace TEXT CHECK (
    online_marketplace IS NULL
    OR online_marketplace IN ('shopee', 'lazada', 'tiktok_shop', 'other')
  ),
  online_marketplace_other TEXT,
  store_name TEXT,
  declared_total_minor BIGINT NOT NULL CHECK (declared_total_minor >= 0),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  raw_ocr JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  -- Constraint: phải đúng 1 trong 2 kênh
  CONSTRAINT bills_channel_consistency CHECK (
    (channel_type = 'online' AND online_marketplace IS NOT NULL AND store_name IS NULL)
    OR (channel_type = 'offline' AND store_name IS NOT NULL AND online_marketplace IS NULL)
  ),
  CONSTRAINT bills_other_consistency CHECK (
    online_marketplace = 'other' OR online_marketplace_other IS NULL
  )
);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bills"
  ON public.bills
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_bills_user_id ON public.bills(user_id);
CREATE INDEX idx_bills_transaction_id ON public.bills(transaction_id);
CREATE INDEX idx_bills_channel_type ON public.bills(channel_type);

-- ============================================================
-- 2) bill_items - Danh sách sản phẩm trong bill
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bill items"
  ON public.bill_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX idx_bill_items_user_id ON public.bill_items(user_id);

-- ============================================================
-- 3) updated_at trigger cho bills
-- ============================================================
DROP TRIGGER IF EXISTS update_bills_updated_at ON public.bills;
CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC: get_bill_with_items
-- Trả về JSON {bill, items[]} (1 row, dễ xử lý từ client).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_bill_with_items(p_transaction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bill public.bills;
  v_items JSONB;
BEGIN
  SELECT * INTO v_bill
  FROM public.bills
  WHERE transaction_id = p_transaction_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_bill.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', bi.id,
      'bill_id', bi.bill_id,
      'user_id', bi.user_id,
      'position', bi.position,
      'product_name', bi.product_name,
      'quantity', bi.quantity,
      'unit_price_minor', bi.unit_price_minor,
      'line_total_minor', bi.line_total_minor,
      'note', bi.note,
      'created_at', bi.created_at
    ) ORDER BY bi.position ASC
  ), '[]'::JSONB) INTO v_items
  FROM public.bill_items bi
  WHERE bi.bill_id = v_bill.id;

  RETURN jsonb_build_object(
    'bill', jsonb_build_object(
      'id', v_bill.id,
      'user_id', v_bill.user_id,
      'transaction_id', v_bill.transaction_id,
      'channel_type', v_bill.channel_type,
      'online_marketplace', v_bill.online_marketplace,
      'online_marketplace_other', v_bill.online_marketplace_other,
      'store_name', v_bill.store_name,
      'declared_total_minor', v_bill.declared_total_minor,
      'item_count', v_bill.item_count,
      'raw_ocr', v_bill.raw_ocr,
      'created_at', v_bill.created_at,
      'updated_at', v_bill.updated_at,
      'version', v_bill.version
    ),
    'items', v_items
  );
END;
$$;

-- ============================================================
-- RPC: create_bill_with_items
-- Tạo bill + items trong 1 transaction; raise exception nếu transaction đã có bill.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_bill_with_items(
  p_transaction_id UUID,
  p_channel_type TEXT,
  p_declared_total_minor BIGINT,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_online_marketplace TEXT DEFAULT NULL,
  p_online_marketplace_other TEXT DEFAULT NULL,
  p_store_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tx RECORD;
  v_user_id UUID;
  v_bill_id UUID;
  v_item_count INTEGER;
  v_item JSONB;
  v_pos INTEGER := 0;
BEGIN
  -- 1. Verify transaction thuộc user
  SELECT user_id, amount_minor INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id;

  IF v_tx IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  v_user_id := v_tx.user_id;
  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- 2. Validate chưa có bill cho transaction này
  IF EXISTS (SELECT 1 FROM public.bills WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'Bill already exists for this transaction';
  END IF;

  -- 3. Validate channel consistency
  IF p_channel_type = 'online' THEN
    IF p_online_marketplace IS NULL THEN
      RAISE EXCEPTION 'online_marketplace is required when channel_type = online';
    END IF;
    IF p_online_marketplace = 'other' AND (p_online_marketplace_other IS NULL OR TRIM(p_online_marketplace_other) = '') THEN
      RAISE EXCEPTION 'online_marketplace_other is required when marketplace = other';
    END IF;
  ELSIF p_channel_type = 'offline' THEN
    IF p_store_name IS NULL OR TRIM(p_store_name) = '' THEN
      RAISE EXCEPTION 'store_name is required when channel_type = offline';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid channel_type: %', p_channel_type;
  END IF;

  -- 4. Insert bill
  INSERT INTO public.bills (
    user_id, transaction_id, channel_type,
    online_marketplace, online_marketplace_other, store_name,
    declared_total_minor, item_count, raw_ocr
  ) VALUES (
    auth.uid(), p_transaction_id, p_channel_type,
    p_online_marketplace, p_online_marketplace_other, p_store_name,
    p_declared_total_minor, 0, '{}'::JSONB
  )
  RETURNING id INTO v_bill_id;

  -- 5. Insert items
  v_item_count := jsonb_array_length(p_items);
  FOR v_pos IN 0..(v_item_count - 1) LOOP
    v_item := p_items -> v_pos;
    INSERT INTO public.bill_items (
      bill_id, user_id, position,
      product_name, quantity, unit_price_minor, line_total_minor, note
    ) VALUES (
      v_bill_id, auth.uid(), v_pos,
      v_item->>'product_name',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price_minor')::BIGINT,
      (v_item->>'line_total_minor')::BIGINT,
      v_item->>'note'
    );
  END LOOP;

  -- 6. Update item_count
  UPDATE public.bills
  SET item_count = v_item_count, version = version + 1
  WHERE id = v_bill_id;

  RETURN v_bill_id;
END;
$$;

-- ============================================================
-- RPC: update_bill_with_items
-- Update bill + replace tất cả items trong 1 transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_bill_with_items(
  p_bill_id UUID,
  p_channel_type TEXT,
  p_declared_total_minor BIGINT,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_online_marketplace TEXT DEFAULT NULL,
  p_online_marketplace_other TEXT DEFAULT NULL,
  p_store_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bill RECORD;
  v_item_count INTEGER;
  v_item JSONB;
  v_pos INTEGER := 0;
BEGIN
  -- 1. Verify bill thuộc user
  SELECT * INTO v_bill FROM public.bills WHERE id = p_bill_id;
  IF v_bill IS NULL THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;
  IF v_bill.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- 2. Validate channel consistency
  IF p_channel_type = 'online' THEN
    IF p_online_marketplace IS NULL THEN
      RAISE EXCEPTION 'online_marketplace is required when channel_type = online';
    END IF;
    IF p_online_marketplace = 'other' AND (p_online_marketplace_other IS NULL OR TRIM(p_online_marketplace_other) = '') THEN
      RAISE EXCEPTION 'online_marketplace_other is required when marketplace = other';
    END IF;
  ELSIF p_channel_type = 'offline' THEN
    IF p_store_name IS NULL OR TRIM(p_store_name) = '' THEN
      RAISE EXCEPTION 'store_name is required when channel_type = offline';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid channel_type: %', p_channel_type;
  END IF;

  -- 3. Update bill
  UPDATE public.bills
  SET channel_type = p_channel_type,
      online_marketplace = p_online_marketplace,
      online_marketplace_other = p_online_marketplace_other,
      store_name = p_store_name,
      declared_total_minor = p_declared_total_minor,
      version = version + 1,
      updated_at = NOW()
  WHERE id = p_bill_id;

  -- 4. Replace items
  DELETE FROM public.bill_items WHERE bill_id = p_bill_id;

  v_item_count := jsonb_array_length(p_items);
  FOR v_pos IN 0..(v_item_count - 1) LOOP
    v_item := p_items -> v_pos;
    INSERT INTO public.bill_items (
      bill_id, user_id, position,
      product_name, quantity, unit_price_minor, line_total_minor, note
    ) VALUES (
      p_bill_id, auth.uid(), v_pos,
      v_item->>'product_name',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price_minor')::BIGINT,
      (v_item->>'line_total_minor')::BIGINT,
      v_item->>'note'
    );
  END LOOP;

  -- 5. Update item_count
  UPDATE public.bills
  SET item_count = v_item_count
  WHERE id = p_bill_id;

  RETURN p_bill_id;
END;
$$;

-- ============================================================
-- RPC: delete_bill
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_bill(p_bill_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM public.bills WHERE id = p_bill_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;
  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.bills WHERE id = p_bill_id;
  RETURN TRUE;
END;
$$;
