-- ================================================================
-- Migration: 20260810000007_budget_tree_and_lifecycle.sql
-- Mục đích: Khắc phục F03 (cây danh mục ngân sách), F04 (ngân sách toàn bộ chi tiêu),
--           và F17 (vòng đời ngân sách: sửa, tạm dừng, kích hoạt lại, xóa).
-- ================================================================

-- 1. Nâng cấp RPC get_budget_progress với CTE đệ quy cây danh mục và loại trừ gốc nợ
DROP FUNCTION IF EXISTS public.get_budget_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_budget_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_budget_progress(
  p_budget_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS TABLE (
  budget_id UUID,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  spent_minor BIGINT,
  transaction_count BIGINT,
  percent NUMERIC
) AS $$
DECLARE
  v_amount_minor BIGINT;
  v_has_categories BOOLEAN;
BEGIN
  SELECT amount_minor INTO v_amount_minor
  FROM budgets
  WHERE id = p_budget_id AND user_id = auth.uid();

  IF v_amount_minor IS NULL THEN
    RAISE EXCEPTION 'Budget not found';
  END IF;

  -- Kiểm tra xem ngân sách này có chỉ định danh mục cụ thể hay áp dụng toàn bộ
  SELECT EXISTS(
    SELECT 1 FROM budget_categories bc WHERE bc.budget_id = p_budget_id
  ) INTO v_has_categories;

  RETURN QUERY
  WITH RECURSIVE target_categories AS (
    -- Danh mục được chỉ định trực tiếp trong budget_categories
    SELECT bc.category_id AS id
    FROM budget_categories bc
    WHERE bc.budget_id = p_budget_id

    UNION

    -- Đệ quy lấy tất cả danh mục con cháu thuộc danh mục cha
    SELECT c.id
    FROM categories c
    JOIN target_categories tc ON c.parent_id = tc.id
  )
  SELECT
    p_budget_id AS budget_id,
    p_period_start AS period_start,
    p_period_end AS period_end,
    COALESCE(SUM(t.amount_minor), 0)::BIGINT AS spent_minor,
    COUNT(t.id)::BIGINT AS transaction_count,
    CASE WHEN v_amount_minor > 0
      THEN ROUND((COALESCE(SUM(t.amount_minor), 0)::NUMERIC / v_amount_minor) * 100, 2)
      ELSE 0
    END AS percent
  FROM transactions t
  WHERE t.user_id = auth.uid()
    AND t.status != 'voided'
    AND t.type = 'expense'
    AND t.occurred_at >= p_period_start
    AND t.occurred_at < p_period_end
    -- Loại trừ vốn gốc / thanh toán nợ mang cờ is_debt_principal (D02, D03)
    AND (t.metadata->>'is_debt_principal' IS NULL OR t.metadata->>'is_debt_principal' != 'true')
    -- Lọc danh mục: Nếu không có danh mục chỉ định thì tính toàn bộ chi tiêu
    AND (
      NOT v_has_categories
      OR t.category_id IN (SELECT tc.id FROM target_categories tc)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC: create_budget_with_categories
CREATE OR REPLACE FUNCTION create_budget_with_categories(
  p_name TEXT,
  p_amount_minor BIGINT,
  p_cadence budget_cadence,
  p_start_date DATE,
  p_end_date DATE DEFAULT NULL,
  p_category_ids UUID[] DEFAULT NULL
)
RETURNS budgets AS $$
DECLARE
  v_budget budgets;
  v_cat_id UUID;
BEGIN
  INSERT INTO budgets (
    user_id,
    name,
    amount_minor,
    cadence,
    start_date,
    end_date
  ) VALUES (
    auth.uid(),
    p_name,
    p_amount_minor,
    p_cadence,
    p_start_date,
    p_end_date
  )
  RETURNING * INTO v_budget;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    FOREACH v_cat_id IN ARRAY p_category_ids LOOP
      INSERT INTO budget_categories (budget_id, category_id)
      VALUES (v_budget.id, v_cat_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_budget;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: update_budget
CREATE OR REPLACE FUNCTION update_budget(
  p_budget_id UUID,
  p_name TEXT,
  p_amount_minor BIGINT,
  p_cadence budget_cadence,
  p_start_date DATE,
  p_end_date DATE DEFAULT NULL,
  p_category_ids UUID[] DEFAULT NULL
)
RETURNS budgets AS $$
DECLARE
  v_budget budgets;
  v_cat_id UUID;
BEGIN
  UPDATE budgets
  SET
    name = p_name,
    amount_minor = p_amount_minor,
    cadence = p_cadence,
    start_date = p_start_date,
    end_date = p_end_date,
    updated_at = NOW(),
    version = version + 1
  WHERE id = p_budget_id AND user_id = auth.uid()
  RETURNING * INTO v_budget;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget not found or unauthorized';
  END IF;

  IF p_category_ids IS NOT NULL THEN
    DELETE FROM budget_categories WHERE budget_id = p_budget_id;
    IF array_length(p_category_ids, 1) > 0 THEN
      FOREACH v_cat_id IN ARRAY p_category_ids LOOP
        INSERT INTO budget_categories (budget_id, category_id)
        VALUES (p_budget_id, v_cat_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN v_budget;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: toggle_budget_active
CREATE OR REPLACE FUNCTION toggle_budget_active(
  p_budget_id UUID,
  p_is_active BOOLEAN
)
RETURNS budgets AS $$
DECLARE
  v_budget budgets;
BEGIN
  UPDATE budgets
  SET is_active = p_is_active, updated_at = NOW(), version = version + 1
  WHERE id = p_budget_id AND user_id = auth.uid()
  RETURNING * INTO v_budget;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget not found or unauthorized';
  END IF;

  RETURN v_budget;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: delete_budget
CREATE OR REPLACE FUNCTION delete_budget(
  p_budget_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM budgets
  WHERE id = p_budget_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
