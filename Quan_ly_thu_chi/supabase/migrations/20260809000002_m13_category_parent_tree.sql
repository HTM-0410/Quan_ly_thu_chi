-- ================================================================
-- Migration: M13 - Phân cấp danh mục (parent_id + sub-categories)
-- An toàn cho dữ liệu đang link tới giao dịch:
--   - KHÔNG xóa/sửa bất kỳ category cũ nào
--   - Với mỗi CHA (parent_id IS NULL) đang được dùng bởi giao dịch,
--     seed các CON mặc định và gắn vào cùng kind
--   - Stats/Reports tiếp tục đếm CHA + CON (RPC get_transactions_summary
--     đã đếm theo category_id cụ thể, không phá dữ liệu)
-- ================================================================

-- ================================================================
-- 1. Bảo đảm index cho parent_id (đã có từ M1 nhưng IF NOT EXISTS để idempotent)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- ================================================================
-- 2. Trigger: ngăn vòng lặp CHA ↔ CON (parent_id không được trỏ vào chính nó)
-- ================================================================
CREATE OR REPLACE FUNCTION categories_prevent_circular_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    -- Bản thân không được là cha của chính nó
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Category cannot be its own parent';
    END IF;
    -- parent_id phải thuộc cùng user
    IF NOT EXISTS (
      SELECT 1 FROM categories
      WHERE id = NEW.parent_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Parent category must belong to the same user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categories_prevent_circular_parent ON categories;
CREATE TRIGGER trg_categories_prevent_circular_parent
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION categories_prevent_circular_parent();

-- ================================================================
-- 3. Seed CON mặc định cho CHA đang được giao dịch sử dụng
-- Idempotent: chỉ insert nếu CHA đó CHƯA có CON nào
-- ================================================================
DO $$
DECLARE
  r RECORD;
  sub_id UUID;
  income_sub_subs TEXT[] := ARRAY['Lương chính', 'Lương thêm', 'Thưởng', 'Hoàn tiền', 'Thu nhập khác'];
  food_subs TEXT[] := ARRAY['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Cà phê/Đồ uống', 'Ăn vặt'];
  transport_subs TEXT[] := ARRAY['Xăng xe', 'Grab/Be', 'Gửi xe', 'Taxi', 'Bảo dưỡng'];
  grocery_subs TEXT[] := ARRAY['Rau củ', 'Thịt cá', 'Đồ gia dụng', 'Sữa & đồ uống'];
  entertainment_subs TEXT[] := ARRAY['Phim', 'Cafe/Trà sữa', 'Game', 'Du lịch', 'Sự kiện'];
  bills_subs TEXT[] := ARRAY['Điện', 'Nước', 'Internet', 'Điện thoại', 'Khác'];
  health_subs TEXT[] := ARRAY['Khám bệnh', 'Thuốc', 'Bảo hiểm', 'Phòng gym'];
  shopping_subs TEXT[] := ARRAY['Quần áo', 'Mỹ phẩm', 'Đồ điện tử', 'Đồ gia dụng'];
  education_subs TEXT[] := ARRAY['Sách', 'Khoá học', 'Học phí', 'Đồ dùng học tập'];
  default_subs TEXT[];
BEGIN
  FOR r IN
    SELECT c.id, c.user_id, c.name, c.kind, c.icon, c.color
    FROM categories c
    WHERE c.parent_id IS NULL
      AND c.is_archived = FALSE
      AND EXISTS (
        SELECT 1 FROM transactions t
        WHERE (t.category_id = c.id OR t.global_category_id::text = c.id::text)
      )
  LOOP
    -- Skip nếu CHA đã có CON
    IF EXISTS (SELECT 1 FROM categories WHERE parent_id = r.id) THEN
      CONTINUE;
    END IF;

    -- Chọn danh sách CON mặc định theo tên CHA (theo locale vi)
    CASE r.name
      WHEN 'Lương' THEN default_subs := income_sub_subs;
      WHEN 'Ăn uống' THEN default_subs := food_subs;
      WHEN 'Đi lại' THEN default_subs := transport_subs;
      WHEN 'Đi chợ' THEN default_subs := grocery_subs;
      WHEN 'Đi chợ/siêu thị' THEN default_subs := grocery_subs;
      WHEN 'Giải trí' THEN default_subs := entertainment_subs;
      WHEN 'Hoá đơn' THEN default_subs := bills_subs;
      WHEN 'Sức khoẻ' THEN default_subs := health_subs;
      WHEN 'Sức khỏe' THEN default_subs := health_subs;
      WHEN 'Mua sắm' THEN default_subs := shopping_subs;
      WHEN 'Học tập' THEN default_subs := education_subs;
      ELSE default_subs := ARRAY['Khác'];
    END CASE;

    -- Insert các CON (parent_id = r.id). Nếu CON cùng tên đã tồn tại
    -- cùng cha thì skip (idempotency).
    FOR i IN 1..array_length(default_subs, 1) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM categories
        WHERE parent_id = r.id AND name = default_subs[i]
      ) THEN
        INSERT INTO categories (user_id, name, kind, parent_id, icon, color, sort_order, is_system)
        VALUES (r.user_id, default_subs[i], r.kind, r.id, r.icon, r.color, i, FALSE)
        RETURNING id INTO sub_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ================================================================
