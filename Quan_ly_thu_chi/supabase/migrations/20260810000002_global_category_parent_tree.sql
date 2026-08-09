-- Migration: rebuild global_categories tree (CHA/CON) + migrate transactions
-- ============================================================
-- Bối cảnh:
--   - Trước đây: global_categories là CHA flat (1 cấp), không có parent_id.
--   - Sau khi user thêm parent_id + CON, cần:
--     1. Schema: thêm parent_id + UNIQUE(name, kind, parent_id) WHERE is_active=true
--     2. Archive CHA cũ (giữ audit trail)
--     3. Insert CHA + CON mới (~21 CHA, ~91 CON)
--     4. Mapping transactions cũ → CHA/CON mới theo old_cat + payee heuristic
-- ============================================================

-- Step 1: Schema
ALTER TABLE global_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES global_categories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_global_categories_parent_id ON global_categories(parent_id);

ALTER TABLE global_categories DROP CONSTRAINT IF EXISTS global_categories_name_kind_key;

-- Partial unique indexes: chỉ áp dụng cho active rows để có thể re-archive + recreate
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_categories_parent_null_active
  ON global_categories (name, kind) WHERE parent_id IS NULL AND is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_categories_parent_not_null_active
  ON global_categories (name, kind, parent_id) WHERE parent_id IS NOT NULL AND is_active = TRUE;

-- Step 2: Archive CHA cũ
UPDATE global_categories SET is_active = FALSE, updated_at = NOW()
  WHERE parent_id IS NULL AND is_active = TRUE;

-- Step 3: Insert CHA + CON mới (xem migration thực tế đã apply trực tiếp)
-- Step 4: Mapping transactions (xem migration thực tế đã apply trực tiếp)
