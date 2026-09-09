\set ON_ERROR_STOP on
-- Run this fixture only after the canonical migrations, including
-- 20260908000002_ocr_row_atomic.sql, have been applied to an isolated database.
-- It rolls back all rows at the end and never calls the OCR provider.
BEGIN;
SET LOCAL timezone = 'UTC';

INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-9000-4000-8000-000000000001', 'ocr-atomic-a@example.invalid', '{}'),
  ('bbbbbbbb-9000-4000-8000-000000000002', 'ocr-atomic-b@example.invalid', '{}');

INSERT INTO financial_accounts(id, user_id, name, type, opening_balance_minor) VALUES
  ('aaaaaaaa-9100-4000-8000-000000000001', 'aaaaaaaa-9000-4000-8000-000000000001', 'OCR cash A', 'cash', 0),
  ('bbbbbbbb-9100-4000-8000-000000000002', 'bbbbbbbb-9000-4000-8000-000000000002', 'OCR cash B', 'cash', 0);

INSERT INTO global_categories(id, name, kind, is_active, sort_order)
VALUES ('aaaaaaaa-9200-4000-8000-000000000001', 'OCR global shopping', 'expense', TRUE, 901);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-9000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_user_id CONSTANT UUID := 'aaaaaaaa-9000-4000-8000-000000000001';
  v_account_id CONSTANT UUID := 'aaaaaaaa-9100-4000-8000-000000000001';
  v_account_b_id CONSTANT UUID := 'bbbbbbbb-9100-4000-8000-000000000002';
  v_global_category_id CONSTANT UUID := 'aaaaaaaa-9200-4000-8000-000000000001';
  v_row_id CONSTANT UUID := 'aaaaaaaa-9300-4000-8000-000000000001';
  v_retry_row_id CONSTANT UUID := 'aaaaaaaa-9300-4000-8000-000000000002';
  v_rollback_row_id CONSTANT UUID := 'aaaaaaaa-9300-4000-8000-000000000003';
  v_split_1 CONSTANT UUID := 'aaaaaaaa-9400-4000-8000-000000000001';
  v_split_2 CONSTANT UUID := 'aaaaaaaa-9400-4000-8000-000000000002';
  v_rollback_split CONSTANT UUID := 'aaaaaaaa-9400-4000-8000-000000000003';
  v_first JSONB;
  v_retry JSONB;
  v_tx_id UUID;
  v_failed BOOLEAN;
