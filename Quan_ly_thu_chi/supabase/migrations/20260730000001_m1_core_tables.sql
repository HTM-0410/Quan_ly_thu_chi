-- Migration: M1 - Core tables (profiles, accounts, categories, transactions, entries)
-- Spec reference: mục 9 - Data Model
-- Created: 2026-07-30
-- Status: Milestone 1

-- ================================================================
-- ENUMS
-- ================================================================

CREATE TYPE account_type AS ENUM (
  'cash',
  'bank',
  'ewallet',
  'credit_card',
  'savings',
  'other'
);

CREATE TYPE transaction_type AS ENUM (
  'income',
  'expense',
  'transfer',
  'refund',
  'adjustment'
);

CREATE TYPE transaction_status AS ENUM (
  'pending',
  'posted',
  'voided'
);

CREATE TYPE transaction_source AS ENUM (
  'manual',
  'bank',
  'csv',
  'recurring'
);

CREATE TYPE classification_status AS ENUM (
  'unclassified',
  'suggested',
  'confirmed'
);

CREATE TYPE category_kind AS ENUM (
  'income',
  'expense',
  'both'
);

CREATE TYPE bank_connection_status AS ENUM (
  'pending',
  'active',
  'requires_action',
  'error',
  'disconnected'
);

CREATE TYPE bank_event_status AS ENUM (
  'received',
  'normalized',
  'matched',
  'ignored',
  'error'
);

CREATE TYPE budget_cadence AS ENUM (
  'weekly',
  'monthly',
  'custom'
);

-- ================================================================
-- PROFILES
-- Spec: mục 9.1
-- ================================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  base_currency CHAR(3) NOT NULL DEFAULT 'VND',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  locale TEXT NOT NULL DEFAULT 'vi-VN',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

-- ================================================================
-- FINANCIAL_ACCOUNTS
-- Spec: mục 9.2
-- ================================================================

CREATE TABLE financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  opening_balance_minor BIGINT NOT NULL DEFAULT 0,
  opening_balance_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  credit_limit_minor BIGINT, -- Chỉ dùng cho thẻ tín dụng
  institution_name TEXT,
  masked_account_number TEXT, -- Chỉ lưu dạng che
  color TEXT NOT NULL DEFAULT '#1E88E5',
  icon TEXT NOT NULL DEFAULT 'account_balance_wallet',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_net_worth BOOLEAN NOT NULL DEFAULT TRUE,
  reported_balance_minor BIGINT,
  reported_balance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  -- Constraints
  CONSTRAINT positive_credit_limit CHECK (credit_limit_minor IS NULL OR credit_limit_minor >= 0)
);

CREATE INDEX idx_financial_accounts_user_id ON financial_accounts(user_id);
CREATE INDEX idx_financial_accounts_type ON financial_accounts(type);
CREATE INDEX idx_financial_accounts_is_archived ON financial_accounts(is_archived);

-- ================================================================
-- CATEGORIES
-- Spec: mục 9.3
-- ================================================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind category_kind NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  icon TEXT NOT NULL DEFAULT 'category',
  color TEXT NOT NULL DEFAULT '#757575',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_kind ON categories(kind);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_is_archived ON categories(is_archived);

-- ================================================================
-- TRANSACTIONS
-- Spec: mục 9.4
-- ================================================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  status transaction_status NOT NULL DEFAULT 'posted',
  occurred_at TIMESTAMPTZ NOT NULL,
  amount_minor BIGINT NOT NULL, -- Luôn là số dương trong DB
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payee TEXT,
  note TEXT,
  source transaction_source NOT NULL DEFAULT 'manual',
  bank_event_id UUID,
  transfer_group_id UUID, -- Nhóm các giao dịch transfer
  refund_of_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  client_generated_id UUID, -- Chống trùng khi offline
  classification_status classification_status NOT NULL DEFAULT 'unclassified',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  -- Constraints
  CONSTRAINT positive_amount CHECK (amount_minor > 0),
  CONSTRAINT no_category_for_transfer CHECK (
    type != 'transfer' OR category_id IS NULL
  )
);

-- Unique constraint để chống trùng từ offline
CREATE UNIQUE INDEX idx_transactions_client_generated_id
  ON transactions(user_id)
  WHERE client_generated_id IS NOT NULL;

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_occurred_at ON transactions(occurred_at);
CREATE INDEX idx_transactions_transfer_group_id ON transactions(transfer_group_id);
CREATE INDEX idx_transactions_bank_event_id ON transactions(bank_event_id);

-- ================================================================
-- TRANSACTION_ENTRIES (Ledger)
-- Spec: mục 9.5
-- ================================================================

