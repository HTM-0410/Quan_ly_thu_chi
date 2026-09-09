-- Financial retry hardening for the transaction form.
-- This migration is source-only in this task; apply it only in an isolated,
-- preflighted database.

CREATE TABLE IF NOT EXISTS public.financial_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  result_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_operations_type_check CHECK (operation_type = 'paying_for')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_operations_user_operation
  ON public.financial_operations(user_id, operation_id);

ALTER TABLE public.financial_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.financial_operations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.financial_operations TO authenticated;

DROP FUNCTION IF EXISTS public.create_paying_for_operation(
  UUID, UUID, BIGINT, BIGINT, UUID, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_paying_for_operation(
  p_operation_id UUID,
  p_account_id UUID,
  p_expense_amount_minor BIGINT,
  p_payment_amount_minor BIGINT,
  p_debt_id UUID,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_global_category_id UUID DEFAULT NULL,
  p_expense_payee TEXT DEFAULT NULL,
  p_expense_note TEXT DEFAULT NULL,
  p_payment_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_operation public.financial_operations;
  v_debt public.debts;
  v_account_owner UUID;
  v_expense_transaction_id UUID;
  v_income_transaction_id UUID;
  v_payment_id UUID;
  v_remaining_after BIGINT;
  v_occurred_at TIMESTAMPTZ := COALESCE(p_occurred_at, NOW());
  v_request_payload JSONB;
  v_result JSONB;
  v_person_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Operation id is required';
  END IF;

  -- Serialize retries and concurrent double-clicks for this user/operation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::TEXT || ':' || p_operation_id::TEXT, 0)
  );

  v_request_payload := jsonb_build_object(
    'account_id', p_account_id,
    'expense_amount_minor', p_expense_amount_minor,
    'payment_amount_minor', p_payment_amount_minor,
    'debt_id', p_debt_id,
    'occurred_at', v_occurred_at,
    'category_id', p_category_id,
    'global_category_id', p_global_category_id,
    'expense_payee', p_expense_payee,
    'expense_note', p_expense_note,
    'payment_note', p_payment_note
  );

  SELECT * INTO v_operation
  FROM public.financial_operations
  WHERE user_id = v_user_id AND operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_operation.operation_type <> 'paying_for'
      OR v_operation.request_payload IS DISTINCT FROM v_request_payload
    THEN
      RAISE EXCEPTION 'Operation id already used with a different payload';
    END IF;
    IF v_operation.result_payload IS NULL THEN
      RAISE EXCEPTION 'Operation has no confirmed result; retry with the same operation id';
    END IF;
    RETURN v_operation.result_payload || jsonb_build_object('idempotent', TRUE);
  END IF;

  IF p_expense_amount_minor <= 0 OR p_payment_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amounts must be greater than 0';
  END IF;
  IF p_payment_amount_minor > p_expense_amount_minor THEN
    RAISE EXCEPTION 'Payment cannot exceed the paying-for expense';
  END IF;
  IF p_category_id IS NOT NULL AND p_global_category_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only one category scope may be supplied';
  END IF;

  SELECT user_id INTO v_account_owner
  FROM public.financial_accounts
  WHERE id = p_account_id;
  IF v_account_owner IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Account not found or does not belong to user';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = p_category_id AND (user_id = v_user_id OR is_system = TRUE)
  ) THEN
    RAISE EXCEPTION 'Category not found or does not belong to user';
  END IF;
  IF p_global_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.global_categories
    WHERE id = p_global_category_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Global category not found or inactive';
  END IF;

  INSERT INTO public.financial_operations (
    user_id, operation_id, operation_type, request_payload
  ) VALUES (
    v_user_id, p_operation_id, 'paying_for', v_request_payload
  )
  RETURNING * INTO v_operation;

  -- A paying-for operation is lending money, so this flow accepts lend debts.
  -- The debt lock makes two concurrent reimbursements observe exact remaining
  -- principal and prevents an overpayment.
  SELECT * INTO v_debt
  FROM public.debts
  WHERE id = p_debt_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt not found or permission denied';
  END IF;
  IF v_debt.type <> 'lend' THEN
    RAISE EXCEPTION 'Paying-for requires a lend debt';
  END IF;
  IF v_debt.status = 'paid' OR v_debt.remaining_amount <= 0 THEN
    RAISE EXCEPTION 'Debt is already paid';
  END IF;
  IF p_payment_amount_minor > v_debt.remaining_amount THEN
    RAISE EXCEPTION 'Payment exceeds remaining debt';
  END IF;

  SELECT COALESCE(v_debt.counterparty_name, p.name, 'Người nợ')
  INTO v_person_name
  FROM public.people p
  WHERE p.id = v_debt.person_id;
  IF v_person_name IS NULL THEN
    v_person_name := COALESCE(v_debt.counterparty_name, 'Người nợ');
  END IF;

  -- Keep the full purchase amount in the ledger and in consumer expense
  -- reports. The reimbursement is a separate income cash flow marked as
  -- principal, so it changes the balance without inflating income.
  INSERT INTO public.transactions (
    user_id, type, status, occurred_at, amount_minor, currency,
    category_id, global_category_id, payee, note, source,
    client_generated_id, classification_status, metadata
  ) VALUES (
    v_user_id, 'expense', 'posted', v_occurred_at, p_expense_amount_minor, 'VND',
    p_category_id, p_global_category_id, p_expense_payee, p_expense_note,
    'manual', p_operation_id, 'confirmed',
    jsonb_build_object(
      'debt_id', p_debt_id,
      'operation_id', p_operation_id,
      'principal_amount_minor', p_payment_amount_minor,
      'consumer_expense_amount_minor', p_expense_amount_minor,
      'paying_for', TRUE
    )
  )
  RETURNING id INTO v_expense_transaction_id;

  INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
  VALUES (v_expense_transaction_id, p_account_id, -p_expense_amount_minor);

  INSERT INTO public.debt_payments (
    user_id, debt_id, amount, payment_date, payment_type, note, notes
  ) VALUES (
    v_user_id, p_debt_id, p_payment_amount_minor, v_occurred_at,
    'principal', p_payment_note, p_payment_note
  )
  RETURNING id INTO v_payment_id;

  SELECT remaining_amount INTO v_remaining_after
  FROM public.debts
  WHERE id = p_debt_id;

  INSERT INTO public.transactions (
    user_id, type, status, occurred_at, amount_minor, currency,
    payee, note, source, classification_status, metadata
  ) VALUES (
    v_user_id, 'income', 'posted', v_occurred_at, p_payment_amount_minor, 'VND',
    v_person_name,
    COALESCE(p_payment_note, 'Thu hộ: Trả hộ'),
    'manual', 'confirmed',
    jsonb_build_object(
      'debt_id', p_debt_id,
      'debt_payment_id', v_payment_id,
      'operation_id', p_operation_id,
      'debt_type', v_debt.type,
      'is_debt_principal', TRUE,
      'paying_for', TRUE
    )
  )
  RETURNING id INTO v_income_transaction_id;

  INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
  VALUES (v_income_transaction_id, p_account_id, p_payment_amount_minor);

  v_result := jsonb_build_object(
    'success', TRUE,
    'operation_id', p_operation_id,
    'expense_transaction_id', v_expense_transaction_id,
    'income_transaction_id', v_income_transaction_id,
    'payment_id', v_payment_id,
    'debt_id', p_debt_id,
    'consumer_expense_amount_minor', p_expense_amount_minor,
    'remaining_amount', v_remaining_after,
    'status', CASE WHEN v_remaining_after = 0 THEN 'paid' ELSE 'active' END,
    'idempotent', FALSE
  );

  UPDATE public.financial_operations
  SET result_payload = v_result, updated_at = NOW()
  WHERE id = v_operation.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_paying_for_operation(
  UUID, UUID, BIGINT, BIGINT, UUID, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_paying_for_operation(
  UUID, UUID, BIGINT, BIGINT, UUID, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT
) TO authenticated;

-- Principal cash flows change balances but are excluded from consumption and
-- income reports. Keep the established function signatures used by the web
-- client while fixing the status and principal predicates together.
CREATE OR REPLACE FUNCTION public.get_transactions_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_category_id UUID DEFAULT NULL,
  p_global_category_id UUID DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'
)
RETURNS TABLE (
  total_income BIGINT,
  total_expense BIGINT,
  net_change BIGINT,
  transaction_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_timezone TEXT;
  v_start_tz TIMESTAMPTZ;
  v_end_tz TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  v_safe_timezone := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Asia/Ho_Chi_Minh');
  BEGIN
    PERFORM NOW() AT TIME ZONE v_safe_timezone;
  EXCEPTION WHEN OTHERS THEN
    v_safe_timezone := 'UTC';
  END;
  v_start_tz := p_start_date::TIMESTAMP AT TIME ZONE v_safe_timezone;
  v_end_tz := (p_end_date + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE v_safe_timezone;
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor
      WHEN t.type = 'expense' THEN -t.amount_minor ELSE 0 END), 0)::BIGINT,
    COUNT(t.id)::BIGINT
  FROM public.transactions t
  WHERE t.user_id = auth.uid()
    AND t.status = 'posted'
    AND t.type IN ('income', 'expense')
    AND (t.metadata->>'is_debt_principal' IS NULL OR t.metadata->>'is_debt_principal' <> 'true')
    AND t.occurred_at >= v_start_tz AND t.occurred_at < v_end_tz
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_global_category_id IS NULL OR t.global_category_id = p_global_category_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_monthly_history(
  p_user_id UUID,
  p_months INTEGER DEFAULT 6,
  p_timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  total_income BIGINT,
  total_expense BIGINT,
  net_change BIGINT,
  transaction_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_local DATE;
  v_month_local DATE;
  v_start_tz TIMESTAMPTZ;
  v_end_tz TIMESTAMPTZ;
  v_safe_timezone TEXT;
  i INTEGER;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'User scope must match the authenticated user';
  END IF;
  IF p_months < 1 OR p_months > 60 THEN RAISE EXCEPTION 'Invalid month count'; END IF;
  v_safe_timezone := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Asia/Ho_Chi_Minh');
  BEGIN
    PERFORM NOW() AT TIME ZONE v_safe_timezone;
  EXCEPTION WHEN OTHERS THEN
    v_safe_timezone := 'UTC';
  END;
  v_today_local := (NOW() AT TIME ZONE v_safe_timezone)::DATE;

  FOR i IN REVERSE (p_months - 1)..0 LOOP
    v_month_local := DATE_TRUNC('month', v_today_local - (i || ' months')::INTERVAL)::DATE;
    v_start_tz := v_month_local::TIMESTAMP AT TIME ZONE v_safe_timezone;
    v_end_tz := (v_month_local + INTERVAL '1 month')::TIMESTAMP AT TIME ZONE v_safe_timezone;
    period_start := v_month_local;
    period_end := (v_month_local + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END), 0),
      COUNT(*)::BIGINT
    INTO total_income, total_expense, transaction_count
    FROM public.transactions t
    WHERE t.user_id = auth.uid()
      AND t.status = 'posted'
      AND t.type IN ('income', 'expense')
      AND (t.metadata->>'is_debt_principal' IS NULL OR t.metadata->>'is_debt_principal' <> 'true')
      AND t.occurred_at >= v_start_tz AND t.occurred_at < v_end_tz;
    net_change := total_income - total_expense;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_history(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_history(UUID, INTEGER, TEXT) TO authenticated;
