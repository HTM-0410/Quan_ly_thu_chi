import { supabase } from './supabase';
import type {
  FinancialAccount,
  Category,
  Transaction,
  SavingGoal,
  Budget,
  RecurringRule,
  Profile,
} from './types';

// ============================================================
// Profiles
// ============================================================
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'display_name' | 'base_currency' | 'timezone' | 'locale' | 'onboarding_completed'>>,
) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

// ============================================================
// Accounts
// ============================================================
export async function listAccounts(): Promise<FinancialAccount[]> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as FinancialAccount[]) ?? [];
}

/**
 * 1 round-trip: trả về account + balance_minor.
 * Thay thế N+1 (listAccounts rồi Promise.all(getAccountBalance)).
 */
export async function listAccountsWithBalances(): Promise<
  (FinancialAccount & { balance: number })[]
> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc('list_accounts_with_balances' as never, {
    p_user_id: userId,
  } as never);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    name: string;
    type: FinancialAccount['type'];
    currency: string;
    opening_balance_minor: number | string;
    color: string;
    icon: string;
    institution_name: string | null;
    include_in_net_worth: boolean;
    is_archived: boolean;
    version: number;
    created_at: string;
    updated_at: string;
    balance_minor: number | string;
  }>;
  return rows.map(row => ({
    ...(row as unknown as FinancialAccount),
    opening_balance_minor: Number(row.opening_balance_minor),
    balance: Number(row.balance_minor),
  }));
}

export async function createAccount(input: {
  name: string;
  type: FinancialAccount['type'];
  currency?: string;
  opening_balance_minor: number;
  color?: string;
  icon?: string;
  institution_name?: string | null;
}) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({
      user_id: userId,
      name: input.name,
      type: input.type,
      currency: input.currency ?? 'VND',
      opening_balance_minor: input.opening_balance_minor,
      color: input.color ?? '#1E88E5',
      icon: input.icon ?? 'account_balance_wallet',
      institution_name: input.institution_name ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as FinancialAccount;
}

export async function updateAccount(id: string, patch: Partial<FinancialAccount>) {
  const { error } = await supabase.from('financial_accounts').update(patch).eq('id', id);
  if (error) throw error;
}

export async function archiveAccount(id: string) {
  const { error } = await supabase
    .from('financial_accounts')
    .update({ is_archived: true })
    .eq('id', id);
  if (error) throw error;
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_account_balance', {
    p_account_id: accountId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getNetWorth(): Promise<number> {
  const { data, error } = await supabase.rpc('get_net_worth');
  if (error) throw error;
  return Number(data ?? 0);
}

// ============================================================
// Categories
// ============================================================
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', false)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as Category[]) ?? [];
}

export async function createCategory(input: {
  name: string;
  kind: Category['kind'];
  color?: string;
  icon?: string;
  parent_id?: string | null;
}) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      name: input.name,
      kind: input.kind,
      color: input.color ?? '#757575',
      icon: input.icon ?? 'category',
      parent_id: input.parent_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, patch: Partial<Category>) {
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  if (error) throw error;
}

