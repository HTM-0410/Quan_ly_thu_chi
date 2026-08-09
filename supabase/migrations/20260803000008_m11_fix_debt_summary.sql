-- ============================================================
-- Migration: m11_fix_get_debt_summary
-- Fix RPC get_debt_summary trả về 2 metric rows nhưng api.ts expect 4
-- (total_lending, total_borrowing, active_lend_count, active_borrow_count).
-- Thiếu count rows → UI hiển thị count = 0.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_debt_summary()
RETURNS TABLE(metric TEXT, amount BIGINT, count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  RETURN QUERY
  WITH summary AS (
    SELECT
      COALESCE(SUM(CASE WHEN type = 'lend' AND status = 'active' THEN remaining_amount ELSE 0 END), 0)::BIGINT AS total_lending,
      COALESCE(SUM(CASE WHEN type = 'borrow' AND status = 'active' THEN remaining_amount ELSE 0 END), 0)::BIGINT AS total_borrowing,
      COUNT(CASE WHEN type = 'lend' AND status = 'active' THEN 1 END)::BIGINT AS lend_count,
      COUNT(CASE WHEN type = 'borrow' AND status = 'active' THEN 1 END)::BIGINT AS borrow_count
    FROM public.debts
    WHERE user_id = auth.uid()
  )
  SELECT
    x.metric::TEXT,
    x.amount::BIGINT,
    x.count::BIGINT
  FROM (
    SELECT 'total_lending'::TEXT AS metric, total_lending AS amount, lend_count AS count FROM summary
    UNION ALL
    SELECT 'total_borrowing'::TEXT AS metric, total_borrowing AS amount, borrow_count AS count FROM summary
    UNION ALL
    SELECT 'active_lend_count'::TEXT AS metric, 0 AS amount, lend_count AS count FROM summary
    UNION ALL
    SELECT 'active_borrow_count'::TEXT AS metric, 0 AS amount, borrow_count AS count FROM summary
  ) x;
END;
$func$;