CREATE TABLE transaction_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL, -- Có dấu: dương = tiền vào, âm = tiền ra
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_entries_transaction_id ON transaction_entries(transaction_id);
CREATE INDEX idx_transaction_entries_account_id ON transaction_entries(account_id);

-- ================================================================
-- TRANSACTION_SPLITS
-- Spec: mục 9.6
-- ================================================================

CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_split_amount CHECK (amount_minor > 0)
);

CREATE INDEX idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
CREATE INDEX idx_transaction_splits_category_id ON transaction_splits(category_id);

-- ================================================================
-- BANK_CONNECTIONS
-- Spec: mục 9.7
-- ================================================================

CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_connection_id TEXT NOT NULL,
  institution_code TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  status bank_connection_status NOT NULL DEFAULT 'pending',
  consent_granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error_code TEXT,
  encrypted_provider_token TEXT, -- Chỉ server đọc được
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_bank_connections_user_id ON bank_connections(user_id);
CREATE INDEX idx_bank_connections_provider ON bank_connections(provider);
CREATE INDEX idx_bank_connections_status ON bank_connections(status);

-- ================================================================
-- BANK_ACCOUNTS
-- Spec: mục 9.8
-- ================================================================

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  financial_account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  provider_account_id TEXT NOT NULL,
  masked_account_number TEXT NOT NULL,
  account_name TEXT,
  sync_incoming BOOLEAN NOT NULL DEFAULT TRUE,
  sync_outgoing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  UNIQUE(bank_connection_id, provider_account_id)
);

CREATE INDEX idx_bank_accounts_bank_connection_id ON bank_accounts(bank_connection_id);
CREATE INDEX idx_bank_accounts_financial_account_id ON bank_accounts(financial_account_id);
CREATE INDEX idx_bank_accounts_provider_account_id ON bank_accounts(provider_account_id);

-- ================================================================
-- BANK_EVENTS
-- Spec: mục 9.9
-- ================================================================

CREATE TABLE bank_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  provider_transaction_id TEXT,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  provider_account_id TEXT,
  occurred_at TIMESTAMPTZ,
  signed_amount_minor BIGINT,
  description TEXT,
  reference_code TEXT,
  balance_after_minor BIGINT,
  payload JSONB NOT NULL DEFAULT '{}',
  payload_hash TEXT NOT NULL,
  status bank_event_status NOT NULL DEFAULT 'received',
  matched_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

-- Unique indexes theo spec mục 9.9
CREATE UNIQUE INDEX idx_bank_events_provider_event_id
  ON bank_events(provider)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX idx_bank_events_provider_txn
  ON bank_events(provider, provider_transaction_id, provider_account_id)
  WHERE provider_transaction_id IS NOT NULL AND provider_account_id IS NOT NULL;

CREATE UNIQUE INDEX idx_bank_events_payload_hash
  ON bank_events(user_id, payload_hash);

CREATE INDEX idx_bank_events_user_id ON bank_events(user_id);
CREATE INDEX idx_bank_events_status ON bank_events(status);
CREATE INDEX idx_bank_events_occurred_at ON bank_events(occurred_at);
CREATE INDEX idx_bank_events_matched_transaction_id ON bank_events(matched_transaction_id);

-- ================================================================
-- BUDGETS
-- Spec: mục 9.10
-- ================================================================

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence budget_cadence NOT NULL DEFAULT 'monthly',
  amount_minor BIGINT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  rollover_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  alert_thresholds INTEGER[] DEFAULT ARRAY[75, 90, 100],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT positive_budget_amount CHECK (amount_minor > 0)
);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_is_active ON budgets(is_active);

-- ================================================================
-- BUDGET_CATEGORIES
-- Spec: mục 9.11
-- ================================================================

CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(budget_id, category_id)
);

CREATE INDEX idx_budget_categories_budget_id ON budget_categories(budget_id);
CREATE INDEX idx_budget_categories_category_id ON budget_categories(category_id);

-- ================================================================
-- UPDATED_AT TRIGGER
-- Spec: mục 9 - Tự động cập nhật updated_at
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_accounts_updated_at
  BEFORE UPDATE ON financial_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_connections_updated_at
  BEFORE UPDATE ON bank_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_events_updated_at
  BEFORE UPDATE ON bank_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- UTILITY FUNCTIONS
-- ================================================================

