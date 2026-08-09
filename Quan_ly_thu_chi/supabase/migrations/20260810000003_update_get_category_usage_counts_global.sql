-- Migration: M14 - Update get_category_usage_counts to include global_categories tree
-- ============================================================
-- RPC cũ chỉ đếm CHA/CON trong bảng `categories` (user).
-- Sau khi migrate sang global_categories CHA/CON, cần RPC đếm cả 2 nguồn.
--
-- Logic:
--   Với mỗi input cat_id:
--   - Nếu nó là global: build tree con (CHA + descendant), gộp transaction theo global_category_id
--   - Nếu nó là user: build tree con (CHA + descendant), gộp transaction theo category_id
-- ============================================================

DROP FUNCTION IF EXISTS get_category_usage_counts(UUID[], UUID);

CREATE OR REPLACE FUNCTION get_category_usage_counts(
  p_category_ids UUID[],
  p_user_id UUID
)
RETURNS TABLE (
  category_id UUID,
  direct_count BIGINT,
  tree_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
  -- 1. Tìm source (user/global) cho mỗi input id
  classified AS (
    SELECT
      pc.id AS cat_id,
      (g.id IS NOT NULL) AS is_global,
      CASE WHEN g.id IS NOT NULL THEN g.parent_id ELSE c.parent_id END AS parent_id_check
    FROM unnest(p_category_ids) AS pc(id)
    LEFT JOIN categories c ON c.id = pc.id
    LEFT JOIN global_categories g ON g.id = pc.id
  ),
  -- 2. Tìm tất cả descendant của CHA input, riêng cho từng nguồn
  user_descendants AS (
    -- Direct CHA itself
    SELECT c.id AS cha_id, c.id AS descendant_id
    FROM classified cf
    JOIN categories c ON cf.cat_id = c.id
    WHERE cf.is_global = FALSE AND c.user_id = p_user_id
    UNION
    -- CON của CHA
    SELECT parent.id AS cha_id, child.id AS descendant_id
    FROM categories parent
    JOIN categories child ON child.parent_id = parent.id
    WHERE parent.user_id = p_user_id
      AND parent.id IN (SELECT cat_id FROM classified WHERE NOT is_global)
  ),
  global_descendants AS (
    -- Direct CHA itself
    SELECT g.id AS cha_id, g.id AS descendant_id
    FROM classified cf
    JOIN global_categories g ON cf.cat_id = g.id
    WHERE cf.is_global = TRUE AND g.is_active = TRUE
    UNION
    -- CON của CHA
    SELECT parent.id AS cha_id, child.id AS descendant_id
    FROM global_categories parent
    JOIN global_categories child ON child.parent_id = parent.id AND child.is_active = TRUE
    WHERE parent.is_active = TRUE
      AND parent.id IN (SELECT cat_id FROM classified WHERE is_global)
  ),
  -- 3. Tất cả descendant (CHA + CON) của mỗi input
  all_desc AS (
    SELECT * FROM user_descendants
    UNION ALL
    SELECT * FROM global_descendants
  ),
  -- 4. Đếm transactions (distinct cha_id)
  tx_by_desc AS (
    SELECT
      d.cha_id,
      d.descendant_id,
      COUNT(t.id) AS cnt
    FROM all_desc d
    LEFT JOIN transactions t ON
      (d.descendant_id = t.category_id OR d.descendant_id = t.global_category_id)
      AND t.user_id = p_user_id AND t.status <> 'voided'
    GROUP BY d.cha_id, d.descendant_id
  )
  SELECT
    txd.cha_id AS category_id,
    COALESCE(SUM(txd.cnt) FILTER (WHERE txd.cha_id = txd.descendant_id), 0)::BIGINT AS direct_count,
    COALESCE(SUM(txd.cnt), 0)::BIGINT AS tree_count
  FROM tx_by_desc txd
  GROUP BY txd.cha_id;
END;
$$ LANGUAGE plpgsql STABLE;