// ============================================================
// Domain types — pure data shapes, không phụ thuộc Supabase.
// Dùng cho cả Database typing và UI components.
// Lưu ý: dùng `type = {...}` thay vì `interface {...}` để tương
// thích với @supabase/supabase-js generic typing (interface gây
// resolve về `never` cho Insert/Update).
// ============================================================

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'savings' | 'other';
export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment';
export type TransactionStatus = 'pending' | 'posted' | 'voided';
export type TransactionSource = 'manual' | 'bank' | 'csv' | 'recurring';
export type ClassificationStatus = 'unclassified' | 'suggested' | 'confirmed';
export type CategoryKind = 'income' | 'expense' | 'both';
export type BankConnectionStatus =
  | 'pending'
  | 'active'
  | 'requires_action'
  | 'error'
  | 'disconnected';
export type BankEventStatus = 'received' | 'normalized' | 'matched' | 'ignored' | 'error';
export type BudgetCadence = 'weekly' | 'monthly' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'paused' | 'abandoned';
export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';
export type RecurringStatus = 'active' | 'paused' | 'ended';

export type Profile = {
  id: string;
  display_name: string;
  base_currency: string;
  timezone: string;
  locale: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
  version: number;
};

export type FinancialAccount = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance_minor: number;
  opening_balance_at: string;
  credit_limit_minor: number | null;
  institution_name: string | null;
  masked_account_number: string | null;
  color: string;
  icon: string;
  is_archived: boolean;
  include_in_net_worth: boolean;
  reported_balance_minor: number | null;
  reported_balance_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type CategoryScope = 'global' | 'user';

export type Category = {
  id: string;
  scope: CategoryScope; // 'global' = bảng global_categories (share), 'user' = bảng categories riêng
  user_id: string | null;
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  icon: string;
  color: string;
  is_system: boolean;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  version: number;
};

/** Prefix id để phân biệt global vs user khi share 1 không gian UUID. */
export const GLOBAL_CATEGORY_PREFIX = 'global:';

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  status: TransactionStatus;
  occurred_at: string;
  amount_minor: number;
  currency: string;
  category_id: string | null;
  global_category_id: string | null;
  payee: string | null;
  note: string | null;
  source: TransactionSource;
  bank_event_id: string | null;
  transfer_group_id: string | null;
  refund_of_transaction_id: string | null;
  client_generated_id: string | null;
  classification_status: ClassificationStatus;
  metadata: Record<string, unknown>;
  /** Account của transaction (join từ transaction_entries). Với transfer, account_id là from_account_id. */
  account_id: string | null;
  /** Tài khoản nguồn (dành cho transfer: entry âm). */
  from_account_id?: string | null;
  /** Tài khoản đích (dành cho transfer: entry dương). */
  to_account_id?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type Budget = {
  id: string;
  user_id: string;
  name: string;
  cadence: BudgetCadence;
  amount_minor: number;
  start_date: string;
  end_date: string | null;
  rollover_enabled: boolean;
  alert_thresholds: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
  category_ids?: string[];
};

export type SavingGoal = {
  id: string;
  user_id: string;
  name: string;
  target_amount_minor: number;
  currency: string;
  current_amount_minor: number;
  start_date: string;
  target_date: string | null;
  note: string | null;
  icon: string;
  color: string;
  status: GoalStatus;
  linked_account_id: string | null;
  client_generated_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type GoalContribution = {
  id: string;
  goal_id: string;
  user_id: string;
  amount_minor: number;
  occurred_at: string;
  note: string | null;
  transaction_id: string | null;
  client_generated_id: string | null;
  created_at: string;
};

export type RecurringRule = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  account_id: string;
  amount_minor: number;
  currency: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  category_id: string | null;
  global_category_id: string | null;
  payee: string | null;
  note: string | null;
  day_of_month: number | null;
  day_of_week: number | null;
  next_occurrence: string;
  last_occurrence: string | null;
  status: RecurringStatus;
  client_generated_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

// ============================================================
// Bank domain (Casso / Open Banking)
// ============================================================

export type BankConnection = {
  id: string;
  user_id: string;
  provider: string;
  provider_connection_id: string | null;
  institution_code: string | null;
  institution_name: string | null;
  status: BankConnectionStatus;
  consent_granted_at: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  encrypted_provider_token: string | null;
  created_at: string;
  updated_at: string;
};

export type BankAccount = {
  id: string;
  bank_connection_id: string;
  financial_account_id: string;
  provider_account_id: string;
  masked_account_number: string | null;
  account_name: string | null;
  currency: string;
  sync_incoming: boolean;
  sync_outgoing: boolean;
  created_at: string;
};

export type BankEvent = {
  id: string;
  bank_connection_id: string;
  provider_event_id: string;
  provider_transaction_id: string | null;
  bank_account_id: string | null;
  occurred_at: string;
  booked_at: string | null;
  signed_amount_minor: number;
  currency: string;
  description: string | null;
  reference_code: string | null;
  counterparty_name: string | null;
  counterparty_account: string | null;
  balance_after_minor: number | null;
  status: BankEventStatus;
  matched_transaction_id: string | null;
  received_at: string;
  payload: Record<string, unknown>;
  payload_hash: string;
};

// ============================================================
// People & Debts (Quản lý công nợ đơn giản)
// ============================================================

export type DebtType = 'lend' | 'borrow';
export type DebtStatus = 'active' | 'paid';

// ============================================================
// Bills (chụp bill siêu thị / hoá đơn mua sắm — 1:1 với transaction)
// ============================================================

export type BillChannel = 'online' | 'offline';
export type OnlineMarketplace = 'shopee' | 'lazada' | 'tiktok_shop' | 'other';

export type Bill = {
  id: string;
  user_id: string;
  transaction_id: string;
  channel_type: BillChannel;
  online_marketplace: OnlineMarketplace | null;
  online_marketplace_other: string | null;
  store_name: string | null;
  declared_total_minor: number;
  item_count: number;
  raw_ocr: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
};

export type BillItem = {
  id: string;
  bill_id: string;
  user_id: string;
  position: number;
  product_name: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  note: string | null;
  created_at: string;
};

export type BillWithItems = {
  bill: Bill;
  items: BillItem[];
};

export type Person = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  created_at: string;
};

export type Debt = {
  id: string;
  user_id: string;
  person_id: string | null;  // nullable for backwards compat
  type: DebtType;
  counterparty_name: string;  // NOT NULL in DB
  counterparty_phone?: string | null;  // legacy field
  original_amount: number;
  remaining_amount: number;
  status: DebtStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DebtPayment = {
  id: string;
  debt_id: string;
  amount: number;
  payment_date: string;
  note?: string | null;
  created_at: string;
};