-- ================================================================
-- Migration: 20260810000008_category_expenses_breakdown_rpc.sql
-- Mục đích: Khắc phục F06 (aggregate toàn bộ server-side, không cắt 500 dòng,
--           hỗ trợ đầy đủ chưa phân loại và gom nhóm danh mục khác).
-- ================================================================

-- 1. DROP IF EXISTS & CREATE OR REPLACE get_category_expenses_breakdown
DROP FUNCTION IF EXISTS public.get_category_expenses_breakdown(DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS get_category_expenses_breakdown(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.get_category_expenses_breakdown(
  p_start_date DATE,
  p_end_date DATE,
  p_timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'
)
RETURNS TABLE (
  category_id TEXT,
  category_name TEXT,
  color TEXT,
  total_amount BIGINT,
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
  -- 1. Kiểm tra múi giờ hợp lệ
  BEGIN
    PERFORM NOW() AT TIME ZONE p_timezone;
    v_safe_tz := COALESCE(p_timezone, 'Asia/Ho_Chi_Minh');
  EXCEPTION WHEN OTHERS THEN
    v_safe_tz := 'Asia/Ho_Chi_Minh';
  END;

  -- 2. Quy đổi mốc thời gian sang TIMESTAMPTZ bao trọn ngày
  v_start_tz := (p_start_date::TIMESTAMP AT TIME ZONE v_safe_tz);
  v_end_tz := ((p_end_date + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE v_safe_tz);

  -- 3. Truy vấn gom nhóm toàn bộ chi tiêu theo danh mục
  RETURN QUERY
  WITH tx_data AS (
    SELECT
      t.id,
      t.amount_minor,
      CASE
        WHEN t.category_id IS NOT NULL THEN t.category_id::TEXT
        WHEN t.global_category_id IS NOT NULL THEN 'global:' || t.global_category_id::TEXT
        ELSE '__uncategorized__'
      END AS cat_key,
      CASE
        WHEN t.category_id IS NOT NULL THEN c.name
        WHEN t.global_category_id IS NOT NULL THEN gc.name
        ELSE 'Chưa phân loại'
      END AS cat_name,
      CASE
        WHEN t.category_id IS NOT NULL THEN c.color
        WHEN t.global_category_id IS NOT NULL THEN gc.color
        ELSE '#757575'
      END AS cat_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN global_categories gc ON t.global_category_id = gc.id
    WHERE t.user_id = auth.uid()
      AND t.status = 'posted'
      AND t.type = 'expense'
      AND (t.metadata->>'is_debt_principal' IS NULL OR t.metadata->>'is_debt_principal' != 'true')
      AND t.occurred_at >= v_start_tz
      AND t.occurred_at < v_end_tz
  )
  SELECT
    td.cat_key AS category_id,
    COALESCE(td.cat_name, 'Chưa phân loại') AS category_name,
    COALESCE(td.cat_color, '#757575') AS color,
    COALESCE(SUM(td.amount_minor), 0)::BIGINT AS total_amount,
    COUNT(td.id)::BIGINT AS transaction_count
  FROM tx_data td
  GROUP BY td.cat_key, td.cat_name, td.cat_color
  ORDER BY total_amount DESC;
END;
$$;