-- 4. RPC: đếm usage count cho 1 category (CHA + CON) — UI hiển thị
-- ================================================================
CREATE OR REPLACE FUNCTION get_category_usage_count(
  p_category_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  direct_count BIGINT,
  tree_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE tree AS (
    SELECT id FROM categories WHERE id = p_category_id AND user_id = p_user_id
    UNION ALL
    SELECT c.id FROM categories c
    INNER JOIN tree t ON c.parent_id = t.id
  )
  SELECT
    (SELECT COUNT(*) FROM transactions
       WHERE user_id = p_user_id AND status <> 'voided'
         AND (category_id = p_category_id OR global_category_id = p_category_id)
    ) AS direct_count,
    (SELECT COUNT(*) FROM transactions t
       INNER JOIN tree tr ON (t.category_id = tr.id OR t.global_category_id::text = tr.id::text)
       WHERE t.user_id = p_user_id AND t.status <> 'voided'
    ) AS tree_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================================
-- 4b. RPC batch: đếm usage count cho nhiều categories (1 round-trip)
-- ================================================================
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
  WITH RECURSIVE tree AS (
    SELECT id AS parent_id FROM categories WHERE user_id = p_user_id
    UNION ALL
    SELECT c.id FROM categories c
    INNER JOIN tree t ON c.parent_id = t.parent_id
  ),
  -- Build một row mỗi (category_id, descendant_id) cho mọi CHA
  expanded AS (
    SELECT DISTINCT pc.id AS cat_id, tr.id AS descendant_id
    FROM categories pc
    JOIN LATERAL (
      WITH RECURSIVE descend AS (
        SELECT pc.id AS id
        UNION ALL
        SELECT c.id FROM categories c JOIN descend d ON c.parent_id = d.id
      )
      SELECT id FROM descend
    ) tr ON TRUE
    WHERE pc.user_id = p_user_id
  )
  SELECT
    e.cat_id AS category_id,
    COUNT(*) FILTER (WHERE e.cat_id = e.descendant_id
      AND EXISTS (SELECT 1 FROM transactions t
                   WHERE t.user_id = p_user_id AND t.status <> 'voided'
                     AND (t.category_id = e.descendant_id
                          OR t.global_category_id = e.descendant_id))) AS direct_count,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t
                                    WHERE t.user_id = p_user_id AND t.status <> 'voided'
                                      AND (t.category_id = e.descendant_id
                                           OR t.global_category_id = e.descendant_id))) AS tree_count
  FROM expanded e
  WHERE e.cat_id = ANY(p_category_ids)
  GROUP BY e.cat_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================================
-- 5. View phân cấp: tree_sorted — UI render nhanh
-- ================================================================
CREATE OR REPLACE VIEW categories_tree AS
SELECT
  c.*,
  parent.name AS parent_name,
  parent.icon AS parent_icon,
  parent.color AS parent_color
FROM categories c
LEFT JOIN categories parent ON parent.id = c.parent_id;

-- ================================================================
-- 6. Bổ sung RLS: cho phép user tạo/update CON (parent_id non-null)
--    Đã có ALL policy từ M1, không cần thay đổi.
-- ================================================================

-- ================================================================
-- 7. Cleanup: xóa CON mặc định trùng tên (rất hiếm, đề phòng re-seed)
-- ================================================================
-- (Không làm gì — để idempotent tự nhiên)
