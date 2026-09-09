\set ON_ERROR_STOP on

-- Disposable PostgreSQL fixture for the atomic paying-for operation. The
-- caller must run the full migration chain first (see run-isolated-checks.ps1)
-- against the dedicated acceptance cluster on port 55439.
CREATE EXTENSION IF NOT EXISTS dblink;

BEGIN;
SET LOCAL timezone = 'UTC';
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000011', 'financial-a@example.invalid', '{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000011', 'Financial fixture A')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.financial_accounts(
  id, user_id, name, type, opening_balance_minor
) VALUES (
  'aaaaaaaa-1000-4000-8000-000000000011',
  'aaaaaaaa-0000-4000-8000-000000000011',
  'Financial fixture account', 'cash', 100000
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.people(id, user_id, name) VALUES (
  'aaaaaaaa-3000-4000-8000-000000000011',
  'aaaaaaaa-0000-4000-8000-000000000011',
  'Fixture borrower'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.debts(
  id, user_id, person_id, type, original_amount, remaining_amount,
  status, counterparty_name
) VALUES
  (
    'aaaaaaaa-4000-4000-8000-000000000011',
    'aaaaaaaa-0000-4000-8000-000000000011',
    'aaaaaaaa-3000-4000-8000-000000000011',
    'lend', 1000, 1000, 'active', 'Fixture borrower'
  ),
  (
    'aaaaaaaa-4000-4000-8000-000000000012',
    'aaaaaaaa-0000-4000-8000-000000000011',
    'aaaaaaaa-3000-4000-8000-000000000011',
    'lend', 500, 500, 'active', 'Fixture rollback borrower'
  ),
  (
    'aaaaaaaa-4000-4000-8000-000000000013',
    'aaaaaaaa-0000-4000-8000-000000000011',
    'aaaaaaaa-3000-4000-8000-000000000011',
    'lend', 600, 600, 'active', 'Fixture concurrency borrower'
  )
ON CONFLICT (id) DO NOTHING;
COMMIT;

-- Concurrency uses two independent PostgreSQL sessions. The first session
-- holds the debt row lock briefly, then both sessions attempt different
-- operation ids against the same remaining principal. Exactly one payment can
-- commit; the other must observe the locked, reduced remainder and roll back.
DO $$
DECLARE
  v_db TEXT := current_database();
  v_conn TEXT := format('host=127.0.0.1 port=55439 dbname=%s user=postgres', v_db);
  v_first TEXT := 'financial_fixture_first';
  v_second TEXT := 'financial_fixture_second';
  v_first_results INTEGER := 0;
  v_second_failed BOOLEAN := FALSE;
BEGIN
  PERFORM dblink_connect(v_first, v_conn);
  PERFORM dblink_connect(v_second, v_conn);
  PERFORM dblink_exec(v_first, 'SET ROLE authenticated');
  PERFORM dblink_exec(v_second, 'SET ROLE authenticated');
  PERFORM dblink_exec(
    v_first,
    $$SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000011', false)$$
  );
  PERFORM dblink_exec(
    v_second,
    $$SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000011', false)$$
  );

  PERFORM dblink_send_query(
    v_first,
    $$BEGIN;
      SELECT id FROM public.debts
      WHERE id = 'aaaaaaaa-4000-4000-8000-000000000013'::uuid FOR UPDATE;
      SELECT pg_sleep(0.35);
      SELECT public.create_paying_for_operation(
        'aaaaaaaa-5000-4000-8000-000000000011'::uuid,
        'aaaaaaaa-1000-4000-8000-000000000011'::uuid,
        400, 400,
        'aaaaaaaa-4000-4000-8000-000000000013'::uuid,
        '2026-09-08T04:00:00Z'::timestamptz,
        NULL, NULL, 'Concurrent shop', 'Concurrent first', 'Thu ho concurrent first'
      );
      COMMIT$$
  );
  PERFORM dblink_send_query(
    v_second,
    $$SELECT public.create_paying_for_operation(
        'aaaaaaaa-5000-4000-8000-000000000012'::uuid,
        'aaaaaaaa-1000-4000-8000-000000000011'::uuid,
        400, 400,
        'aaaaaaaa-4000-4000-8000-000000000013'::uuid,
        '2026-09-08T04:01:00Z'::timestamptz,
        NULL, NULL, 'Concurrent shop', 'Concurrent second', 'Thu ho concurrent second'
      )$$
  );

  WHILE dblink_is_busy(v_first) LOOP
    PERFORM pg_sleep(0.02);
  END LOOP;
  FOR i IN 1..8 LOOP
    PERFORM 1 FROM dblink_get_result(v_first) AS result(value TEXT);
  END LOOP;
  WHILE dblink_is_busy(v_second) LOOP
    PERFORM pg_sleep(0.02);
  END LOOP;
  BEGIN
    PERFORM 1 FROM dblink_get_result(v_second) AS result(value TEXT);
  EXCEPTION WHEN OTHERS THEN
    v_second_failed := TRUE;
  END;
  PERFORM dblink_disconnect(v_first);
  PERFORM dblink_disconnect(v_second);

  SELECT count(*) INTO v_first_results
  FROM public.financial_operations
  WHERE operation_id IN (
    'aaaaaaaa-5000-4000-8000-000000000011'::uuid,
    'aaaaaaaa-5000-4000-8000-000000000012'::uuid
  );
  IF v_first_results <> 1 OR NOT v_second_failed THEN
    RAISE EXCEPTION 'Concurrency did not serialize payments: committed=%, second_failed=%',
      v_first_results, v_second_failed;
  END IF;
  IF (SELECT remaining_amount FROM public.debts
      WHERE id = 'aaaaaaaa-4000-4000-8000-000000000013') <> 200 THEN
    RAISE EXCEPTION 'Concurrency overpaid the debt';
  END IF;
  RAISE NOTICE 'PASS: concurrent debt lock allows one payment and rejects the overpayment';
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000011', false);

DO $$
DECLARE
  v_result JSONB;
  v_retry JSONB;
  v_blocked BOOLEAN := FALSE;
  v_before_transactions BIGINT;
  v_before_entries BIGINT;
  v_before_payments BIGINT;
  v_before_operations BIGINT;
  v_summary RECORD;
  v_category_total BIGINT;
BEGIN
  -- Successful operation: full purchase is consumer expense; reimbursement is
  -- principal income and therefore excluded from consumption reports.
  v_result := public.create_paying_for_operation(
    'aaaaaaaa-5000-4000-8000-000000000013'::uuid,
    'aaaaaaaa-1000-4000-8000-000000000011'::uuid,
    1000, 600,
    'aaaaaaaa-4000-4000-8000-000000000011'::uuid,
    '2026-09-08T04:02:00Z'::timestamptz,
    NULL, NULL, 'Main shop', 'Main purchase', 'Thu ho main'
  );
  IF v_result->>'success' <> 'true'
    OR (v_result->>'consumer_expense_amount_minor')::BIGINT <> 1000
    OR (v_result->>'remaining_amount')::BIGINT <> 400 THEN
    RAISE EXCEPTION 'Successful paying-for result is incorrect: %', v_result;
  END IF;
  IF (SELECT metadata->>'is_debt_principal' FROM public.transactions
      WHERE id = (v_result->>'expense_transaction_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Paying-for expense was incorrectly marked as principal';
  END IF;
  IF (SELECT metadata->>'is_debt_principal' FROM public.transactions
      WHERE id = (v_result->>'income_transaction_id')::uuid) <> 'true' THEN
    RAISE EXCEPTION 'Reimbursement income is missing principal metadata';
  END IF;

  -- Same payload and key must return the same rows without inserting again.
  v_retry := public.create_paying_for_operation(
    'aaaaaaaa-5000-4000-8000-000000000013'::uuid,
    'aaaaaaaa-1000-4000-8000-000000000011'::uuid,
    1000, 600,
    'aaaaaaaa-4000-4000-8000-000000000011'::uuid,
    '2026-09-08T04:02:00Z'::timestamptz,
    NULL, NULL, 'Main shop', 'Main purchase', 'Thu ho main'
  );
  IF v_retry->>'idempotent' <> 'true'
    OR v_retry->>'expense_transaction_id' <> v_result->>'expense_transaction_id'
    OR v_retry->>'income_transaction_id' <> v_result->>'income_transaction_id' THEN
    RAISE EXCEPTION 'Same-key retry was not idempotent: %', v_retry;
  END IF;

  -- A key cannot be reused for a different request payload.
  v_blocked := FALSE;
  BEGIN
    PERFORM public.create_paying_for_operation(
      'aaaaaaaa-5000-4000-8000-000000000013'::uuid,
      'aaaaaaaa-1000-4000-8000-000000000011'::uuid,
      1000, 601,
      'aaaaaaaa-4000-4000-8000-000000000011'::uuid,
      '2026-09-08T04:02:00Z'::timestamptz,
      NULL, NULL, 'Main shop', 'Main purchase', 'Thu ho main'
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Payload mismatch was accepted'; END IF;

  -- Late failure must roll back the operation record and every dependent row.
  SELECT count(*) INTO v_before_transactions FROM public.transactions;
  SELECT count(*) INTO v_before_entries FROM public.transaction_entries;
  SELECT count(*) INTO v_before_payments FROM public.debt_payments;
  SELECT count(*) INTO v_before_operations FROM public.financial_operations;
  v_blocked := FALSE;
  BEGIN
    PERFORM public.create_paying_for_operation(
      'aaaaaaaa-5000-4000-8000-000000000014'::uuid,
      'aaaaaaaa-1000-4000-8000-000000000011'::uuid,
      500, 600,
      'aaaaaaaa-4000-4000-8000-000000000012'::uuid,
      '2026-09-08T04:03:00Z'::timestamptz,
      NULL, NULL, 'Rollback shop', 'Rollback purchase', 'Thu ho rollback'
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Expected overpayment failure'; END IF;
  IF (SELECT count(*) FROM public.transactions) <> v_before_transactions
    OR (SELECT count(*) FROM public.transaction_entries) <> v_before_entries
    OR (SELECT count(*) FROM public.debt_payments) <> v_before_payments
    OR (SELECT count(*) FROM public.financial_operations) <> v_before_operations
    OR (SELECT remaining_amount FROM public.debts
        WHERE id = 'aaaaaaaa-4000-4000-8000-000000000012') <> 500 THEN
    RAISE EXCEPTION 'Late failure left partial paying-for rows';
  END IF;

  SELECT * INTO v_summary
  FROM public.get_transactions_summary('2026-09-08', '2026-09-08');
  IF v_summary.total_income <> 0 OR v_summary.total_expense <> 1400 THEN
    RAISE EXCEPTION 'Consumption summary incorrectly excludes expense or includes principal: %', v_summary;
  END IF;
  SELECT COALESCE(SUM(total_amount), 0)::BIGINT INTO v_category_total
  FROM public.get_category_expenses_breakdown('2026-09-08', '2026-09-08');
  IF v_category_total <> 1400 THEN
    RAISE EXCEPTION 'Category expense aggregate incorrectly excludes paying-for expense: %', v_category_total;
  END IF;
  RAISE NOTICE 'PASS: atomic rollback, idempotency, payload conflict, principal-only reimbursement, and reporting';
END;
$$;

RESET ROLE;