BEGIN
  v_first := public.create_ocr_transaction_row_atomic(
    v_row_id,
    jsonb_build_array(
      jsonb_build_object(
        'client_generated_id', v_split_1,
        'account_id', v_account_id,
        'type', 'expense',
        'amount_minor', 60000,
        'occurred_at', '2026-09-08T10:00:00Z',
        'category_id', NULL,
        'global_category_id', v_global_category_id,
        'payee', 'OCR store',
        'note', '[OCR]'
      ),
      jsonb_build_object(
        'client_generated_id', v_split_2,
        'account_id', v_account_id,
        'type', 'expense',
        'amount_minor', 40000,
        'occurred_at', '2026-09-08T10:00:00Z',
        'category_id', NULL,
        'global_category_id', v_global_category_id,
        'payee', 'OCR store',
        'note', '[OCR]'
      )
    ),
    jsonb_build_object(
      'channel_type', 'offline',
      'store_name', 'OCR store',
      'declared_total_minor', 100000,
      'items', jsonb_build_array(jsonb_build_object(
        'product_name', 'OCR item',
        'quantity', 1,
        'unit_price_minor', 100000,
        'line_total_minor', 100000
      ))
    ),
    jsonb_build_object(
      'person_name', 'OCR New Person',
      'type', 'lend',
      'original_amount', 30000,
      'notes', 'atomic OCR fixture'
    )
  );

  IF jsonb_array_length(v_first->'transaction_ids') <> 2
    OR v_first->>'bill_id' IS NULL
    OR v_first->>'debt_id' IS NULL THEN
    RAISE EXCEPTION 'successful OCR row did not return all dependent ids: %', v_first;
  END IF;

  SELECT (v_first->'transaction_ids'->>0)::UUID INTO v_tx_id;
  IF (SELECT global_category_id FROM public.transactions WHERE id = v_tx_id) <> v_global_category_id
    OR (SELECT category_id FROM public.transactions WHERE id = v_tx_id) IS NOT NULL THEN
    RAISE EXCEPTION 'global category was not stored in the global column';
  END IF;
  IF (SELECT count(*) FROM public.people WHERE user_id = v_user_id AND name = 'OCR New Person') <> 1 THEN
    RAISE EXCEPTION 'new OCR person was not created inside the row operation';
  END IF;
  IF (SELECT count(*) FROM public.transactions WHERE user_id = v_user_id) <> 2
    OR (SELECT count(*) FROM public.bills WHERE id = (v_first->>'bill_id')::UUID) <> 1
    OR (SELECT count(*) FROM public.bill_items WHERE bill_id = (v_first->>'bill_id')::UUID) <> 1
    OR (SELECT count(*) FROM public.debts WHERE id = (v_first->>'debt_id')::UUID) <> 1 THEN
    RAISE EXCEPTION 'atomic OCR row did not create exactly one complete dependency set';
  END IF;

  v_retry := public.create_ocr_transaction_row_atomic(
    v_row_id,
    jsonb_build_array(
      jsonb_build_object('client_generated_id', v_split_1, 'account_id', v_account_id, 'type', 'expense', 'amount_minor', 60000, 'occurred_at', '2026-09-08T10:00:00Z', 'category_id', NULL, 'global_category_id', v_global_category_id, 'payee', 'OCR store', 'note', '[OCR]'),
      jsonb_build_object('client_generated_id', v_split_2, 'account_id', v_account_id, 'type', 'expense', 'amount_minor', 40000, 'occurred_at', '2026-09-08T10:00:00Z', 'category_id', NULL, 'global_category_id', v_global_category_id, 'payee', 'OCR store', 'note', '[OCR]')
    ),
    jsonb_build_object('channel_type', 'offline', 'store_name', 'OCR store', 'declared_total_minor', 100000, 'items', jsonb_build_array(jsonb_build_object('product_name', 'OCR item', 'quantity', 1, 'unit_price_minor', 100000, 'line_total_minor', 100000))),
    jsonb_build_object('person_name', 'OCR New Person', 'type', 'lend', 'original_amount', 30000, 'notes', 'atomic OCR fixture')
  );
  IF v_retry IS DISTINCT FROM v_first
    OR (SELECT count(*) FROM public.transactions WHERE user_id = v_user_id) <> 2
    OR (SELECT count(*) FROM public.people WHERE user_id = v_user_id AND name = 'OCR New Person') <> 1 THEN
    RAISE EXCEPTION 'OCR row retry was not idempotent';
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.create_ocr_transaction_row_atomic(
      v_rollback_row_id,
      jsonb_build_array(jsonb_build_object('client_generated_id', v_rollback_split, 'account_id', v_account_id, 'type', 'expense', 'amount_minor', 50000, 'occurred_at', '2026-09-08T11:00:00Z', 'category_id', NULL, 'global_category_id', v_global_category_id, 'payee', 'Rollback store', 'note', '[OCR]')),
      jsonb_build_object('channel_type', 'offline', 'store_name', 'Rollback store', 'declared_total_minor', 50000, 'items', jsonb_build_array(jsonb_build_object('product_name', 'bad item', 'quantity', 1, 'unit_price_minor', 50000, 'line_total_minor', 49000))),
      jsonb_build_object('person_name', 'OCR Rollback Person', 'type', 'lend', 'original_amount', 10000, 'notes', 'must rollback')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'invalid bill item total was accepted'; END IF;
  IF (SELECT count(*) FROM public.transactions WHERE user_id = v_user_id AND client_generated_id = v_rollback_split) <> 0
    OR (SELECT count(*) FROM public.people WHERE user_id = v_user_id AND name = 'OCR Rollback Person') <> 0
    OR (SELECT count(*) FROM public.debts WHERE user_id = v_user_id AND client_generated_id = v_rollback_row_id) <> 0 THEN
    RAISE EXCEPTION 'failed OCR row left partial transaction, person, debt, or operation rows';
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.create_ocr_transaction_row_atomic(
      v_retry_row_id,
      jsonb_build_array(jsonb_build_object('client_generated_id', v_split_1, 'account_id', v_account_b_id, 'type', 'expense', 'amount_minor', 1000, 'occurred_at', '2026-09-08T12:00:00Z'))
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'cross-user account was accepted'; END IF;

  RAISE NOTICE 'PASS: OCR row atomicity, global category mapping, new-person rollback, bill consistency, and idempotent retry';
END $$;

RESET ROLE;
ROLLBACK;
