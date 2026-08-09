-- ================================================================
-- M5 fix: get_monthly_history timezone-aware
-- ------------------------------------------------------------
-- Bug: hàm dùng CURRENT_DATE (UTC) và date_trunc('month', ...)
-- với timezone ngầm định = UTC. Với user ở UTC+7 (VN), giao dịch
-- từ 00:00–06:59 local sẽ bị gán về tháng trước. Cũng ảnh hưởng
-- tới biên period_start khi user vừa lăn qua ngày mới theo local.
--
-- Fix: thêm p_timezone (IANA, vd 'Asia/Ho_Chi_Minh') và convert
-- "today" + mỗi period_start thành TIMESTAMPTZ tương ứng trước
-- khi so sánh với t.occurred_at (cũng là TIMESTAMPTZ).
-- ================================================================

CREATE OR REPLACE FUNCTION get_monthly_history(
  p_user_id UUID,
  p_months INTEGER DEFAULT 6,
  p_timezone TEXT DEFAULT 'UTC'
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
  v_today_local DATE := (NOW() AT TIME ZONE p_timezone)::DATE;
  v_month_local DATE;
  v_period_start_tz TIMESTAMPTZ;
  v_period_end_tz TIMESTAMPTZ;
  v_safe_timezone TEXT;
BEGIN
  -- Sanitize timezone: nếu invalid, fallback UTC để tránh crash.
  -- (PostgreSQL sẽ throw nếu AT TIME ZONE nhận string không hợp lệ.)
  BEGIN
    PERFORM NOW() AT TIME ZONE p_timezone;
    v_safe_timezone := p_timezone;
  EXCEPTION WHEN OTHERS THEN
    v_safe_timezone := 'UTC';
  END;

  v_today_local := (NOW() AT TIME ZONE v_safe_timezone)::DATE;

  FOR i IN REVERSE (p_months - 1)..0 LOOP
    v_month_local := date_trunc(
      'month',
      v_today_local - (i || ' months')::interval
    )::DATE;

    -- Convert local-midnight đầu tháng và đầu tháng sau về TIMESTAMPTZ.
    v_period_start_tz := (v_month_local::TIMESTAMP AT TIME ZONE v_safe_timezone);
    v_period_end_tz := ((v_month_local + INTERVAL '1 month')::TIMESTAMP
                        AT TIME ZONE v_safe_timezone);

    period_start := v_month_local;
    period_end := (v_period_end_tz - INTERVAL '1 day')::DATE;

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
      AND t.occurred_at >= v_period_start_tz
      AND t.occurred_at <  v_period_end_tz;
    net_change := total_income - total_expense;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION get_monthly_history(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_monthly_history(UUID, INTEGER, TEXT) TO authenticated;
