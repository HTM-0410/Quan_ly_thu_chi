import type {
  Profile,
  FinancialAccount,
  Category,
  Transaction,
  Budget,
  SavingGoal,
  GoalContribution,
  RecurringRule,
  BankConnection,
  BankAccount,
  BankEvent,
  Person,
  Debt,
  DebtPayment,
  Bill,
  BillItem,
} from './domain';

// ============================================================
// Helper types: Insert/Update tự động Partial<Row>.
// Supabase v2.111 typing yêu cầu mọi Table extend GenericTable
// ({ Row, Insert, Update, Relationships: GenericRelationship[] }).
// Insert dùng Partial<Row> để tránh intersection gây infer collapse.
// RLS / CHECK constraint ở DB lo phần required fields.
// ============================================================
type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    isOneToOne?: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

type RpcShape<Args extends Record<string, unknown>, Returns> = {
  Args: Args;
  Returns: Returns;
};

type RpcScalar<A extends Record<string, unknown>, R> = RpcShape<A, R>;
type RpcSetof<A extends Record<string, unknown>, R extends Record<string, unknown>> = RpcShape<
  A,
  R[]
>;

// ============================================================
// Database — khớp GenericSchema của @supabase/supabase-js.
// ============================================================
export interface Database {
  public: {
    Tables: {
      profiles: TableShape<Profile>;
      financial_accounts: TableShape<FinancialAccount>;
      categories: TableShape<Category>;
      global_categories: TableShape<{
        id: string;
        name: string;
        kind: 'income' | 'expense' | 'both';
        icon: string | null;
        color: string | null;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      transactions: TableShape<Transaction>;
      budgets: TableShape<Budget>;
      budget_categories: TableShape<{ budget_id: string; category_id: string }>;
      saving_goals: TableShape<SavingGoal>;
      goal_contributions: TableShape<GoalContribution>;
      recurring_rules: TableShape<RecurringRule>;
      bank_connections: TableShape<BankConnection>;
      bank_accounts: TableShape<BankAccount>;
      bank_events: TableShape<BankEvent>;
      audit_logs: TableShape<{
        id: string;
        user_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      people: TableShape<Person>;
      debts: TableShape<Debt>;
      debt_payments: TableShape<DebtPayment>;
      bills: TableShape<Bill>;
      bill_items: TableShape<BillItem>;
    };
    Views: Record<string, never>;
    Functions: {
      create_manual_transaction: RpcScalar<
        {
          p_client_generated_id: string;
          p_type: 'income' | 'expense';
          p_account_id: string;
          p_amount_minor: number;
          p_currency?: string;
          p_occurred_at: string;
          p_category_id?: string | null;
          p_payee?: string | null;
          p_note?: string | null;
        },
        string
      >;
      create_transfer: RpcScalar<
        {
          p_client_generated_id: string;
          p_from_account_id: string;
          p_to_account_id: string;
          p_amount_minor: number;
          p_fee_minor?: number;
          p_occurred_at?: string | null;
          p_note?: string | null;
        },
        string
      >;
      void_transaction: RpcScalar<
        { p_transaction_id: string; p_reason?: string | null },
        boolean
      >;
      get_account_balance: RpcScalar<{ p_account_id: string }, number>;
      get_net_worth: RpcScalar<Record<string, never>, number>;
      get_transactions_summary: RpcSetof<
        { p_start_date: string; p_end_date: string; p_category_id?: string | null },
        {
          total_income: number;
          total_expense: number;
          net_change: number;
          transaction_count: number;
        }
      >;
      add_goal_contribution: RpcScalar<
        {
          p_goal_id: string;
          p_amount_minor: number;
          p_occurred_at?: string;
          p_note?: string | null;
          p_client_generated_id?: string | null;
          p_create_transaction?: boolean;
          p_transaction_payload?: Record<string, unknown> | null;
        },
        string
      >;
      get_budget_progress: RpcSetof<
        { p_budget_id: string; p_period_start: string; p_period_end: string },
        {
          budget_id: string;
          period_start: string;
          period_end: string;
          spent_minor: number;
          transaction_count: number;
          percent: number;
        }
      >;
      materialize_recurring_rules: RpcScalar<
        { p_up_to?: string; p_max_rules?: number },
        number
      >;
      update_transaction: RpcScalar<
        {
          p_transaction_id: string;
          p_type?: 'income' | 'expense' | 'refund' | null;
          p_account_id?: string | null;
          p_amount_minor?: number | null;
          p_occurred_at?: string | null;
          p_category_id?: string | null;
          p_clear_category?: boolean;
          p_payee?: string | null;
          p_note?: string | null;
        },
        void
      >;
      adjust_account_balance: RpcScalar<
        {
          p_account_id: string;
          p_target_balance_minor: number;
          p_note?: string | null;
        },
        number
      >;
      // People & Debts
      get_people: RpcSetof<Record<string, never>, Person>;
      create_person: RpcScalar<
        { p_name: string; p_phone?: string | null },
        Person
      >;
      delete_person: RpcScalar<{ p_id: string }, boolean>;
      get_debts: RpcSetof<{ p_status?: string | null }, Debt>;
      get_debt_payments: RpcSetof<{ p_debt_id: string }, DebtPayment>;
      create_debt: RpcScalar<
        {
          p_person_id: string;
          p_type: 'lend' | 'borrow';
          p_original_amount: number;
          p_notes?: string | null;
        },
        Debt
      >;
      delete_debt: RpcScalar<{ p_id: string }, boolean>;
      add_debt_payment: RpcScalar<
        {
          p_debt_id: string;
          p_amount: number;
          p_payment_date?: string | null;
          p_note?: string | null;
        },
        DebtPayment
      >;
      mark_debt_paid: RpcScalar<{ p_id: string }, void>;
      get_debt_summary: RpcSetof<Record<string, never>, { metric: string; amount: number; count: number }>;
      // Bills
      get_bill_with_items: RpcScalar<{ p_transaction_id: string }, { bill: Bill; items: BillItem[] } | null>;
      create_bill_with_items: RpcScalar<
        {
          p_transaction_id: string;
          p_channel_type: 'online' | 'offline';
          p_online_marketplace?: 'shopee' | 'lazada' | 'tiktok_shop' | 'other' | null;
          p_online_marketplace_other?: string | null;
          p_store_name?: string | null;
          p_declared_total_minor: number;
          p_items: Array<{
            product_name: string;
            quantity: number;
            unit_price_minor: number;
            line_total_minor: number;
            note?: string | null;
          }>;
        },
        string
      >;
      update_bill_with_items: RpcScalar<
        {
          p_bill_id: string;
          p_channel_type: 'online' | 'offline';
          p_online_marketplace?: 'shopee' | 'lazada' | 'tiktok_shop' | 'other' | null;
          p_online_marketplace_other?: string | null;
          p_store_name?: string | null;
          p_declared_total_minor: number;
          p_items: Array<{
            product_name: string;
            quantity: number;
            unit_price_minor: number;
            line_total_minor: number;
            note?: string | null;
          }>;
        },
        string
      >;
      delete_bill: RpcScalar<{ p_bill_id: string }, boolean>;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}