// ============================================================
// Transactions
// ============================================================
export async function listTransactions(opts?: {
  limit?: number;
  from?: string;
  to?: string;
  accountId?: string;
  type?: Transaction['type'];
  categoryId?: string;
}): Promise<Transaction[]> {
  // Query 1: lấy transactions bình thường (không nested select — PostgREST đôi khi
  // trả 400 với cú pháp `*,relation!inner(...)` và gây lỗi `[object Object]` ở UI).
  let q = supabase
    .from('transactions')
    .select('*')
    .eq('status', 'posted')
    .order('occurred_at', { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.from) q = q.gte('occurred_at', opts.from);
  if (opts?.to) q = q.lt('occurred_at', opts.to);
  if (opts?.type) q = q.eq('type', opts.type);
  if (opts?.categoryId) q = q.eq('category_id', opts.categoryId);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data as Transaction[]) ?? [];
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return rows;

  // Query 2: lấy (transaction_id, account_id) từ transaction_entries cho các tx trên.
  // Dùng `in.(...)` thay vì nested select. Với transfer có 2 entries: lấy entry đầu tiên
  // cho hiển thị (UI dùng `acc` cho tên account, fallback "—" nếu null).
  let entriesQ = supabase
    .from('transaction_entries')
    .select('transaction_id, account_id')
    .in('transaction_id', ids);
  if (opts?.accountId) entriesQ = entriesQ.eq('account_id', opts.accountId as string);
  const { data: entriesData, error: entriesError } = await entriesQ;
  if (entriesError) throw entriesError;

  // Lấy account_id đầu tiên cho mỗi transaction_id.
  const accountByTxId = new Map<string, string>();
  for (const e of (entriesData ?? []) as Array<{ transaction_id: string; account_id: string }>) {
    if (!accountByTxId.has(e.transaction_id)) {
      accountByTxId.set(e.transaction_id, e.account_id);
    }
  }

  // Nếu có accountId filter mà không tìm thấy entries nào khớp, trả về rỗng.
  if (opts?.accountId && accountByTxId.size === 0) return [];

  return rows.map(r => ({ ...r, account_id: accountByTxId.get(r.id) ?? null }));
}

export async function createManualTransaction(input: {
  client_generated_id?: string;
  type: 'income' | 'expense';
  account_id: string;
  amount_minor: number;
  occurred_at: string;
  category_id?: string | null;
  payee?: string | null;
  note?: string | null;
  /** True nếu đến từ OCR — append marker [OCR] vào note để audit trail. */
  fromOcr?: boolean;
}) {
  const finalNote = input.fromOcr
    ? input.note
      ? `${input.note} [OCR]`
      : '[OCR]'
    : input.note ?? null;

  // Retry tối đa 3 lần với client_generated_id mới nếu RPC trả 409 (idempotency conflict).
  // Nguyên nhân: RPC có thể trả 409 khi client_generated_id đã tồn tại ở request khác
  // (vd OCR batch gọi nhiều lần do retry mạng, hoặc user double-click import).
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const cid = input.client_generated_id ?? crypto.randomUUID();
    const { data, error } = await supabase.rpc('create_manual_transaction', {
      p_client_generated_id: cid,
      p_type: input.type,
      p_account_id: input.account_id,
      p_amount_minor: input.amount_minor,
      p_currency: 'VND',
      p_occurred_at: input.occurred_at,
      p_category_id: input.category_id ?? null,
      p_payee: input.payee ?? null,
      p_note: finalNote,
      p_source: 'manual',
    });
    if (!error) return data as string;
    lastError = error;
    // eslint-disable-next-line no-console
    console.error('[ocr] RPC failed:', {
      attempt,
      cid,
      payload: {
        type: input.type,
        account_id: input.account_id,
        amount_minor: input.amount_minor,
        occurred_at: input.occurred_at,
        category_id: input.category_id,
        payee: input.payee,
        note_len: finalNote?.length ?? 0,
      },
      error: {
        message: error.message,
        code: (error as { code?: string }).code,
        status: (error as { status?: number }).status,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
      },
    });
    // Chỉ retry khi 409 conflict (idempotency); các lỗi khác throw ngay.
    const status =
      (error as { status?: number; code?: string }).status ??
      (error as { statusCode?: number }).statusCode;
    const code = (error as { code?: string }).code;
    const isConflict = status === 409 || code === '409' || code === 'P0001';
    if (!isConflict) break;
    // Force new uuid cho lần retry kế tiếp (tránh tái sử dụng cid bị trùng).
    input.client_generated_id = undefined;
    // Small backoff để tránh race với transaction đang insert.
    await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
  }
  // Surface error message đầy đủ cho UI (kèm status, code, details).
  const err = lastError as { message?: string; code?: string; status?: number; details?: string };
  const detail = [err.message, err.code, err.details].filter(Boolean).join(' | ');
  throw new Error(detail || 'RPC create_manual_transaction failed');
}

/**
 * Import hàng loạt giao dịch OCR. Trả về per-row result để UI hiện
 * success/failure riêng (1 row fail không chặn các row khác).
 */
