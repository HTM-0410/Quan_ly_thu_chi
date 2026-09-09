-- Acceptance hardening for ISSUE-ACC-001..008.
-- This migration is local/source-only. It does not apply or alter any remote data.

-- -----------------------------------------------------------------------------
-- Atomic/idempotent manual transaction creation
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_manual_transaction(UUID, transaction_type, UUID, BIGINT, CHAR, TIMESTAMPTZ, UUID, TEXT, TEXT, transaction_source);
DROP FUNCTION IF EXISTS public.create_manual_transaction(UUID, transaction_type, UUID, BIGINT, CHAR, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, transaction_source);

CREATE OR REPLACE FUNCTION public.create_manual_transaction(
  p_client_generated_id UUID,
  p_type transaction_type,
  p_account_id UUID,
  p_amount_minor BIGINT,
  p_currency CHAR(3) DEFAULT 'VND',
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_global_category_id UUID DEFAULT NULL,
  p_payee TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_source transaction_source DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_transaction_id UUID;
  v_existing transactions;
  v_entry_amount BIGINT;
  v_occurred_at TIMESTAMPTZ := COALESCE(p_occurred_at, NOW());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;
  IF p_type NOT IN ('income', 'expense', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'Unsupported manual transaction type';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.financial_accounts
  WHERE id = p_account_id;
  IF NOT FOUND OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Account not found or does not belong to user';
  END IF;
  v_user_id := auth.uid();

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
  IF p_category_id IS NOT NULL AND p_global_category_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only one category scope may be supplied';
  END IF;

  v_entry_amount := CASE WHEN p_type IN ('income', 'refund')
    THEN p_amount_minor ELSE -p_amount_minor END;

  -- Serialize requests that reuse the same operation key. This closes the
  -- select-then-insert race without changing the caller's key on retry.
  IF p_client_generated_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_user_id::TEXT || ':' || p_client_generated_id::TEXT, 0)
    );

    SELECT * INTO v_existing
    FROM public.transactions
    WHERE user_id = v_user_id
      AND client_generated_id = p_client_generated_id;

    IF FOUND THEN
      IF v_existing.type IS DISTINCT FROM p_type
        OR v_existing.amount_minor IS DISTINCT FROM p_amount_minor
        OR v_existing.currency IS DISTINCT FROM p_currency
        OR v_existing.occurred_at IS DISTINCT FROM v_occurred_at
        OR v_existing.category_id IS DISTINCT FROM p_category_id
        OR v_existing.global_category_id IS DISTINCT FROM p_global_category_id
        OR v_existing.payee IS DISTINCT FROM p_payee
        OR v_existing.note IS DISTINCT FROM p_note
        OR v_existing.source IS DISTINCT FROM p_source
        OR v_existing.status IS DISTINCT FROM 'posted'::transaction_status
        OR NOT EXISTS (
          SELECT 1 FROM public.transaction_entries
          WHERE transaction_id = v_existing.id
            AND account_id = p_account_id
            AND amount_minor = v_entry_amount
        )
      THEN
        RAISE EXCEPTION 'Idempotency key already used with a different payload';
      END IF;
      RETURN v_existing.id;
    END IF;
  END IF;

  INSERT INTO public.transactions (
    user_id, type, status, occurred_at, amount_minor, currency,
    category_id, global_category_id, payee, note, source,
    client_generated_id, classification_status
  ) VALUES (
    v_user_id, p_type, 'posted', v_occurred_at, p_amount_minor, p_currency,
    p_category_id, p_global_category_id, p_payee, p_note, p_source,
    p_client_generated_id, 'confirmed'
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
  VALUES (v_transaction_id, p_account_id, v_entry_amount);

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_transaction(UUID, transaction_type, UUID, BIGINT, CHAR, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, transaction_source) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_transaction(UUID, transaction_type, UUID, BIGINT, CHAR, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, transaction_source) TO authenticated;

-- -----------------------------------------------------------------------------
-- Posted-only balances and user-bound reporting RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_account_balance(p_account_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_opening_balance BIGINT;
  v_entries_total BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT user_id, opening_balance_minor INTO v_owner, v_opening_balance
  FROM public.financial_accounts WHERE id = p_account_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Account not found or does not belong to user';
  END IF;

  SELECT COALESCE(SUM(te.amount_minor), 0) INTO v_entries_total
  FROM public.transaction_entries te
  JOIN public.transactions t ON t.id = te.transaction_id
  WHERE te.account_id = p_account_id AND t.status = 'posted';
  RETURN COALESCE(v_opening_balance, 0) + COALESCE(v_entries_total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_net_worth(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'User scope must match the authenticated user';
  END IF;
  SELECT COALESCE(SUM(public.calculate_account_balance(fa.id)), 0)
  INTO v_total
  FROM public.financial_accounts fa
  WHERE fa.user_id = auth.uid()
    AND fa.include_in_net_worth = TRUE
    AND fa.is_archived = FALSE;
  RETURN v_total;
END;
$$;

DROP FUNCTION IF EXISTS public.list_accounts_with_balances(UUID);
CREATE OR REPLACE FUNCTION public.list_accounts_with_balances(
  p_user_id UUID,
  p_include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID, user_id UUID, name TEXT, type account_type, currency TEXT,
  opening_balance_minor BIGINT, color TEXT, icon TEXT, institution_name TEXT,
  include_in_net_worth BOOLEAN, is_archived BOOLEAN, version INTEGER,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, balance_minor BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'User scope must match the authenticated user';
  END IF;
  RETURN QUERY
  SELECT fa.id, fa.user_id, fa.name, fa.type, fa.currency::TEXT,
    fa.opening_balance_minor, fa.color, fa.icon, fa.institution_name,
    fa.include_in_net_worth, fa.is_archived, fa.version, fa.created_at,
    fa.updated_at, public.calculate_account_balance(fa.id)
  FROM public.financial_accounts fa
  WHERE fa.user_id = auth.uid()
    AND (p_include_archived OR fa.is_archived = FALSE)
  ORDER BY fa.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accounts_with_balances(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_accounts_with_balances(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.calculate_account_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_account_balance(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.calculate_net_worth(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_net_worth(UUID) TO authenticated;
ALTER FUNCTION public.get_account_balance(UUID) SET search_path = public;
ALTER FUNCTION public.get_net_worth() SET search_path = public;
REVOKE ALL ON FUNCTION public.get_account_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_balance(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_net_worth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_net_worth() TO authenticated;

DROP FUNCTION IF EXISTS public.get_monthly_history(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_monthly_history(
  p_user_id UUID,
  p_months INTEGER DEFAULT 6,
  p_timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'
)
RETURNS TABLE (
  period_start DATE, period_end DATE, total_income BIGINT,
  total_expense BIGINT, net_change BIGINT, transaction_count BIGINT
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
  IF p_months < 1 OR p_months > 60 THEN
    RAISE EXCEPTION 'Invalid month count';
  END IF;
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
      AND t.occurred_at >= v_start_tz
      AND t.occurred_at < v_end_tz;
    net_change := total_income - total_expense;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_history(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_history(UUID, INTEGER, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.get_transactions_summary(DATE, DATE, UUID);
DROP FUNCTION IF EXISTS public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.get_transactions_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_category_id UUID DEFAULT NULL,
  p_global_category_id UUID DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'
)
RETURNS TABLE (total_income BIGINT, total_expense BIGINT, net_change BIGINT, transaction_count BIGINT)
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
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor WHEN t.type = 'expense' THEN -t.amount_minor ELSE 0 END), 0)::BIGINT,
    COUNT(t.id)::BIGINT
  FROM public.transactions t
  WHERE t.user_id = auth.uid()
    AND t.status = 'posted'
    AND t.type IN ('income', 'expense')
    AND t.occurred_at >= v_start_tz AND t.occurred_at < v_end_tz
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_global_category_id IS NULL OR t.global_category_id = p_global_category_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.get_budget_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.get_budget_progress(
  p_budget_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS TABLE (
  budget_id UUID, period_start TIMESTAMPTZ, period_end TIMESTAMPTZ,
  spent_minor BIGINT, transaction_count BIGINT, percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount_minor BIGINT;
  v_has_categories BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT amount_minor INTO v_amount_minor FROM public.budgets
  WHERE id = p_budget_id AND user_id = auth.uid();
  IF v_amount_minor IS NULL THEN RAISE EXCEPTION 'Budget not found'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.budget_categories WHERE budget_id = p_budget_id)
  INTO v_has_categories;

  RETURN QUERY
  WITH RECURSIVE target_categories AS (
    SELECT bc.category_id AS id FROM public.budget_categories bc
    WHERE bc.budget_id = p_budget_id
    UNION
    SELECT c.id FROM public.categories c
    JOIN target_categories tc ON c.parent_id = tc.id
  )
  SELECT p_budget_id, p_period_start, p_period_end,
    COALESCE(SUM(t.amount_minor), 0)::BIGINT, COUNT(t.id)::BIGINT,
    CASE WHEN v_amount_minor > 0
      THEN ROUND((COALESCE(SUM(t.amount_minor), 0)::NUMERIC / v_amount_minor) * 100, 2)
      ELSE 0 END
  FROM public.transactions t
  WHERE t.user_id = auth.uid()
    AND t.status = 'posted'
    AND t.type = 'expense'
    AND t.occurred_at >= p_period_start AND t.occurred_at < p_period_end
    AND (t.metadata->>'is_debt_principal' IS NULL OR t.metadata->>'is_debt_principal' <> 'true')
    AND (NOT v_has_categories OR t.category_id IN (SELECT id FROM target_categories));
END;
$$;

REVOKE ALL ON FUNCTION public.get_budget_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_budget_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Category usage is also an aggregate: pending rows are not usage in executed
-- financial statistics, and the explicit user argument must be authenticated.
CREATE OR REPLACE FUNCTION public.get_category_usage_count(p_category_id UUID, p_user_id UUID)
RETURNS TABLE (direct_count BIGINT, tree_count BIGINT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'User scope must match the authenticated user';
  END IF;
  RETURN QUERY
  WITH RECURSIVE tree AS (
    SELECT id FROM public.categories WHERE id = p_category_id AND user_id = auth.uid()
    UNION ALL
    SELECT c.id FROM public.categories c JOIN tree t ON c.parent_id = t.id
  )
  SELECT
    (SELECT COUNT(*) FROM public.transactions t
      WHERE t.user_id = auth.uid() AND t.status = 'posted'
        AND (t.category_id = p_category_id OR t.global_category_id = p_category_id)),
    (SELECT COUNT(*) FROM public.transactions t
      JOIN tree tr ON (t.category_id = tr.id OR t.global_category_id = tr.id)
      WHERE t.user_id = auth.uid() AND t.status = 'posted');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_category_usage_counts(p_category_ids UUID[], p_user_id UUID)
RETURNS TABLE (category_id UUID, direct_count BIGINT, tree_count BIGINT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'User scope must match the authenticated user';
  END IF;
  RETURN QUERY
  WITH RECURSIVE
  classified AS (
    SELECT pc.id AS cat_id, (g.id IS NOT NULL) AS is_global
    FROM unnest(p_category_ids) AS pc(id)
    LEFT JOIN public.categories c ON c.id = pc.id
    LEFT JOIN public.global_categories g ON g.id = pc.id
  ),
  user_descendants AS (
    SELECT c.id AS cha_id, c.id AS descendant_id
    FROM classified cf JOIN public.categories c ON cf.cat_id = c.id
    WHERE NOT cf.is_global AND c.user_id = auth.uid()
    UNION
    SELECT parent.id, child.id
    FROM public.categories parent JOIN public.categories child ON child.parent_id = parent.id
    WHERE parent.user_id = auth.uid()
      AND parent.id IN (SELECT cat_id FROM classified WHERE NOT is_global)
  ),
  global_descendants AS (
    SELECT g.id, g.id FROM classified cf JOIN public.global_categories g ON cf.cat_id = g.id
    WHERE cf.is_global AND g.is_active
    UNION
    SELECT parent.id, child.id
    FROM public.global_categories parent JOIN public.global_categories child
      ON child.parent_id = parent.id AND child.is_active
    WHERE parent.is_active
      AND parent.id IN (SELECT cat_id FROM classified WHERE is_global)
  ),
  all_desc AS (
    SELECT * FROM user_descendants UNION ALL SELECT * FROM global_descendants
  ),
  tx_by_desc AS (
    SELECT d.cha_id, d.descendant_id, COUNT(t.id) AS cnt
    FROM all_desc d
    LEFT JOIN public.transactions t ON
      (d.descendant_id = t.category_id OR d.descendant_id = t.global_category_id)
      AND t.user_id = auth.uid() AND t.status = 'posted'
    GROUP BY d.cha_id, d.descendant_id
  )
  SELECT txd.cha_id,
    COALESCE(SUM(txd.cnt) FILTER (WHERE txd.cha_id = txd.descendant_id), 0)::BIGINT,
    COALESCE(SUM(txd.cnt), 0)::BIGINT
  FROM tx_by_desc txd
  GROUP BY txd.cha_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_category_usage_count(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_usage_count(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_category_usage_counts(UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_usage_counts(UUID[], UUID) TO authenticated;

ALTER FUNCTION public.get_category_expenses_breakdown(DATE, DATE, TEXT) SET search_path = public;
REVOKE ALL ON FUNCTION public.get_category_expenses_breakdown(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_expenses_breakdown(DATE, DATE, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Atomic debt settlement and idempotency
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_debt_payment ON public.debt_payments;
DROP TRIGGER IF EXISTS trg_update_remaining_amount ON public.debt_payments;
DROP TRIGGER IF EXISTS trigger_update_debt_remaining ON public.debt_payments;
DROP TRIGGER IF EXISTS trg_debt_payment_update_remaining ON public.debt_payments;

CREATE OR REPLACE FUNCTION public.update_debt_remaining_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining BIGINT;
  v_payment_type TEXT := COALESCE(NEW.payment_type, 'payment');
BEGIN
  SELECT remaining_amount INTO v_remaining FROM public.debts WHERE id = NEW.debt_id FOR UPDATE;
  IF v_remaining IS NULL THEN RAISE EXCEPTION 'Invalid debt_id'; END IF;
  IF v_payment_type <> 'interest' THEN v_remaining := v_remaining - NEW.amount; END IF;
  IF v_remaining < 0 THEN RAISE EXCEPTION 'Payment would cause negative remaining balance'; END IF;
  UPDATE public.debts SET remaining_amount = v_remaining,
    status = CASE WHEN v_remaining = 0 THEN 'paid' ELSE status END,
    updated_at = NOW() WHERE id = NEW.debt_id;
  BEGIN
    INSERT INTO public.debt_audit_log (debt_id, action, amount, payment_type, note)
    VALUES (NEW.debt_id, 'payment', NEW.amount, v_payment_type, COALESCE(NEW.notes, NEW.note));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_debt_payment_update_remaining
AFTER INSERT ON public.debt_payments
FOR EACH ROW EXECUTE FUNCTION public.update_debt_remaining_on_payment();

DROP FUNCTION IF EXISTS public.settle_debt_payment(UUID, UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.settle_debt_payment(
  p_debt_id UUID,
  p_account_id UUID,
  p_amount_minor BIGINT,
  p_payment_date TIMESTAMPTZ DEFAULT NOW(),
  p_note TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debt public.debts;
  v_account_owner UUID;
  v_existing public.transactions;
  v_payment_id UUID;
  v_transaction_id UUID;
  v_remaining_after BIGINT;
  v_expected_type transaction_type;
  v_expected_entry BIGINT;
  v_payment_date TIMESTAMPTZ := COALESCE(p_payment_date, NOW());
  v_expected_note TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_debt FROM public.debts
  WHERE id = p_debt_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debt not found or permission denied'; END IF;

  v_expected_type := CASE WHEN v_debt.type = 'lend' THEN 'income'::transaction_type ELSE 'expense'::transaction_type END;
  v_expected_entry := CASE WHEN v_debt.type = 'lend' THEN p_amount_minor ELSE -p_amount_minor END;
  v_expected_note := COALESCE(p_note, CASE WHEN v_debt.type = 'lend'
    THEN 'Thu hồi nợ: ' || v_debt.counterparty_name
    ELSE 'Trả nợ: ' || v_debt.counterparty_name END);

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.transactions
    WHERE user_id = auth.uid() AND client_generated_id = p_idempotency_key;
    IF FOUND THEN
      SELECT te.account_id INTO v_account_owner
      FROM public.transaction_entries te
      WHERE te.transaction_id = v_existing.id AND te.account_id = p_account_id
        AND te.amount_minor = v_expected_entry;
      IF v_existing.type IS DISTINCT FROM v_expected_type
        OR v_existing.amount_minor IS DISTINCT FROM p_amount_minor
        OR v_existing.occurred_at IS DISTINCT FROM v_payment_date
        OR v_existing.note IS DISTINCT FROM v_expected_note
        OR v_existing.metadata->>'debt_id' IS DISTINCT FROM p_debt_id::TEXT
        OR v_account_owner IS NULL
      THEN
        RAISE EXCEPTION 'Idempotency key already used with a different payload';
      END IF;
      v_payment_id := NULLIF(v_existing.metadata->>'debt_payment_id', '')::UUID;
      IF v_payment_id IS NULL THEN RAISE EXCEPTION 'Existing settlement has no payment linkage'; END IF;
      RETURN jsonb_build_object(
        'success', TRUE, 'payment_id', v_payment_id, 'transaction_id', v_existing.id,
        'remaining_amount', v_debt.remaining_amount,
        'status', CASE WHEN v_debt.remaining_amount = 0 THEN 'paid' ELSE 'active' END,
        'idempotent', TRUE
      );
    END IF;
  END IF;

  IF v_debt.status = 'paid' OR v_debt.remaining_amount <= 0 THEN
    RAISE EXCEPTION 'Khoản nợ này đã được thanh toán hết';
  END IF;
  IF p_amount_minor <= 0 OR p_amount_minor > v_debt.remaining_amount THEN
    RAISE EXCEPTION 'Số tiền thanh toán không hợp lệ hoặc vượt quá số nợ còn lại';
  END IF;
  SELECT user_id INTO v_account_owner FROM public.financial_accounts
  WHERE id = p_account_id;
  IF v_account_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Account not found or does not belong to user';
  END IF;

  INSERT INTO public.debt_payments (
    user_id, debt_id, amount, payment_date, payment_type, note, notes
  ) VALUES (
    auth.uid(), p_debt_id, p_amount_minor, v_payment_date, 'principal', p_note, p_note
  ) RETURNING id INTO v_payment_id;

  SELECT remaining_amount INTO v_remaining_after FROM public.debts WHERE id = p_debt_id;
  INSERT INTO public.transactions (
    user_id, type, status, occurred_at, amount_minor, currency, payee, note,
    source, client_generated_id, classification_status, metadata
  ) VALUES (
    auth.uid(), v_expected_type, 'posted', v_payment_date, p_amount_minor, 'VND',
    v_debt.counterparty_name, v_expected_note, 'manual', p_idempotency_key, 'confirmed',
    jsonb_build_object('debt_id', p_debt_id, 'debt_payment_id', v_payment_id,
      'debt_type', v_debt.type, 'is_debt_principal', TRUE)
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
  VALUES (v_transaction_id, p_account_id, v_expected_entry);

  RETURN jsonb_build_object(
    'success', TRUE, 'payment_id', v_payment_id, 'transaction_id', v_transaction_id,
    'remaining_amount', v_remaining_after,
    'status', CASE WHEN v_remaining_after = 0 THEN 'paid' ELSE 'active' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_debt_payment(UUID, UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_debt_payment(UUID, UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Recurring pending/confirm lifecycle
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_recurring_rules(
  p_up_to TIMESTAMPTZ DEFAULT NOW(), p_max_rules INTEGER DEFAULT 50
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_current_next TIMESTAMPTZ;
  v_target_day INTEGER;
  v_step_months INTEGER;
  v_base_date TIMESTAMPTZ;
  v_last_day INTEGER;
  v_actual_day INTEGER;
  v_count INTEGER := 0;
  v_tx_id UUID;
  v_client_id UUID;
  v_rule_ended BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_max_rules < 1 OR p_max_rules > 500 THEN RAISE EXCEPTION 'Invalid rule limit'; END IF;
  FOR v_rule IN
    SELECT * FROM public.recurring_rules
    WHERE user_id = auth.uid() AND status = 'active' AND next_occurrence <= p_up_to
    ORDER BY next_occurrence LIMIT p_max_rules FOR UPDATE
  LOOP
    v_current_next := v_rule.next_occurrence;
    v_target_day := COALESCE(v_rule.day_of_month, EXTRACT(DAY FROM v_rule.start_date)::INTEGER);
    v_rule_ended := FALSE;
    WHILE v_current_next <= p_up_to LOOP
      IF v_rule.end_date IS NOT NULL AND (v_current_next AT TIME ZONE 'UTC')::DATE > v_rule.end_date THEN
        v_rule_ended := TRUE;
        EXIT;
      END IF;
      v_client_id := CAST(MD5(v_rule.id::TEXT || ':' || TO_CHAR(v_current_next AT TIME ZONE 'UTC', 'YYYY-MM-DD')) AS UUID);
      SELECT id INTO v_tx_id FROM public.transactions
      WHERE user_id = auth.uid() AND client_generated_id = v_client_id;
      IF v_tx_id IS NULL THEN
        INSERT INTO public.transactions (
          user_id, type, status, amount_minor, currency, occurred_at,
          category_id, global_category_id, payee, note, source, client_generated_id
        ) VALUES (
          v_rule.user_id, v_rule.type, 'pending', v_rule.amount_minor, v_rule.currency,
          v_current_next, v_rule.category_id, v_rule.global_category_id,
          v_rule.payee, v_rule.note, 'recurring', v_client_id
        ) RETURNING id INTO v_tx_id;
        INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
        VALUES (v_tx_id, v_rule.account_id,
          CASE WHEN v_rule.type IN ('income', 'refund') THEN v_rule.amount_minor ELSE -v_rule.amount_minor END);
        v_count := v_count + 1;
      END IF;

      IF v_rule.frequency = 'daily' THEN
        v_current_next := v_current_next + INTERVAL '1 day';
      ELSIF v_rule.frequency = 'weekly' THEN
        v_current_next := v_current_next + INTERVAL '7 days';
      ELSIF v_rule.frequency = 'biweekly' THEN
        v_current_next := v_current_next + INTERVAL '14 days';
      ELSE
        v_step_months := CASE v_rule.frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END;
        v_base_date := DATE_TRUNC('month', v_current_next AT TIME ZONE 'UTC') + (v_step_months || ' month')::INTERVAL;
        v_last_day := EXTRACT(DAY FROM DATE_TRUNC('month', v_base_date) + INTERVAL '1 month - 1 day')::INTEGER;
        v_actual_day := LEAST(v_target_day, v_last_day);
        v_current_next := DATE_TRUNC('month', v_base_date)
          + ((v_actual_day - 1) || ' days')::INTERVAL + (v_rule.next_occurrence::TIME);
      END IF;
    END LOOP;

    IF v_rule_ended THEN
      UPDATE public.recurring_rules SET status = 'ended', next_occurrence = v_current_next,
        updated_at = NOW(), version = version + 1 WHERE id = v_rule.id;
    ELSE
      UPDATE public.recurring_rules SET next_occurrence = v_current_next,
        last_occurrence = CASE WHEN v_count > 0 THEN NOW() ELSE last_occurrence END,
        updated_at = NOW(), version = version + 1 WHERE id = v_rule.id;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_recurring_transaction(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status transaction_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT status INTO v_status FROM public.transactions
  WHERE id = p_transaction_id AND user_id = auth.uid() AND source = 'recurring' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring transaction not found'; END IF;
  IF v_status = 'posted' THEN RETURN TRUE; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Only pending recurring transactions can be confirmed'; END IF;
  UPDATE public.transactions SET status = 'posted', updated_at = NOW(), version = version + 1
  WHERE id = p_transaction_id AND user_id = auth.uid();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_recurring_transaction(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status transaction_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT status INTO v_status FROM public.transactions
  WHERE id = p_transaction_id AND user_id = auth.uid() AND source = 'recurring' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring transaction not found'; END IF;
  IF v_status = 'voided' THEN RETURN TRUE; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Only pending recurring transactions can be skipped'; END IF;
  UPDATE public.transactions SET status = 'voided', updated_at = NOW(), version = version + 1
  WHERE id = p_transaction_id AND user_id = auth.uid();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_recurring_status(
  p_rule_id UUID, p_status recurring_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.recurring_rules;
  v_next TIMESTAMPTZ;
  v_target_day INTEGER;
  v_step_months INTEGER;
  v_base_date TIMESTAMPTZ;
  v_last_day INTEGER;
  v_actual_day INTEGER;
  v_iterations INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_rule FROM public.recurring_rules
  WHERE id = p_rule_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring rule not found'; END IF;
  v_next := v_rule.next_occurrence;
  IF p_status = 'active' AND v_rule.status = 'paused' THEN
    v_target_day := COALESCE(v_rule.day_of_month, EXTRACT(DAY FROM v_rule.start_date)::INTEGER);
    WHILE v_next <= NOW() AND v_iterations < 1000 LOOP
      IF v_rule.frequency = 'daily' THEN
        v_next := v_next + INTERVAL '1 day';
      ELSIF v_rule.frequency = 'weekly' THEN
        v_next := v_next + INTERVAL '7 days';
      ELSIF v_rule.frequency = 'biweekly' THEN
        v_next := v_next + INTERVAL '14 days';
      ELSE
        v_step_months := CASE v_rule.frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END;
        v_base_date := DATE_TRUNC('month', v_next AT TIME ZONE 'UTC') + (v_step_months || ' month')::INTERVAL;
        v_last_day := EXTRACT(DAY FROM DATE_TRUNC('month', v_base_date) + INTERVAL '1 month - 1 day')::INTEGER;
        v_actual_day := LEAST(v_target_day, v_last_day);
        v_next := DATE_TRUNC('month', v_base_date) + ((v_actual_day - 1) || ' days')::INTERVAL + (v_rule.next_occurrence::TIME);
      END IF;
      v_iterations := v_iterations + 1;
    END LOOP;
  END IF;
  UPDATE public.recurring_rules SET status = p_status, next_occurrence = v_next,
    updated_at = NOW(), version = version + 1 WHERE id = p_rule_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_recurring_rules(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_rules(TIMESTAMPTZ, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.confirm_recurring_transaction(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_recurring_transaction(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.skip_recurring_transaction(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skip_recurring_transaction(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.set_recurring_status(UUID, recurring_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_recurring_status(UUID, recurring_status) TO authenticated;

-- -----------------------------------------------------------------------------
-- One OCR row (including splits) is one database transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_ocr_transaction_row(p_row_id UUID, p_splits JSONB)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_ids UUID[] := ARRAY[]::UUID[];
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_row_id IS NULL OR jsonb_typeof(p_splits) <> 'array'
    OR jsonb_array_length(p_splits) < 1 OR jsonb_array_length(p_splits) > 50 THEN
    RAISE EXCEPTION 'Invalid OCR row payload';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
    IF v_item->>'client_generated_id' IS NULL
      OR v_item->>'account_id' IS NULL
      OR v_item->>'type' IS NULL
      OR v_item->>'amount_minor' IS NULL
      OR v_item->>'occurred_at' IS NULL THEN
      RAISE EXCEPTION 'Invalid OCR split payload';
    END IF;
    v_id := public.create_manual_transaction(
      (v_item->>'client_generated_id')::UUID,
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
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ocr_transaction_row(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ocr_transaction_row(UUID, JSONB) TO authenticated;
