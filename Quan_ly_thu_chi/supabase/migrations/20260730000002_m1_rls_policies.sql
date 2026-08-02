-- Migration: M1 - Row Level Security Policies
-- Spec reference: mục 15.2 - Row Level Security
-- Created: 2026-07-30
-- Status: Milestone 1

-- ================================================================
-- ENABLE RLS
-- Spec: mục 15.2 - RLS bật cho mọi bảng người dùng
-- ================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- PROFILES
-- ================================================================

-- User chỉ có thể đọc chính mình
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- User chỉ có thể cập nhật chính mình
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ================================================================
-- FINANCIAL_ACCOUNTS
-- ================================================================

-- User chỉ thấy tài khoản của mình
CREATE POLICY "Users can view own accounts"
  ON financial_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- User chỉ tạo tài khoản cho mình
CREATE POLICY "Users can insert own accounts"
  ON financial_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User chỉ cập nhật tài khoản của mình
CREATE POLICY "Users can update own accounts"
  ON financial_accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User chỉ xóa tài khoản của mình
CREATE POLICY "Users can delete own accounts"
  ON financial_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- CATEGORIES
-- ================================================================

-- User chỉ thấy categories của mình (bao gồm system categories)
CREATE POLICY "Users can view own categories"
  ON categories FOR SELECT
  USING (auth.uid() = user_id OR is_system = TRUE);

-- User chỉ tạo category cho mình
CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User chỉ cập nhật categories của mình (không được sửa system categories)
CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  USING (auth.uid() = user_id AND (is_system = FALSE OR is_system IS NULL))
  WITH CHECK (auth.uid() = user_id AND (is_system = FALSE OR is_system IS NULL));

-- User chỉ xóa categories của mình (không được xóa system categories hoặc đã dùng)
CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE
  USING (
    auth.uid() = user_id
    AND is_system = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM transactions WHERE category_id = categories.id
    )
  );

-- ================================================================
-- TRANSACTIONS
-- ================================================================

-- User chỉ thấy giao dịch của mình
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

-- User chỉ tạo giao dịch cho mình
CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User chỉ cập nhật giao dịch của mình
-- Không cho phép cập nhật giao dịch từ ngân hàng
CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (
    auth.uid() = user_id
    AND source != 'bank'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND source != 'bank'
  );

-- User chỉ xóa giao dịch của mình (không cho xóa bank transactions)
CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (
    auth.uid() = user_id
    AND source != 'bank'
  );

-- ================================================================
-- TRANSACTION_ENTRIES
-- ================================================================

-- User chỉ thấy entries qua transaction của mình
CREATE POLICY "Users can view own entries"
  ON transaction_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_entries.transaction_id
        AND transactions.user_id = auth.uid()
    )
  );

-- Entries chỉ được tạo qua RPC, không trực tiếp
-- Nên không cần insert policy - RPC sẽ kiểm tra

-- ================================================================
-- TRANSACTION_SPLITS
-- ================================================================

-- User chỉ thấy splits qua transaction của mình
CREATE POLICY "Users can view own splits"
  ON transaction_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_splits.transaction_id
        AND transactions.user_id = auth.uid()
    )
  );

-- ================================================================
-- BANK_CONNECTIONS
-- ================================================================

-- User chỉ thấy kết nối của mình
CREATE POLICY "Users can view own bank connections"
  ON bank_connections FOR SELECT
  USING (auth.uid() = user_id);

-- User chỉ tạo kết nối cho mình
CREATE POLICY "Users can insert own bank connections"
  ON bank_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User chỉ cập nhật kết nối của mình
CREATE POLICY "Users can update own bank connections"
  ON bank_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User chỉ xóa kết nối của mình
CREATE POLICY "Users can delete own bank connections"
  ON bank_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- BANK_ACCOUNTS
-- ================================================================

-- User thấy bank accounts qua kết nối của mình
CREATE POLICY "Users can view own bank accounts"
  ON bank_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bank_connections
      WHERE bank_connections.id = bank_accounts.bank_connection_id
        AND bank_connections.user_id = auth.uid()
    )
  );

-- ================================================================
-- BANK_EVENTS
-- ================================================================

-- User chỉ thấy events của mình
CREATE POLICY "Users can view own bank events"
  ON bank_events FOR SELECT
  USING (auth.uid() = user_id);

-- User chỉ cập nhật events của mình (để phân loại)
CREATE POLICY "Users can update own bank events"
  ON bank_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- BUDGETS
-- ================================================================

-- User chỉ thấy budgets của mình
CREATE POLICY "Users can view own budgets"
  ON budgets FOR SELECT
  USING (auth.uid() = user_id);

-- User chỉ tạo budgets cho mình
CREATE POLICY "Users can insert own budgets"
  ON budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User chỉ cập nhật budgets của mình
CREATE POLICY "Users can update own budgets"
  ON budgets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User chỉ xóa budgets của mình
CREATE POLICY "Users can delete own budgets"
  ON budgets FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- BUDGET_CATEGORIES
-- ================================================================

-- User thấy budget categories qua budget của mình
CREATE POLICY "Users can view own budget categories"
  ON budget_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_categories.budget_id
        AND budgets.user_id = auth.uid()
    )
  );

-- User chỉ tạo budget categories cho budgets của mình
CREATE POLICY "Users can insert own budget categories"
  ON budget_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_categories.budget_id
        AND budgets.user_id = auth.uid()
    )
  );

-- User chỉ xóa budget categories của mình
CREATE POLICY "Users can delete own budget categories"
  ON budget_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_categories.budget_id
        AND budgets.user_id = auth.uid()
    )
  );