export async function importOcrTransactions(
  rows: Array<{
    account_id: string;
    type: 'income' | 'expense';
    amount_minor: number;
    occurred_at: string;
    category_id?: string | null;
    payee?: string | null;
    note?: string | null;
  }>,
): Promise<Array<{ ok: true; id: string } | { ok: false; error: string; row: number }>> {
  const results: Array<
    { ok: true; id: string } | { ok: false; error: string; row: number }
  > = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    try {
      const id = await createManualTransaction({ ...r, fromOcr: true });
      results.push({ ok: true, id });
    } catch (e) {
      results.push({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        row: i,
      });
    }
  }
  return results;
}

export async function createTransfer(input: {
  from_account_id: string;
  to_account_id: string;
  amount_minor: number;
  fee_minor?: number;
  occurred_at?: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc('create_transfer', {
    p_client_generated_id: crypto.randomUUID(),
    p_from_account_id: input.from_account_id,
    p_to_account_id: input.to_account_id,
    p_amount_minor: input.amount_minor,
    p_fee_minor: input.fee_minor ?? 0,
    p_occurred_at: input.occurred_at ?? new Date().toISOString(),
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function voidTransaction(transactionId: string, reason?: string) {
  const { data, error } = await supabase.rpc('void_transaction', {
    p_transaction_id: transactionId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

/**
 * Sửa giao dịch income/expense (transfer không sửa được).
 * Truyền field nào thì đổi field đó. category_id = null + clear=false sẽ giữ
 * category cũ; truyền null + clear=true để xóa danh mục.
 */
export async function updateTransaction(
  id: string,
  patch: {
    type?: 'income' | 'expense';
    account_id?: string;
    amount_minor?: number;
    occurred_at?: string;
    category_id?: string | null;
    payee?: string | null;
    note?: string | null;
  },
) {
  const wantsClear = patch.category_id === null;
  const { error } = await supabase.rpc('update_transaction', {
    p_transaction_id: id,
    p_type: patch.type ?? null,
    p_account_id: patch.account_id ?? null,
    p_amount_minor: patch.amount_minor ?? null,
    p_occurred_at: patch.occurred_at ?? null,
    p_category_id: wantsClear ? null : patch.category_id ?? null,
    p_clear_category: wantsClear,
    p_payee: patch.payee ?? null,
    p_note: patch.note ?? null,
  });
  if (error) throw error;
}

/**
 * Đặt số dư tuyệt đối cho tài khoản (điều chỉnh opening_balance_minor).
 * Trả về opening_balance_minor mới.
 */
export async function adjustAccountBalance(
  accountId: string,
  targetBalanceMinor: number,
  note?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_account_balance', {
    p_account_id: accountId,
    p_target_balance_minor: targetBalanceMinor,
    p_note: note ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Lấy account_id thật của giao dịch từ transaction_entries (ledger).
 * Dùng cho edit form vì transactions.account_id không tồn tại.
 */
export async function getTransactionAccountId(transactionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('transaction_entries')
    .select('account_id')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (error) throw error;
  return (data as { account_id: string } | null)?.account_id ?? null;
}

export async function getTransactionsSummary(opts: {
  start_date: string;
  end_date: string;
  category_id?: string;
}) {
  const { data, error } = await supabase.rpc('get_transactions_summary', {
    p_start_date: opts.start_date,
    p_end_date: opts.end_date,
    p_category_id: opts.category_id ?? null,
  });
  if (error) throw error;
  return data?.[0] as
    | {
        total_income: number;
        total_expense: number;
        net_change: number;
        transaction_count: number;
      }
    | undefined;
}

/**
 * Trả về income/expense cho N tháng gần nhất (1 round-trip).
 * Thay thế việc gọi getTransactionsSummary tuần tự trong for-loop.
 */
export async function getMonthlyHistory(months = 6) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc('get_monthly_history' as never, {
    p_user_id: userId,
    p_months: months,
  } as never);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    period_start: string;
    period_end: string;
    total_income: number | string;
    total_expense: number | string;
    net_change: number | string;
    transaction_count: number | string;
  }>;
  return rows.map(row => ({
    period_start: row.period_start,
    period_end: row.period_end,
    total_income: Number(row.total_income),
    total_expense: Number(row.total_expense),
    net_change: Number(row.net_change),
    transaction_count: Number(row.transaction_count),
  }));
}

// ============================================================
// Goals
// ============================================================
export async function listGoals(): Promise<SavingGoal[]> {
  const { data, error } = await supabase
    .from('saving_goals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SavingGoal[]) ?? [];
}

export async function createGoal(input: {
  name: string;
  target_amount_minor: number;
  start_date: string;
  target_date?: string | null;
  color?: string;
  icon?: string;
  note?: string | null;
  linked_account_id?: string | null;
}) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('saving_goals')
    .insert({
      user_id: userId,
      name: input.name,
      target_amount_minor: input.target_amount_minor,
      currency: 'VND',
      start_date: input.start_date,
      target_date: input.target_date ?? null,
      color: input.color ?? '#FFC107',
      icon: input.icon ?? 'savings',
      note: input.note ?? null,
      linked_account_id: input.linked_account_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SavingGoal;
}

export async function updateGoal(id: string, patch: Partial<SavingGoal>) {
  const { error } = await supabase.from('saving_goals').update(patch).eq('id', id);
  if (error) throw error;
}

export async function addGoalContribution(input: {
  goal_id: string;
  amount_minor: number;
  occurred_at?: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc('add_goal_contribution', {
    p_goal_id: input.goal_id,
    p_amount_minor: input.amount_minor,
    p_occurred_at: input.occurred_at ?? new Date().toISOString(),
    p_note: input.note ?? null,
    p_client_generated_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Budgets
// ============================================================
export async function listBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Budget[]) ?? [];
}

export async function createBudget(input: {
  name: string;
  amount_minor: number;
  cadence?: Budget['cadence'];
  start_date: string;
  end_date?: string | null;
}) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('budgets')
    .insert({
      user_id: userId,
      name: input.name,
      amount_minor: input.amount_minor,
      cadence: input.cadence ?? 'monthly',
      start_date: input.start_date,
      end_date: input.end_date ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Budget;
}

export async function getBudgetProgress(
  budget_id: string,
  period_start: string,
  period_end: string,
) {
  const { data, error } = await supabase.rpc('get_budget_progress', {
    p_budget_id: budget_id,
    p_period_start: period_start,
    p_period_end: period_end,
  });
  if (error) throw error;
  return data?.[0] as
    | {
        budget_id: string;
        period_start: string;
        period_end: string;
        spent_minor: number;
        transaction_count: number;
        percent: number;
      }
    | undefined;
}

// ============================================================
// Recurring
// ============================================================
export async function listRecurring(): Promise<RecurringRule[]> {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .order('next_occurrence', { ascending: true });
  if (error) throw error;
  return (data as RecurringRule[]) ?? [];
}

export async function createRecurring(input: {
  name: string;
  type: 'income' | 'expense';
  account_id: string;
  amount_minor: number;
  frequency: RecurringRule['frequency'];
  start_date: string;
  day_of_month?: number | null;
  category_id?: string | null;
  payee?: string | null;
  note?: string | null;
}) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('recurring_rules')
    .insert({
      user_id: userId,
      name: input.name,
      type: input.type,
      account_id: input.account_id,
      amount_minor: input.amount_minor,
      currency: 'VND',
      frequency: input.frequency,
      start_date: input.start_date,
      next_occurrence: new Date(input.start_date).toISOString(),
      day_of_month: input.day_of_month ?? null,
      category_id: input.category_id ?? null,
      payee: input.payee ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RecurringRule;
}

export async function updateRecurring(id: string, patch: Partial<RecurringRule>) {
  const { error } = await supabase.from('recurring_rules').update(patch).eq('id', id);
  if (error) throw error;
}

export async function materializeRecurring(upTo?: string) {
  const { data, error } = await supabase.rpc('materialize_recurring_rules', {
    p_up_to: upTo ?? new Date().toISOString(),
  });
  if (error) throw error;
  return Number(data ?? 0);
}