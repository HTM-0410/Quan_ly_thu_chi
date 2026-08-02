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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}