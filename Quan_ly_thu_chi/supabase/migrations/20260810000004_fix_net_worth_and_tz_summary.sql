-- ============================================================
-- Migration: M15 - Fix calculate_net_worth and get_transactions_summary timezone
-- 1. Fix F02: Credit card balances are signed negative when owing;
--    remove the minus sign inversion so credit card expense decreases net worth.
-- 2. Fix F01: get_transactions_summary uses IANA timezone for date boundaries
--    and restricts calculation to posted transactions.
-- ============================================================

-- 1) Fix calculate_net_worth
DROP FUNCTION IF EXISTS public.calculate_net_worth(UUID);

CREATE OR REPLACE FUNCTION public.calculate_net_worth(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Đã sửa: Số dư tài khoản đã được chuẩn hóa có dấu (tài sản dương, nợ thẻ âm).
  -- Không đảo dấu tài khoản credit_card nữa để tránh chi tiêu thẻ làm tăng tài sản ròng.
  SELECT COALESCE(SUM(calculate_account_balance(fa.id)), 0)
  INTO v_total
  FROM financial_accounts fa
  WHERE fa.user_id = p_user_id
    AND fa.include_in_net_worth = TRUE
    AND fa.is_archived = FALSE;

  RETURN v_total;
END;
$$;

-- 2) Fix get_transactions_summary with timezone awareness
DROP FUNCTION IF EXISTS public.get_transactions_summary(DATE, DATE, UUID);
DROP FUNCTION IF EXISTS public.get_transactions_summary(DATE, DATE, UUID, UUID, TEXT);

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
AS $$
DECLARE
  v_safe_tz TEXT;
  v_start_tz TIMESTAMPTZ;
  v_end_tz TIMESTAMPTZ;
BEGIN
  -- Kiểm tra timezone hợp lệ
  BEGIN
    PERFORM NOW() AT TIME ZONE p_timezone;
    v_safe_tz := COALESCE(p_timezone, 'Asia/Ho_Chi_Minh');
  EXCEPTION WHEN OTHERS THEN
    v_safe_tz := 'Asia/Ho_Chi_Minh';
  END;

  -- Chuyển đổi start_date 00:00:00 và end_date 23:59:59.999 local sang TIMESTAMPTZ
  v_start_tz := (p_start_date::TIMESTAMP AT TIME ZONE v_safe_tz);
  v_end_tz := ((p_end_date + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE v_safe_tz);

  RETURN QUERY
  SELECT
    COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN t.amount_minor ELSE 0 END
    ), 0)::BIGINT as total_income,
    COALESCE(SUM(
      CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END
    ), 0)::BIGINT as total_expense,
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income' THEN t.amount_minor
        WHEN t.type = 'expense' THEN -t.amount_minor
        ELSE 0
      END
    ), 0)::BIGINT as net_change,
    COUNT(t.id)::BIGINT as transaction_count
  FROM transactions t
  WHERE t.user_id = auth.uid()
    AND t.status = 'posted'
    AND t.type IN ('income', 'expense')
    AND t.occurred_at >= v_start_tz
    AND t.occurred_at < v_end_tz
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_global_category_id IS NULL OR t.global_category_id = p_global_category_id);
END;
$$;