-- Tính số dư tài khoản
CREATE OR REPLACE FUNCTION calculate_account_balance(p_account_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_opening_balance BIGINT;
  v_entries_total BIGINT;
BEGIN
  SELECT opening_balance_minor INTO v_opening_balance
  FROM financial_accounts
  WHERE id = p_account_id;

  SELECT COALESCE(SUM(amount_minor), 0) INTO v_entries_total
  FROM transaction_entries te
  JOIN transactions t ON te.transaction_id = t.id
  WHERE te.account_id = p_account_id
    AND t.status != 'voided';

  RETURN COALESCE(v_opening_balance, 0) + COALESCE(v_entries_total, 0);
END;
$$ LANGUAGE plpgsql;

-- Tính tổng tài sản
CREATE OR REPLACE FUNCTION calculate_net_worth(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN fa.type = 'credit_card' THEN -calculate_account_balance(fa.id)
         ELSE calculate_account_balance(fa.id)
    END
  ), 0)
  INTO v_total
  FROM financial_accounts fa
  WHERE fa.user_id = p_user_id
    AND fa.include_in_net_worth = TRUE
    AND fa.is_archived = FALSE;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- Kiểm tra tổng entries bằng 0 với transfer
CREATE OR REPLACE FUNCTION validate_transfer_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction_type transaction_type;
BEGIN
  SELECT type INTO v_transaction_type FROM transactions WHERE id = NEW.transaction_id;

  IF v_transaction_type = 'transfer' THEN
    -- Kiểm tra tổng entries = 0
    IF (
      SELECT SUM(amount_minor) FROM transaction_entries WHERE transaction_id = NEW.transaction_id
    ) != 0 THEN
      RAISE EXCEPTION 'Transfer entries must sum to zero';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- SEED DATA: System Categories (tiếng Việt)
-- Spec: Milestone 1 - Seed category tiếng Việt
-- ================================================================

-- Tạo function để seed categories sau khi profile được tạo
CREATE OR REPLACE FUNCTION seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Categories chi tiêu (expense)
  INSERT INTO categories (user_id, name, kind, icon, color, is_system, sort_order) VALUES
    (p_user_id, 'Ăn uống', 'expense', 'restaurant', '#FF5722', TRUE, 1),
    (p_user_id, 'Di chuyển', 'expense', 'directions_car', '#2196F3', TRUE, 2),
    (p_user_id, 'Mua sắm', 'expense', 'shopping_bag', '#9C27B0', TRUE, 3),
    (p_user_id, 'Nhà ở', 'expense', 'home', '#795548', TRUE, 4),
    (p_user_id, 'Hóa đơn & Tiện ích', 'expense', 'receipt_long', '#607D8B', TRUE, 5),
    (p_user_id, 'Giải trí', 'expense', 'sports_esports', '#E91E63', TRUE, 6),
    (p_user_id, 'Sức khỏe', 'expense', 'local_hospital', '#F44336', TRUE, 7),
    (p_user_id, 'Giáo dục', 'expense', 'school', '#3F51B5', TRUE, 8),
    (p_user_id, 'Làm đẹp', 'expense', 'spa', '#00BCD4', TRUE, 9),
    (p_user_id, 'Bảo hiểm', 'expense', 'security', '#009688', TRUE, 10),
    (p_user_id, 'Tài chính', 'expense', 'account_balance', '#673AB7', TRUE, 11),
    (p_user_id, 'Quà tặng', 'expense', 'card_giftcard', '#FFC107', TRUE, 12),
    (p_user_id, 'Khác', 'expense', 'more_horiz', '#9E9E9E', TRUE, 99);

  -- Categories thu nhập (income)
  INSERT INTO categories (user_id, name, kind, icon, color, is_system, sort_order) VALUES
    (p_user_id, 'Lương', 'income', 'payments', '#4CAF50', TRUE, 1),
    (p_user_id, 'Thưởng', 'income', 'card_giftcard', '#8BC34A', TRUE, 2),
    (p_user_id, 'Đầu tư', 'income', 'trending_up', '#CDDC39', TRUE, 3),
    (p_user_id, 'Kinh doanh', 'income', 'store', '#FFEB3B', TRUE, 4),
    (p_user_id, 'Cho thuê', 'income', 'house', '#FFC107', TRUE, 5),
    (p_user_id, 'Quà tặng nhận được', 'income', 'volunteer_activism', '#FF9800', TRUE, 6),
    (p_user_id, 'Hoàn tiền', 'income', 'replay', '#FF5722', TRUE, 7),
    (p_user_id, 'Thu nhập khác', 'income', 'more_horiz', '#9E9E9E', TRUE, 99);
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Auto-create profile on user signup
-- Spec: mục 15.1 - Tạo sẵn một auth user
-- ================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
