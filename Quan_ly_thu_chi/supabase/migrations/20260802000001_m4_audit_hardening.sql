-- ================================================================
-- M4 hardening: audit_logs RLS, transfer-balance trigger,
--               handle_new_user seed categories, budget_categories UPDATE.
-- Safe to apply on top of m1-m3 migrations.
-- ================================================================

-- ------------------------------------------------------------
-- 1) audit_logs: enable RLS, chỉ service_role đọc
-- ------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; authenticated users default-deny.
-- No policies created for authenticated → user không SELECT được audit log.
-- RPC đã ghi log qua SECURITY DEFINER nên vẫn hoạt động.

-- ------------------------------------------------------------
-- 2) budget_categories: thêm policy UPDATE
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own budget categories" ON budget_categories;

CREATE POLICY "Users can update own budget categories"
  ON budget_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_categories.budget_id
        AND budgets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_categories.budget_id
        AND budgets.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3) validate_transfer_balance trigger (function đã có ở m1)
-- Chạy DEFERRABLE INITIALLY DEFERRED để RPC create_transfer có thể
-- insert 2 entries (âm/dương) trong cùng transaction mà trigger chỉ
-- check tổng = 0 sau COMMIT.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS validate_transfer_balance_trg ON transaction_entries;

CREATE CONSTRAINT TRIGGER validate_transfer_balance_trg
  AFTER INSERT ON transaction_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_transfer_balance();

-- ------------------------------------------------------------
-- 4) handle_new_user: gọi seed_default_categories sau khi tạo profile
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );

  -- Seed categories tiếng Việt cho user mới
  PERFORM seed_default_categories(NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Không chặn signup nếu seed lỗi (profile vẫn được tạo)
    RAISE WARNING 'seed_default_categories thất bại cho user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;