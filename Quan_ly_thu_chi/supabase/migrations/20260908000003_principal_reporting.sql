-- Preserve posted-only and ownership while excluding debt principal from consumer reports.
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
      AND COALESCE(t.metadata->>'is_debt_principal', 'false') <> 'true'
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
      AND COALESCE(t.metadata->>'is_debt_principal', 'false') <> 'true'
    AND t.type IN ('income', 'expense')
    AND t.occurred_at >= v_start_tz AND t.occurred_at < v_end_tz
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_global_category_id IS NULL OR t.global_category_id = p_global_category_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT) TO authenticated;

