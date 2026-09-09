import { supabase } from './supabase';
import { GLOBAL_CATEGORY_PREFIX } from './domain';
import { calculateInitialNextOccurrence } from './recurringSchedule';
import type {
  FinancialAccount,
  Category,
  Transaction,
  SavingGoal,
  GoalContribution,
  Budget,
  RecurringRule,
  Profile,
  Person,
  Debt,
  DebtPayment,
  Bill,
  BillItem,
  BillChannel,
  OnlineMarketplace,
} from './types';
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
export async function listAccountsWithBalances(includeArchived = false): Promise<
  (FinancialAccount & { balance: number })[]
> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc('list_accounts_with_balances' as never, {
    p_user_id: userId,
    p_include_archived: includeArchived,
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

export async function unarchiveAccount(id: string) {
  const { error } = await supabase
    .from('financial_accounts')
    .update({ is_archived: false })
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
  // Query song song 2 bảng: user-private (categories) + global share (global_categories)
  const [userCats, globalCats] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('is_archived', false)
      .order('kind', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase
      .from('global_categories')
      .select('*')
      .eq('is_active', true)
      .order('kind', { ascending: true })
      .order('sort_order', { ascending: true }),
  ]);
  if (userCats.error) throw userCats.error;
  if (globalCats.error) throw globalCats.error;

  // Normalize global → Category với scope='global' và id prefix 'global:' để tránh
  // đụng UUID với user cats. Frontend dùng id này; khi save transaction sẽ nhận biết
  // qua prefix để map sang cột global_category_id / category_id.
  const userRows: Category[] = ((userCats.data as Category[]) ?? []).map(c => ({
    ...c,
    scope: 'user' as const,
  }));
  const globalRows: Category[] = ((globalCats.data as any[]) ?? []).map(g => ({
    id: `${GLOBAL_CATEGORY_PREFIX}${g.id}`,
    scope: 'global' as const,
    user_id: null,
    name: g.name,
    kind: g.kind,
    parent_id: g.parent_id ? `${GLOBAL_CATEGORY_PREFIX}${g.parent_id}` : null,
    icon: g.icon ?? 'category',
    color: g.color ?? '#757575',
    is_system: true,
    is_archived: !g.is_active,
    sort_order: g.sort_order,
    created_at: g.created_at,
    updated_at: g.updated_at,
    version: 1,
  }));

  return [...userRows, ...globalRows];
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
  if (id.startsWith(GLOBAL_CATEGORY_PREFIX)) {
    throw new Error('Không thể sửa danh mục hệ thống toàn cục');
  }
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  if (id.startsWith(GLOBAL_CATEGORY_PREFIX)) {
    throw new Error('Không thể xóa danh mục hệ thống toàn cục');
  }
  // Bảo vệ dữ liệu: nếu CHA có CON thì không xóa CHA (gỡ CON trước).
  const { count: childCount } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id);
  if ((childCount ?? 0) > 0) {
    throw new Error('Bạn cần xoá hoặc di chuyển các danh mục con trước.');
  }
  // Bảo vệ dữ liệu: nếu còn giao dịch trỏ tới category này thì cảnh báo.
  const { count: txCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .or(`category_id.eq.${id},global_category_id.eq.${id}`);
  if ((txCount ?? 0) > 0) {
    throw new Error(
      'Danh mục đang được sử dụng bởi giao dịch. Hãy đổi sang danh mục khác trước khi xoá.',
    );
  }
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Trả về map<categoryId, {direct, tree}> đếm số giao dịch user.
 * - `direct`: tx gắn trực tiếp vào category này
 * - `tree`:   tx gắn vào category này + tất cả CON cháu
 */
export async function getCategoryUsageCounts(
  ids: string[],
): Promise<Record<string, { direct: number; tree: number }>> {
  if (ids.length === 0) return {};
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  // RPC nhận UUID[]; strip prefix `global:` để lấy realId.
  const realIds = ids.map(id => splitCategoryId(id).realId).filter(Boolean) as string[];

  const { data, error } = await supabase.rpc('get_category_usage_counts' as never, {
    p_category_ids: realIds,
    p_user_id: userId,
  } as never);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    category_id: string;
    direct_count: number | string;
    tree_count: number | string;
  }>;
  const map: Record<string, { direct: number; tree: number }> = {};
  for (const r of rows) {
    // Trả lại key với prefix để match id frontend gửi
    const key = ids.find(id => splitCategoryId(id).realId === r.category_id);
    if (key) {
      map[key] = {
        direct: Number(r.direct_count),
        tree: Number(r.tree_count),
      };
    }
  }
  // Fill missing → 0
  for (const id of ids) {
    if (!map[id]) map[id] = { direct: 0, tree: 0 };
  }
  return map;
}

/**
 * Split 1 category id thành {scope, realId}. Trả về cặp này để dispatch sang
 * cột category_id (user) hoặc global_category_id (global) khi save transaction.
 */
export function splitCategoryId(id: string | null | undefined): {
  scope: 'global' | 'user';
  realId: string | null;
} {
  if (!id) return { scope: 'user', realId: null };
  if (id.startsWith(GLOBAL_CATEGORY_PREFIX)) {
    return { scope: 'global', realId: id.slice(GLOBAL_CATEGORY_PREFIX.length) };
  }
  return { scope: 'user', realId: id };
}

/** Helper ngược: build payload category fields khi save transaction/recurring. */
export function pickCategoryFields(id: string | null | undefined): {
  category_id: string | null;
  global_category_id: string | null;
} {
  const { scope, realId } = splitCategoryId(id);
  if (!realId) return { category_id: null, global_category_id: null };
  if (scope === 'global') return { category_id: null, global_category_id: realId };
  return { category_id: realId, global_category_id: null };
}

// ============================================================
// Transactions
// ============================================================
export interface ListTransactionsOptions {
  limit?: number;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  accountId?: string;
  type?: Transaction['type'] | 'all';
  categoryId?: string;
  status?: 'posted' | 'voided' | 'all';
  search?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface PaginatedTransactionsResult {
  items: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listTransactionsPaginated(
  opts?: ListTransactionsOptions,
): Promise<PaginatedTransactionsResult> {
  const pageSize = opts?.pageSize ?? opts?.limit ?? 50;
  const page = Math.max(1, opts?.page ?? 1);
  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  // Nếu có accountId, lọc transaction_id qua transaction_entries trước
  let accountTxIds: string[] | null = null;
  if (opts?.accountId) {
    const { data: entryRows, error: entryErr } = await supabase
      .from('transaction_entries')
      .select('transaction_id')
      .eq('account_id', opts.accountId);
    if (entryErr) throw entryErr;
    const rows = (entryRows ?? []) as Array<{ transaction_id: string }>;
    accountTxIds = Array.from(new Set(rows.map(r => r.transaction_id)));
    if (accountTxIds.length === 0) {
      return { items: [], totalCount: 0, page, pageSize, totalPages: 0 };
    }
  }

  let q = supabase
    .from('transactions')
    .select('*', { count: 'exact' });

  if (accountTxIds) {
    q = q.in('id', accountTxIds);
  }

  // Filter status: mặc định 'posted'
  const status = opts?.status ?? 'posted';
  if (status !== 'all') {
    q = q.eq('status', status);
  }

  // Filter type
  if (opts?.type && opts.type !== 'all') {
    q = q.eq('type', opts.type);
  }

  // Filter category (hỗ trợ cả custom và global)
  if (opts?.categoryId) {
    if (opts.categoryId.startsWith('global:')) {
      q = q.eq('global_category_id', opts.categoryId.replace('global:', ''));
    } else {
      q = q.eq('category_id', opts.categoryId);
    }
  }

  // Filter date
  if (opts?.from) q = q.gte('occurred_at', opts.from);
  if (opts?.to) q = q.lte('occurred_at', opts.to);

  // Filter amount
  if (opts?.minAmount != null) q = q.gte('amount_minor', opts.minAmount);
  if (opts?.maxAmount != null) q = q.lte('amount_minor', opts.maxAmount);

  // Search keyword trong payee hoặc note
  if (opts?.search && opts.search.trim()) {
    const term = opts.search.trim().replace(/[%,()]/g, '');
    if (term) {
      q = q.or(`payee.ilike.%${term}%,note.ilike.%${term}%`);
    }
  }

  // Order ổn định (occurred_at desc, id desc) và phân trang
  q = q
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(fromIdx, toIdx);

  const { data, count, error } = await q;
  if (error) throw error;

  const rows = (data as Transaction[]) ?? [];
  const totalCount = count ?? rows.length;
  const totalPages = Math.ceil(totalCount / pageSize);

  if (rows.length === 0) {
    return { items: [], totalCount, page, pageSize, totalPages };
  }

  // Lấy entries cho các giao dịch trong trang hiện tại để map tài khoản (bao gồm transfer 2 phía)
  const pageIds = rows.map(r => r.id);
  const { data: entriesData, error: entriesError } = await supabase
    .from('transaction_entries')
    .select('transaction_id, account_id, amount_minor')
    .in('transaction_id', pageIds);
  if (entriesError) throw entriesError;

  const entriesByTxId = new Map<string, Array<{ account_id: string; amount_minor: number }>>();
  for (const e of (entriesData ?? []) as Array<{ transaction_id: string; account_id: string; amount_minor: number }>) {
    const list = entriesByTxId.get(e.transaction_id);
    if (list) list.push(e);
    else entriesByTxId.set(e.transaction_id, [e]);
  }

  const items: Transaction[] = rows.map(r => {
    const txEntries = entriesByTxId.get(r.id) ?? [];
    let accountId: string | null = null;
    let fromAccountId: string | null = null;
    let toAccountId: string | null = null;

    if (r.type === 'transfer') {
      const fromEntry = txEntries.find(e => e.amount_minor < 0);
      const toEntry = txEntries.find(e => e.amount_minor > 0);
      fromAccountId = fromEntry?.account_id ?? null;
      toAccountId = toEntry?.account_id ?? null;
      accountId = fromAccountId ?? toAccountId;
    } else {
      accountId = txEntries[0]?.account_id ?? null;
    }

    return {
      ...r,
      account_id: accountId,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
    };
  });

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export async function listTransactions(opts?: ListTransactionsOptions): Promise<Transaction[]> {
  const res = await listTransactionsPaginated(opts);
  return res.items;
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

  // Split category_id thành {category_id, global_category_id} theo prefix 'global:'
  const catFields = pickCategoryFields(input.category_id ?? null);

  // Một nghiệp vụ chỉ có một operation key. Retry/conflict/unknown result phải
  // dùng lại đúng key để RPC trả kết quả cũ thay vì tạo giao dịch mới.
  const clientGeneratedId = input.client_generated_id ?? crypto.randomUUID();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc('create_manual_transaction', {
      p_client_generated_id: clientGeneratedId,
      p_type: input.type,
      p_account_id: input.account_id,
      p_amount_minor: input.amount_minor,
      p_currency: 'VND',
      p_occurred_at: input.occurred_at,
      p_category_id: catFields.category_id,
      p_global_category_id: catFields.global_category_id,
      p_payee: input.payee ?? null,
      p_note: finalNote,
      p_source: 'manual',
    });
    if (!error) return data as string;
    lastError = error;
    // Chỉ retry lỗi transient/conflict; validation và payload mismatch fail fast.
    const status =
      (error as { status?: number; code?: string }).status ??
      (error as { statusCode?: number }).statusCode;
    const code = (error as { code?: string }).code;
    const isRetryable =
      status === 408 || status === 409 || status === 429 || (status != null && status >= 500) || code === '23505';
    if (!isRetryable || attempt === 2) break;
    await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
  }
  // Surface error message cho UI, không ghi payload tài chính vào console.
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
    ocr_row_id?: string;
    account_id: string;
    type: 'income' | 'expense';
    amount_minor: number;
    occurred_at: string;
    category_id?: string | null;
    payee?: string | null;
    note?: string | null;
  }>,
): Promise<Array<{ ok: true; id: string } | { ok: false; error: string; row: number }>> {
  const results: Array<{ ok: true; id: string } | { ok: false; error: string; row: number }> = [];
  const indexed = rows.map((row, index) => ({ row, index }));
  const groups = new Map<string, typeof indexed>();
  for (const item of indexed) {
    const key = item.row.ocr_row_id ?? `single:${item.index}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    try {
      if (first.row.ocr_row_id) {
        const payload = group.map(({ row }) => {
          const category = pickCategoryFields(row.category_id ?? null);
          return {
            ...row,
            ocr_row_id: undefined,
            category_id: category.category_id,
            global_category_id: category.global_category_id,
            note: row.note ? `${row.note} [OCR]` : '[OCR]',
          };
        });
        const { data, error } = await supabase.rpc('create_ocr_transaction_row', {
          p_row_id: first.row.ocr_row_id,
          p_splits: payload,
        } as never);
        if (error) throw error;
        const ids = (data ?? []) as string[];
        if (ids.length !== group.length) throw new Error('OCR row không trả đủ transaction');
        group.forEach((item, index) => { results[item.index] = { ok: true, id: ids[index]! }; });
      } else {
        const id = await createManualTransaction({ ...first.row, fromOcr: true });
        results[first.index] = { ok: true, id };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      group.forEach(item => { results[item.index] = { ok: false, error: message, row: item.index }; });
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
  const catFields = wantsClear
    ? { category_id: null, global_category_id: null }
    : pickCategoryFields(patch.category_id ?? null);
  const { error } = await supabase.rpc('update_transaction', {
    p_transaction_id: id,
    p_type: patch.type ?? null,
    p_account_id: patch.account_id ?? null,
    p_amount_minor: patch.amount_minor ?? null,
    p_occurred_at: patch.occurred_at ?? null,
    p_category_id: catFields.category_id,
    p_global_category_id: catFields.global_category_id,
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
  timezone?: string;
}) {
  const catFields = pickCategoryFields(opts.category_id ?? null);
  const tz = opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  const { data, error } = await supabase.rpc('get_transactions_summary', {
    p_start_date: opts.start_date,
    p_end_date: opts.end_date,
    p_category_id: catFields.category_id,
    p_global_category_id: catFields.global_category_id,
    p_timezone: tz,
  } as never);
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

export interface CategoryExpenseItem {
  category_id: string;
  category_name: string;
  color: string;
  total_amount: number;
  transaction_count: number;
}

/**
 * Tổng hợp toàn bộ chi tiêu theo danh mục (Server-side RPC get_category_expenses_breakdown).
 * Khắc phục F06: không bị giới hạn 500 dòng, tính đủ Chưa phân loại và Khác.
 */
export async function getCategoryExpensesBreakdown(opts: {
  start_date: string;
  end_date: string;
  timezone?: string;
}): Promise<CategoryExpenseItem[]> {
  const tz = opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  try {
    const { data, error } = await supabase.rpc('get_category_expenses_breakdown', {
      p_start_date: opts.start_date,
      p_end_date: opts.end_date,
      p_timezone: tz,
    });
    if (!error && data) {
      return (data as any[]).map(r => ({
        category_id: r.category_id,
        category_name: r.category_name,
        color: r.color,
        total_amount: Number(r.total_amount),
        transaction_count: Number(r.transaction_count),
      }));
    }
  } catch {
    // Fallback sang query client-side nếu RPC chưa có
  }

  // Fallback client-side an toàn
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('*, categories(name, color), global_categories(name, color)')
    .eq('status', 'posted')
    .eq('type', 'expense')
    .gte('occurred_at', `${opts.start_date}T00:00:00`)
    .lte('occurred_at', `${opts.end_date}T23:59:59`);
  if (txErr) throw txErr;

  const totals = new Map<string, { name: string; color: string; total_amount: number; count: number }>();
  for (const t of (txs ?? [])) {
    if (t.metadata?.is_debt_principal) continue;
    let key = '__uncategorized__';
    let name = 'Chưa phân loại';
    let color = '#757575';

    if (t.category_id) {
      key = t.category_id;
      name = (t as any).categories?.name ?? 'Chưa phân loại';
      color = (t as any).categories?.color ?? '#757575';
    } else if (t.global_category_id) {
      key = `global:${t.global_category_id}`;
      name = (t as any).global_categories?.name ?? 'Chưa phân loại';
      color = (t as any).global_categories?.color ?? '#757575';
    }

    const cur = totals.get(key) ?? { name, color, total_amount: 0, count: 0 };
    cur.total_amount += Number(t.amount_minor);
    cur.count += 1;
    totals.set(key, cur);
  }

  return Array.from(totals.entries()).map(([k, v]) => ({
    category_id: k,
    category_name: v.name,
    color: v.color,
    total_amount: v.total_amount,
    transaction_count: v.count,
  })).sort((a, b) => b.total_amount - a.total_amount);
}

/**
 * Trả về income/expense cho N tháng gần nhất (1 round-trip).
 * Thay thế việc gọi getTransactionsSummary tuần tự trong for-loop.
 *
 * `timezone` là IANA tz (vd 'Asia/Ho_Chi_Minh'). RPC dùng tz để xác định
 * biên tháng theo local time của user — quan trọng cho user ở UTC+7/8
 * để giao dịch 00:00–06:59 local không bị gán về tháng trước.
 */
export async function getMonthlyHistory(
  months = 6,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc('get_monthly_history' as never, {
    p_user_id: userId,
    p_months: months,
    p_timezone: timezone,
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
  client_generated_id?: string;
}) {
  const { data, error } = await supabase.rpc('add_goal_contribution', {
    p_goal_id: input.goal_id,
    p_amount_minor: input.amount_minor,
    p_occurred_at: input.occurred_at ?? new Date().toISOString(),
    p_note: input.note ?? null,
    p_client_generated_id: input.client_generated_id ?? crypto.randomUUID(),
  });
  if (error) throw error;
  return data as string;
}

export async function listGoalContributions(goalId: string): Promise<GoalContribution[]> {
  const { data, error } = await supabase
    .from('goal_contributions')
    .select('*')
    .eq('goal_id', goalId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data as GoalContribution[]) ?? [];
}

// ============================================================
// Budgets
// ============================================================
export async function listBudgets(options?: { includeInactive?: boolean }): Promise<Budget[]> {
  let query = supabase
    .from('budgets')
    .select('*, budget_categories(category_id)')
    .order('created_at', { ascending: false });

  if (!options?.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as any[]).map(b => ({
    ...b,
    category_ids: Array.isArray(b.budget_categories)
      ? b.budget_categories.map((bc: any) => bc.category_id).filter(Boolean)
      : [],
  })) as Budget[];
}

export async function createBudget(input: {
  name: string;
  amount_minor: number;
  cadence?: Budget['cadence'];
  start_date: string;
  end_date?: string | null;
  category_ids?: string[];
}): Promise<Budget> {
  // 1. Thử gọi RPC create_budget_with_categories nguyên tử
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_budget_with_categories', {
      p_name: input.name,
      p_amount_minor: input.amount_minor,
      p_cadence: input.cadence ?? 'monthly',
      p_start_date: input.start_date,
      p_end_date: input.end_date ?? null,
      p_category_ids: input.category_ids && input.category_ids.length > 0 ? input.category_ids : null,
    });
    if (!rpcErr && rpcData) {
      return {
        ...(rpcData as Budget),
        category_ids: input.category_ids ?? [],
      };
    }
  } catch {
    // Fallback sang các bảng trực tiếp nếu RPC chưa có
  }

  // 2. Fallback trực tiếp
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

  const budget = data as Budget;
  if (input.category_ids && input.category_ids.length > 0) {
    const rows = input.category_ids.map(cid => ({
      budget_id: budget.id,
      category_id: cid,
    }));
    await supabase.from('budget_categories').insert(rows);
  }

  return {
    ...budget,
    category_ids: input.category_ids ?? [],
  };
}

export async function updateBudget(
  id: string,
  input: {
    name: string;
    amount_minor: number;
    cadence?: Budget['cadence'];
    start_date: string;
    end_date?: string | null;
    category_ids?: string[];
  },
): Promise<Budget> {
  // 1. Thử gọi RPC update_budget nguyên tử
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('update_budget', {
      p_budget_id: id,
      p_name: input.name,
      p_amount_minor: input.amount_minor,
      p_cadence: input.cadence ?? 'monthly',
      p_start_date: input.start_date,
      p_end_date: input.end_date ?? null,
      p_category_ids: input.category_ids ?? [],
    });
    if (!rpcErr && rpcData) {
      return {
        ...(rpcData as Budget),
        category_ids: input.category_ids ?? [],
      };
    }
  } catch {
    // Fallback sang các bảng trực tiếp
  }

  // 2. Fallback trực tiếp
  const { data, error } = await supabase
    .from('budgets')
    .update({
      name: input.name,
      amount_minor: input.amount_minor,
      cadence: input.cadence ?? 'monthly',
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  if (input.category_ids !== undefined) {
    await supabase.from('budget_categories').delete().eq('budget_id', id);
    if (input.category_ids.length > 0) {
      const rows = input.category_ids.map(cid => ({
        budget_id: id,
        category_id: cid,
      }));
      await supabase.from('budget_categories').insert(rows);
    }
  }

  return {
    ...(data as Budget),
    category_ids: input.category_ids ?? [],
  };
}

export async function toggleBudgetActive(id: string, is_active: boolean): Promise<Budget> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('toggle_budget_active', {
      p_budget_id: id,
      p_is_active: is_active,
    });
    if (!rpcErr && rpcData) {
      return rpcData as Budget;
    }
  } catch {
    // Fallback trực tiếp
  }

  const { data, error } = await supabase
    .from('budgets')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Budget;
}

export async function deleteBudget(id: string): Promise<boolean> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_budget', {
      p_budget_id: id,
    });
    if (!rpcErr && typeof rpcData === 'boolean') {
      return rpcData;
    }
  } catch {
    // Fallback trực tiếp
  }

  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
  return true;
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
  const catFields = pickCategoryFields(input.category_id ?? null);
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
      next_occurrence: calculateInitialNextOccurrence({
        frequency: input.frequency,
        start_date: input.start_date,
        day_of_month: input.day_of_month,
      }),
      day_of_month: input.day_of_month ?? null,
      category_id: catFields.category_id,
      global_category_id: catFields.global_category_id,
      payee: input.payee ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RecurringRule;
}

export async function updateRecurring(id: string, patch: Partial<RecurringRule>) {
  // Nếu patch có category_id, split ra 2 cột
  if ('category_id' in patch) {
    const catFields = pickCategoryFields(patch.category_id as string | null | undefined);
    patch = {
      ...patch,
      category_id: catFields.category_id,
      global_category_id: catFields.global_category_id,
    };
  }

  // Status changes use a locked RPC so resuming a paused rule skips missed
  // occurrences atomically instead of materializing a catch-up batch.
  if (Object.keys(patch).length === 1 && patch.status) {
    const { error } = await supabase.rpc('set_recurring_status', {
      p_rule_id: id,
      p_status: patch.status,
    });
    if (error) throw error;
    return;
  }

  // F15: Nếu sửa lịch hoặc resume mà chưa có next_occurrence mới -> tính lại.
  // Resume phải bỏ qua các kỳ đã lỡ trong thời gian pause, không ghi bù hàng loạt.
  if (
    ('start_date' in patch || 'frequency' in patch || 'day_of_month' in patch || patch.status === 'active') &&
    !patch.next_occurrence
  ) {
    const { data: current } = await supabase
      .from('recurring_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (current) {
      const merged = { ...current, ...patch };
      patch.next_occurrence = calculateInitialNextOccurrence({
        frequency: merged.frequency,
        start_date: merged.start_date,
        day_of_month: merged.day_of_month,
        end_date: merged.end_date,
      });
    }
  }

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

export async function listPendingRecurringTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('source', 'recurring')
    .eq('status', 'pending')
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (data as Transaction[]) ?? [];
}

export async function confirmRecurringTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_recurring_transaction', {
    p_transaction_id: transactionId,
  });
  if (error) throw error;
}

export async function skipRecurringTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase.rpc('skip_recurring_transaction', {
    p_transaction_id: transactionId,
  });
  if (error) throw error;
}

// ============================================================
// People & Debts (Quản lý công nợ)
// ============================================================
export type { Person, Debt, DebtPayment } from './domain';

export async function getPeople(): Promise<Person[]> {
  const { data, error } = await supabase.rpc('get_people');
  if (error) throw error;
  return (data as Person[]) ?? [];
}

export async function createPerson(name: string, phone?: string): Promise<Person> {
  const { data, error } = await supabase.rpc('create_person', {
    p_name: name,
    p_phone: phone ?? null,
  });
  if (error) throw error;
  return data as Person;
}

export async function updatePerson(id: string, name: string, phone?: string): Promise<void> {
  const { error } = await supabase
    .from('people')
    .update({ name, phone: phone ?? null })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Get existing person by name or create a new one.
 * Used when splitting expenses with new people.
 */
export async function getOrCreatePerson(name: string): Promise<Person> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Person name is required');

  // Get current user ID for proper scoping
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // First try to find existing person for this user
  const { data: existing, error: findError } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', user.id)
    .ilike('name', trimmed)
    .limit(1);

  if (findError) throw findError;

  if (existing && existing.length > 0) {
    return existing[0] as Person;
  }

  // Create new person
  return createPerson(trimmed);
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_person', { p_id: id });
  if (error) throw error;
}

export async function getDebts(status?: string): Promise<Debt[]> {
  const { data, error } = await supabase.rpc('get_debts', {
    p_status: status ?? null,
  });
  if (error) throw error;
  return (data as Debt[]) ?? [];
}

export async function getDebtWithPayments(id: string): Promise<{ debt: Debt; payments: DebtPayment[] }> {
  const { data: debt, error: debtError } = await supabase
    .from('debts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (debtError) throw debtError;

  const { data: payments, error: paymentsError } = await supabase
    .from('debt_payments')
    .select('*')
    .eq('debt_id', id)
    .order('payment_date', { ascending: true });
  if (paymentsError) throw paymentsError;

  return {
    debt: debt as Debt,
    payments: (payments as DebtPayment[]) ?? [],
  };
}

export async function createDebt(input: {
  person_id: string;
  type: 'lend' | 'borrow';
  original_amount: number;
  notes?: string | null;
  disburse_account_id?: string | null;
}): Promise<Debt> {
  const { data, error } = await supabase.rpc('create_debt', {
    p_person_id: input.person_id,
    p_type: input.type,
    p_original_amount: input.original_amount,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  const debt = data as Debt;

  // Nếu người dùng chọn giải ngân/nhận tiền ngay từ ví tài khoản
  if (input.disburse_account_id) {
    try {
      const isLend = input.type === 'lend';
      const txType = isLend ? 'expense' : 'income';
      const txNote = input.notes ?? (isLend ? `Cho vay: ${debt.counterparty_name}` : `Đi vay: ${debt.counterparty_name}`);
      const txId = await createManualTransaction({
        type: txType,
        account_id: input.disburse_account_id,
        amount_minor: input.original_amount,
        occurred_at: new Date().toISOString(),
        payee: debt.counterparty_name,
        note: txNote,
      });

      await supabase
        .from('transactions')
        .update({
          metadata: {
            debt_id: debt.id,
            debt_type: debt.type,
            is_debt_principal: true,
          },
        })
        .eq('id', txId);
    } catch (txErr) {
      console.error('[createDebt] Không thể tạo giao dịch giải ngân:', txErr);
    }
  }

  return debt;
}

export async function deleteDebt(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_debt', { p_id: id });
  if (error) throw error;
}

export async function addDebtPayment(input: {
  debt_id: string;
  amount: number;
  payment_date?: string;
  note?: string | null;
}): Promise<DebtPayment> {
  const { data, error } = await supabase.rpc('add_debt_payment', {
    p_debt_id: input.debt_id,
    p_amount: input.amount,
    p_payment_date: input.payment_date ?? new Date().toISOString(),
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as DebtPayment;
}

export interface SettleDebtPaymentInput {
  debt_id: string;
  account_id: string;
  amount: number; // minor
  payment_date?: string;
  note?: string | null;
  idempotency_key?: string;
}

export interface SettleDebtPaymentResult {
  success: boolean;
  payment_id: string;
  transaction_id: string;
  remaining_amount: number;
  status: 'active' | 'paid';
  idempotent?: boolean;
}

/**
 * Thanh toán nợ nguyên tử (Atomic RPC settle_debt_payment).
 * Thực hiện row lock, trừ remaining_amount, ghi payment và sinh transaction có is_debt_principal: true.
 */
export async function settleDebtPayment(
  input: SettleDebtPaymentInput,
): Promise<SettleDebtPaymentResult> {
  const cid = input.idempotency_key ?? crypto.randomUUID();

  const { data, error } = await supabase.rpc('settle_debt_payment', {
    p_debt_id: input.debt_id,
    p_account_id: input.account_id,
    p_amount_minor: input.amount,
    p_payment_date: input.payment_date ?? new Date().toISOString(),
    p_note: input.note ?? null,
    p_idempotency_key: cid,
  });
  // Thiếu atomic RPC là lỗi triển khai, không được downgrade sang nhiều request.
  if (error) {
    if ((error as { code?: string }).code === '42883') {
      throw new Error('Chưa bật nghiệp vụ thanh toán nợ nguyên tử; giao dịch chưa được ghi sổ.');
    }
    throw error;
  }

  if (!data) throw new Error('Thanh toán nợ không trả về kết quả; giao dịch chưa được xác nhận.');
  return data as SettleDebtPaymentResult;
}

export async function markDebtPaid(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_debt_paid', { p_id: id });
  if (error) throw error;
}

export interface DebtSummary {
  totalLending: number;
  totalBorrowing: number;
  activeLendCount: number;
  activeBorrowCount: number;
}

export async function getDebtSummary(): Promise<DebtSummary> {
  const { data, error } = await supabase.rpc('get_debt_summary');
  if (error) throw error;

  const rows = (data as Array<{ metric: string; amount: number; count: number }>) ?? [];
  const summary: DebtSummary = {
    totalLending: 0,
    totalBorrowing: 0,
    activeLendCount: 0,
    activeBorrowCount: 0,
  };

  for (const row of rows) {
    switch (row.metric) {
      case 'total_lending':
        summary.totalLending = row.amount;
        break;
      case 'total_borrowing':
        summary.totalBorrowing = row.amount;
        break;
      case 'active_lend_count':
        summary.activeLendCount = row.count;
        break;
      case 'active_borrow_count':
        summary.activeBorrowCount = row.count;
        break;
    }
  }

  return summary;
}

// ============================================================
// Bills (chụp bill siêu thị)
// ============================================================
export type { Bill, BillItem, BillChannel, OnlineMarketplace };

export type BillItemInput = {
  product_name: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  note?: string | null;
};

export type BillWithItems = {
  bill: Bill;
  items: BillItem[];
};

/**
 * Lấy bill + items cho 1 transaction. Trả về null nếu chưa có bill.
 */
/**
 * Lấy bill + items cho 1 transaction. Trả về null nếu chưa có bill.
 *
 * Implementation note: RPC `get_bill_with_items` return JSONB. Khi function
 * RETURN NULL (không có bill), PostgREST default sẽ trả về mảng rỗng `[]`
 * (cho scalar return). Khi có bill, trả về 1 object `{bill, items}`.
 * Để tránh ambiguity, ta dùng header Accept `application/vnd.pgrst.object+json`
 * — PostgREST trả 1 object duy nhất, hoặc 406/empty nếu null. Chuẩn hoá cả 3 case.
 */
export async function getBillWithItems(transactionId: string): Promise<BillWithItems | null> {
  const { data, error } = await supabase.rpc(
    'get_bill_with_items',
    { p_transaction_id: transactionId },
    // Cast cho phép truyền headers phụ (PostgREST object singular).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { headers: { Accept: 'application/vnd.pgrst.object+json' } } as any,
  );
  if (error) {
    // 406 với PGRST116 = không có row (bill không tồn tại) → trả null, không throw.
    const code = (error as { code?: string }).code;
    const status = (error as { status?: number }).status;
    if (code === 'PGRST116' || status === 406) {
      return null;
    }
    throw error;
  }
  if (!data) return null;
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as BillWithItems) : null;
  }
  return data as BillWithItems;
}

/**
 * Tạo bill + items. Raise exception nếu transaction đã có bill.
 * @returns bill_id
 */
export async function createBillWithItems(input: {
  transaction_id: string;
  channel_type: BillChannel;
  online_marketplace?: OnlineMarketplace | null;
  online_marketplace_other?: string | null;
  store_name?: string | null;
  declared_total_minor: number;
  items: BillItemInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_bill_with_items', {
    p_transaction_id: input.transaction_id,
    p_channel_type: input.channel_type,
    p_online_marketplace: input.online_marketplace ?? null,
    p_online_marketplace_other: input.online_marketplace_other ?? null,
    p_store_name: input.store_name ?? null,
    p_declared_total_minor: input.declared_total_minor,
    p_items: input.items,
  });
  if (error) throw error;
  // PostgREST có thể wrap scalar UUID trong mảng 1 phần tử.
  const unwrapped = Array.isArray(data) ? data[0] : data;
  return unwrapped as string;
}

/**
 * Cập nhật bill + replace items.
 */
export async function updateBillWithItems(
  billId: string,
  input: {
    channel_type: BillChannel;
    online_marketplace?: OnlineMarketplace | null;
    online_marketplace_other?: string | null;
    store_name?: string | null;
    declared_total_minor: number;
    items: BillItemInput[];
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('update_bill_with_items', {
    p_bill_id: billId,
    p_channel_type: input.channel_type,
    p_online_marketplace: input.online_marketplace ?? null,
    p_online_marketplace_other: input.online_marketplace_other ?? null,
    p_store_name: input.store_name ?? null,
    p_declared_total_minor: input.declared_total_minor,
    p_items: input.items,
  });
  if (error) throw error;
  // PostgREST có thể wrap scalar UUID trong mảng 1 phần tử.
  const unwrapped = Array.isArray(data) ? data[0] : data;
  return unwrapped as string;
}

/**
 * Xoá bill (cascade items).
 */
export async function deleteBill(billId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bill', { p_bill_id: billId });
  if (error) throw error;
}

/**
 * Bill summary tối gọn (không kèm items) — dùng để check nhanh GD nào có bill
 * và hiện nút Info trên danh sách mà không cần query đầy đủ.
 */
export type BillSummary = Pick<
  Bill,
  'id' | 'transaction_id' | 'channel_type' | 'store_name' | 'declared_total_minor' | 'item_count'
>;

/**
 * Batch lấy bill summaries theo danh sách transaction ids.
 * Trả về Map<txId, BillSummary> chỉ cho các GD có bill.
 */
export async function getBillSummariesForTransactions(
  transactionIds: string[],
): Promise<Map<string, BillSummary>> {
  const out = new Map<string, BillSummary>();
  if (transactionIds.length === 0) return out;
  const { data, error } = await supabase
    .from('bills')
    .select('id, transaction_id, channel_type, store_name, declared_total_minor, item_count')
    .in('transaction_id', transactionIds);
  if (error) throw error;
  for (const row of (data ?? []) as BillSummary[]) {
    out.set(row.transaction_id, row);
  }
  return out;
}
