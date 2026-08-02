-- ================================================================
-- M4 perf RPCs: gộp N+1 query vào 1 round-trip
-- ================================================================

-- ------------------------------------------------------------
-- 1) listAccountsWithBalances: trả về accounts + balance 1 lần
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_accounts_with_balances(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  type account_type,
  currency TEXT,
  opening_balance_minor BIGINT,
  color TEXT,
  icon TEXT,
  institution_name TEXT,
  include_in_net_worth BOOLEAN,
  is_archived BOOLEAN,
  version INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  balance_minor BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fa.id,
    fa.user_id,
    fa.name,
    fa.type,
    fa.currency::TEXT,
    fa.opening_balance_minor,
    fa.color,
    fa.icon,
    fa.institution_name,
    fa.include_in_net_worth,
    fa.is_archived,
    fa.version,
    fa.created_at,
    fa.updated_at,
    calculate_account_balance(fa.id) AS balance_minor
  FROM financial_accounts fa
  WHERE fa.user_id = p_user_id
    AND fa.is_archived = FALSE
  ORDER BY fa.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION list_accounts_with_balances(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accounts_with_balances(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2) getMonthlyHistory: trả về income/expense cho N tháng gần nhất
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_monthly_history(
  p_user_id UUID,
  p_months INTEGER DEFAULT 6
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
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_month DATE;
BEGIN
  FOR i IN REVERSE (p_months - 1)..0 LOOP
    v_month := date_trunc('month', v_today - (i || ' months')::interval)::DATE;
    period_start := v_month;
    period_end := (v_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount_minor ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END), 0),
      COUNT(*)::BIGINT
    INTO
      total_income,
      total_expense,
      transaction_count
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.status != 'voided'
      AND t.occurred_at >= v_month
      AND t.occurred_at <  (v_month + INTERVAL '1 month');
    net_change := total_income - total_expense;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION get_monthly_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_monthly_history(UUID, INTEGER) TO authenticated;