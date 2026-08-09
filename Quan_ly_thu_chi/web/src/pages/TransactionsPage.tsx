import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Camera,
  Info,
  Pencil,
  Plus,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Users,
  X as XIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { CategoryIcon } from '../components/CategoryIcon';
import { AccountIcon } from '../components/AccountIcon';
import { ColumnFilterTrigger } from '../components/ColumnFilter';
import { useToast } from '../components/Toast';
import { VNDInput } from '../components/VNDInput';
import { ReceiptImportModal } from '../components/ocr/ReceiptImportModal';
import { BillBadge } from '../components/bill/BillBadge';
import { BillOcrModal } from '../components/bill/BillOcrModal';
import { BillDetailModal } from '../components/bill/BillDetailModal';
import { useConfirm } from '../hooks/useConfirm';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  addDebtPayment,
  createManualTransaction,
  createTransfer,
  getBillWithItems,
  getDebtWithPayments,
  getTransactionAccountId,
  listAccounts,
  listCategories,
  listTransactions,
  updateTransaction,
  voidTransaction,
  getBillSummariesForTransactions,
  type BillWithItems,
  type BillSummary,
} from '../lib/api';
import {
  formatDateTime,
  formatVND,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
} from '../lib/format';
import { TRANSACTION_TYPE_LABEL } from '../lib/labels';
import { resolveCategory, categoryKey } from '../lib/categoryResolve';
import type { Category, Debt, FinancialAccount, Transaction } from '../lib/types';

type Tab = 'all' | 'income' | 'expense' | 'transfer';
type FormMode = 'manual' | 'transfer' | 'ocr';

/** Tên danh mục "Mua sắm" được seed mặc định trong seed_default_categories. */
const SHOPPING_CATEGORY_NAME = 'Mua sắm';

/** True nếu category là "Mua sắm" (case-insensitive, trim). */
function isShoppingCategory(cat: { name: string } | null | undefined): boolean {
  return !!cat && cat.name.trim().toLowerCase() === SHOPPING_CATEGORY_NAME.toLowerCase();
}

export function TransactionsPage() {
  useDocumentTitle('Giao dịch');
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [billMap, setBillMap] = useState<Map<string, BillSummary>>(new Map());
  /** Bill đang xem (read-only modal). Null = đóng. */
  const [billDetailTx, setBillDetailTx] = useState<Transaction | null>(null);
  /** Bill state dùng chung cho ManualTransactionModal + BillDetailModal.Sửa */
  const [bill, setBill] = useState<BillWithItems | null>(null);
  const [billModalOpen, setBillModalOpen] = useState(false);
  /** Refresh billMap sau khi xoá/sửa bill để ẩn/hiện nút Info. */
  const refreshBillMap = async () => {
    const txIds = items.map(t => t.id).filter(Boolean);
    try {
      const map = await getBillSummariesForTransactions(txIds);
      setBillMap(map);
    } catch {
      // ignore
    }
  };
  const [filter, setFilter] = useState<Tab>('all');
  const [openForm, setOpenForm] = useState<FormMode | null>(null);
  const [editTarget, setEditTarget] = useState<
    { tx: Transaction; accountId: string } | null
  >(null);

  // ==============================
  // Column filters (popover funnel per column)
  // ==============================
  const [payeeFilter, setPayeeFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<string | null>(null);
  const [amountMin, setAmountMin] = useState<number | null>(null);
  const [amountMax, setAmountMax] = useState<number | null>(null);

  function toggleIn(setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) {
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  }
  function resetAllColumnFilters() {
    setPayeeFilter([]);
    setAccountFilter([]);
    setCategoryFilter([]);
    setDatePreset(null);
    setAmountMin(null);
    setAmountMax(null);
  }
  const columnFilterCount =
    payeeFilter.length +
    accountFilter.length +
    categoryFilter.length +
    (datePreset ? 1 : 0) +
    (amountMin != null ? 1 : 0) +
    (amountMax != null ? 1 : 0);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [txs, accs, cats] = await Promise.all([
        listTransactions({ limit: 200 }),
        listAccounts(),
        listCategories(),
      ]);
      setItems(txs);
      setAccounts(accs);
      setCategories(cats);
      // Fetch bill summaries cho tất cả tx ids (chỉ check có bill hay không).
      const txIds = txs.map(t => t.id).filter(Boolean);
      try {
        const map = await getBillSummariesForTransactions(txIds);
        setBillMap(map);
      } catch {
        // Không block UI nếu fetch bill fail.
        setBillMap(new Map());
      }
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const datePresets = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const day7 = new Date(startOfDay);
    day7.setDate(startOfDay.getDate() - 7);
    const day30 = new Date(startOfDay);
    day30.setDate(startOfDay.getDate() - 30);
    return [
      {
        id: 'today',
        label: 'Hôm nay',
        match: (iso: string) => {
          const d = new Date(iso);
          return d >= startOfDay;
        },
      },
      {
        id: 'this_week',
        label: 'Tuần này',
        match: (iso: string) => new Date(iso) >= startOfWeek,
      },
      {
        id: 'this_month',
        label: 'Tháng này',
        match: (iso: string) => new Date(iso) >= startOfMonth,
      },
      {
        id: 'last_7',
        label: '7 ngày qua',
        match: (iso: string) => new Date(iso) >= day7,
      },
      {
        id: 'last_30',
        label: '30 ngày qua',
        match: (iso: string) => new Date(iso) >= day30,
      },
    ];
  }, []);

  const filtered = useMemo(() => {
    const dateMatch = datePreset
      ? datePresets.find(p => p.id === datePreset)?.match
      : null;
    return items.filter(t => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (payeeFilter.length > 0) {
        const payee = (t.payee ?? '').trim();
        if (!payeeFilter.includes(payee)) return false;
      }
      if (accountFilter.length > 0) {
        const accId = t.account_id ?? '';
        if (!accountFilter.includes(accId)) return false;
      }
      if (categoryFilter.length > 0) {
        // Nếu lọc theo danh mục nhưng giao dịch chuyển khoản/không có danh mục -> loại
        // categoryFilter chứa id có/không prefix 'global:'; so sánh đúng giá trị lưu trong tx
        const key = t.global_category_id
          ? `global:${t.global_category_id}`
          : t.category_id;
        if (!key || !categoryFilter.includes(key)) return false;
      }
      if (dateMatch && !dateMatch(t.occurred_at)) return false;
      const amt = Math.abs(t.amount_minor);
      if (amountMin != null && amt < amountMin) return false;
      if (amountMax != null && amt > amountMax) return false;
      return true;
    });
  }, [items, filter, payeeFilter, accountFilter, categoryFilter, datePreset, amountMin, amountMax, datePresets]);

  const accountById = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    accounts.forEach(a => map.set(a.id, a));
    return map;
  }, [accounts]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(c => map.set(c.id, c));
    return map;
  }, [categories]);

  const payeeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of items) {
      const p = (t.payee ?? '').trim();
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ id: label, label, count }));
  }, [items]);

  async function handleVoid(t: Transaction) {
    const ok = await confirm({
      title: 'Hủy giao dịch?',
      message: `Giao dịch "${t.payee ?? TRANSACTION_TYPE_LABEL[t.type]}" sẽ được đánh dấu đã hủy và không tính vào số dư. Bạn có chắc?`,
      confirmText: 'Hủy giao dịch',
      cancelText: 'Không',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await voidTransaction(t.id);
      toast.push('success', 'Đã hủy giao dịch');
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleEdit(t: Transaction) {
    // Transfer không sửa được qua flow này
    if (t.type === 'transfer') {
      toast.push('error', 'Không thể sửa giao dịch chuyển khoản');
      return;
    }
    try {
      const accountId = await getTransactionAccountId(t.id);
      if (!accountId) {
        toast.push('error', 'Không tìm thấy tài khoản của giao dịch');
        return;
      }
      setEditTarget({ tx: t, accountId });
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    }
  }

  function handleEditSaved() {
    setEditTarget(null);
    toast.push('success', 'Đã cập nhật giao dịch');
    load();
  }

  const tabs: { id: Tab; label: string; icon: typeof Plus }[] = [
    { id: 'all', label: 'Tất cả', icon: Receipt },
    { id: 'income', label: 'Thu nhập', icon: ArrowUpCircle },
    { id: 'expense', label: 'Chi tiêu', icon: ArrowDownCircle },
    { id: 'transfer', label: 'Chuyển khoản', icon: ArrowLeftRight },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {items.length} giao dịch
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Giao dịch
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Tất cả thu chi và chuyển khoản của bạn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách giao dịch"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={() => setOpenForm('manual')}
          >
            <Plus size={14} strokeWidth={2} /> Giao dịch
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={() => setOpenForm('ocr')}
            title="Import giao dịch từ ảnh bằng AI"
          >
            <Camera size={14} strokeWidth={2} /> Từ ảnh
          </button>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => setOpenForm('transfer')}
          >
            <ArrowLeftRight size={14} strokeWidth={2} /> Chuyển khoản
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="Lọc giao dịch theo loại" className="flex flex-wrap gap-1.5">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={filter === t.id}
            onClick={() => setFilter(t.id)}
            className={clsx(
              'chip border transition',
              filter === t.id
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-ink-200 bg-surface-raised text-ink-600 hover:bg-ink-50 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:bg-ink-800',
            )}
          >
            <t.icon size={13} strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      {columnFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600 dark:text-inkDark-500">
          <span className="font-medium">Đang lọc:</span>
          <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {filtered.length}/{items.length} giao dịch
          </span>
          <button
            type="button"
            onClick={resetAllColumnFilters}
            className="inline-flex items-center gap-1 text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline dark:text-inkDark-500 dark:hover:text-inkDark-100"
          >
            <XIcon size={11} /> Xóa tất cả bộ lọc
          </button>
        </div>
      )}

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Chưa có giao dịch nào"
          description="Tạo giao dịch đầu tiên để bắt đầu theo dõi."
          icon={<Receipt size={20} strokeWidth={1.5} />}
          action={
            <button
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => setOpenForm('manual')}
            >
              <Plus size={16} strokeWidth={2.25} /> Tạo giao dịch
            </button>
          }
        />
      ) : (
        <>
          {/* Mobile + tablet: bộ lọc cột (popover phễu) */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-2xs font-medium uppercase tracking-[0.12em] text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
            <span className="mr-1">Lọc theo:</span>
            <span className="inline-flex items-center gap-1">
              Mô tả
              <ColumnFilterTrigger
                label="Mô tả"
                kind="search"
                options={payeeOptions}
                selected={payeeFilter}
                onToggle={v => toggleIn(setPayeeFilter, v)}
                onReset={() => setPayeeFilter([])}
                activeCount={payeeFilter.length}
                placeholder="Tìm đối tượng..."
              />
            </span>
            <span className="inline-flex items-center gap-1">
              Tài khoản
              <ColumnFilterTrigger
                label="Tài khoản"
                kind="checkbox"
                options={accounts
                  .filter(a => items.some(t => t.account_id === a.id))
                  .map(a => ({
                    id: a.id,
                    label: a.name,
                    icon: <AccountIcon name={a.icon} color={a.color} size="xs" variant="solid" />,
                    count: items.filter(t => t.account_id === a.id).length,
                  }))}
                selected={accountFilter}
                onToggle={v => toggleIn(setAccountFilter, v)}
                onReset={() => setAccountFilter([])}
                activeCount={accountFilter.length}
              />
            </span>
            <span className="inline-flex items-center gap-1">
              Danh mục
              <ColumnFilterTrigger
                label="Danh mục"
                kind="checkbox"
                options={categories
                  .filter(c => items.some(t => categoryKey(t) === c.id))
                  .map(c => ({
                    id: c.id,
                    label: c.name,
                    icon: <CategoryIcon name={c.icon} color={c.color} size="xs" />,
                    count: items.filter(t => categoryKey(t) === c.id).length,
                  }))}
                selected={categoryFilter}
                onToggle={v => toggleIn(setCategoryFilter, v)}
                onReset={() => setCategoryFilter([])}
                activeCount={categoryFilter.length}
              />
            </span>
            <span className="inline-flex items-center gap-1">
              Ngày
              <ColumnFilterTrigger
                label="Ngày"
                kind="datePresets"
                presets={datePresets}
                value={datePreset}
                onChange={setDatePreset}
                activeCount={datePreset ? 1 : 0}
                onReset={() => setDatePreset(null)}
              />
            </span>
            <span className="inline-flex items-center gap-1">
              Số tiền
              <ColumnFilterTrigger
                label="Số tiền"
                kind="amountRange"
                min={amountMin}
                max={amountMax}
                onChange={(min, max) => {
                  setAmountMin(min);
                  setAmountMax(max);
                }}
                activeCount={(amountMin != null ? 1 : 0) + (amountMax != null ? 1 : 0)}
                onReset={() => {
                  setAmountMin(null);
                  setAmountMax(null);
                }}
              />
            </span>
          </div>

          {/* Mobile: card layout */}
          <ul className="space-y-2 md:hidden">
            {filtered.map(t => {
              const acc = accountById.get(t.account_id ?? '');
              const cat = resolveCategory(categoryById, t);
              const isVoid = t.status === 'voided';
              return (
                <li
                  key={t.id}
                  className="card flex items-start gap-3 p-3 text-sm transition hover:bg-ink-50/30 dark:hover:bg-ink-800/30"
                >
                  {cat ? (
                    <CategoryIcon name={cat.icon} color={cat.color} size="md" />
                  ) : (
                    <TransactionTypeBadge type={t.type} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className={clsx(
                        'truncate font-medium',
                        isVoid
                          ? 'line-through text-ink-400 dark:text-inkDark-400'
                          : 'text-ink-900 dark:text-inkDark-900',
                      )}
                    >
                      {t.payee ?? '—'}
                    </div>
                    <div className="text-xs text-ink-500 dark:text-inkDark-500">
                      {formatDateTime(t.occurred_at)}
                      {acc ? ` · ${acc.name}` : ''}
                      {cat ? ` · ${cat.name}` : ''}
                    </div>
                    {t.note && (
                      <div className="mt-0.5 truncate text-xs text-ink-500 dark:text-inkDark-500">
                        {t.note}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={clsx('chip', typeChipClass(t.type))}>
                      {TRANSACTION_TYPE_LABEL[t.type]}
                    </span>
                    <div
                      className={clsx(
                        'mt-1.5 font-semibold tabular-nums',
                        amountClass(t.type),
                        isVoid && 'opacity-40',
                      )}
                    >
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                      {formatVND(t.amount_minor)}
                    </div>
                    {!isVoid && t.source !== 'bank' && (
                      <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                        {(billMap.get(t.id)?.item_count ?? 0) > 0 && (
                          <button
                            className="btn-ghost !px-1.5 !py-0.5 !text-2xs text-info-600 hover:!bg-info-50 dark:text-info-400 dark:hover:!bg-info-500/15 inline-flex items-center gap-1"
                            onClick={() => setBillDetailTx(t)}
                            title="Xem bill của giao dịch"
                          >
                            <Info size={11} /> Bill
                          </button>
                        )}
                        {t.type !== 'transfer' && (
                          <button
                            className="btn-ghost !px-1.5 !py-0.5 !text-2xs text-ink-600 hover:!bg-ink-100 dark:text-inkDark-500 dark:hover:!bg-ink-700/40"
                            onClick={() => handleEdit(t)}
                          >
                            <Pencil size={11} /> Sửa
                          </button>
                        )}
                        <button
                          className="btn-ghost !px-1.5 !py-0.5 !text-2xs text-err-600 dark:text-err-500"
                          onClick={() => handleVoid(t)}
                        >
                          <XIcon size={11} /> Hủy
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-100 bg-surface-sunken text-2xs uppercase tracking-[0.14em] text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Mô tả
                        <ColumnFilterTrigger
                          label="Mô tả"
                          kind="search"
                          options={payeeOptions}
                          selected={payeeFilter}
                          onToggle={v => toggleIn(setPayeeFilter, v)}
                          onReset={() => setPayeeFilter([])}
                          activeCount={payeeFilter.length}
                          placeholder="Tìm đối tượng..."
                        />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Tài khoản
                        <ColumnFilterTrigger
                          label="Tài khoản"
                          kind="checkbox"
                          options={accounts
                            .filter(a => items.some(t => t.account_id === a.id))
                            .map(a => ({
                              id: a.id,
                              label: a.name,
                              icon: (
                                <AccountIcon
                                  name={a.icon}
                                  color={a.color}
                                  size="xs"
                                  variant="solid"
                                />
                              ),
                              count: items.filter(t => t.account_id === a.id).length,
                            }))}
                          selected={accountFilter}
                          onToggle={v => toggleIn(setAccountFilter, v)}
                          onReset={() => setAccountFilter([])}
                          activeCount={accountFilter.length}
                        />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Danh mục
                        <ColumnFilterTrigger
                          label="Danh mục"
                          kind="checkbox"
                          options={categories
                            .filter(c => items.some(t => categoryKey(t) === c.id))
                            .map(c => ({
                              id: c.id,
                              label: c.name,
                              icon: (
                                <CategoryIcon name={c.icon} color={c.color} size="xs" />
                              ),
                              count: items.filter(t => categoryKey(t) === c.id).length,
                            }))}
                          selected={categoryFilter}
                          onToggle={v => toggleIn(setCategoryFilter, v)}
                          onReset={() => setCategoryFilter([])}
                          activeCount={categoryFilter.length}
                        />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Ngày
                        <ColumnFilterTrigger
                          label="Ngày"
                          kind="datePresets"
                          presets={datePresets}
                          value={datePreset}
                          onChange={setDatePreset}
                          activeCount={datePreset ? 1 : 0}
                          onReset={() => setDatePreset(null)}
                        />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Số tiền
                        <ColumnFilterTrigger
                          label="Số tiền"
                          kind="amountRange"
                          min={amountMin}
                          max={amountMax}
                          onChange={(min, max) => {
                            setAmountMin(min);
                            setAmountMax(max);
                          }}
                          activeCount={(amountMin != null ? 1 : 0) + (amountMax != null ? 1 : 0)}
                          onReset={() => {
                            setAmountMin(null);
                            setAmountMax(null);
                          }}
                        />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const acc = accountById.get(t.account_id ?? '');
                    const cat = resolveCategory(categoryById, t);
                    const isVoid = t.status === 'voided';
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-ink-100 transition last:border-0 hover:bg-ink-50/50 dark:border-ink-800 dark:hover:bg-ink-800/40"
                      >
                        <td className="px-4 py-3">
                          <div
                            className={clsx(
                              'truncate font-medium',
                              isVoid
                                ? 'line-through text-ink-400 dark:text-inkDark-400'
                                : 'text-ink-900 dark:text-inkDark-900',
                            )}
                          >
                            {t.payee ?? '—'}
                          </div>
                          {t.note && (
                            <div className="truncate text-xs text-ink-500 dark:text-inkDark-500">
                              {t.note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-600 dark:text-inkDark-500">
                          {acc ? (
                            <span className="inline-flex items-center gap-2">
                              <AccountIcon name={acc.icon} color={acc.color} size="xs" variant="solid" />
                              <span className="truncate">{acc.name}</span>
                            </span>
                          ) : (
                            <span className="text-ink-400 dark:text-inkDark-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-600 dark:text-inkDark-500">
                          {cat ? (
                            <span className="inline-flex items-center gap-2">
                              <CategoryIcon name={cat.icon} color={cat.color} size="xs" />
                              <span className="truncate">{cat.name}</span>
                            </span>
                          ) : (
                            <span className="text-ink-400 dark:text-inkDark-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-inkDark-500">
                          {formatDateTime(t.occurred_at)}
                          {t.status === 'voided' && (
                            <span className="ml-1 text-err-600 dark:text-err-500">(đã hủy)</span>
                          )}
                        </td>
                        <td
                          className={clsx(
                            'px-4 py-3 text-right font-semibold tabular-nums',
                            amountClass(t.type),
                            isVoid && 'opacity-40',
                          )}
                        >
                          {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                          {formatVND(t.amount_minor)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isVoid && t.source !== 'bank' && (
                            <div className="inline-flex items-center gap-1.5">
                              {(billMap.get(t.id)?.item_count ?? 0) > 0 && (
                                <button
                                  className="btn-ghost inline-flex items-center gap-1 !px-2 !py-1 !text-2xs text-info-600 hover:!bg-info-50 dark:text-info-400 dark:hover:!bg-info-500/15"
                                  onClick={() => setBillDetailTx(t)}
                                  title="Xem bill của giao dịch"
                                >
                                  <Info size={11} /> Bill
                                </button>
                              )}
                              {t.type !== 'transfer' && (
                                <button
                                  className="btn-ghost inline-flex items-center gap-1 !px-2 !py-1 !text-2xs text-ink-600 hover:!bg-ink-100 dark:text-inkDark-500 dark:hover:!bg-ink-700/40"
                                  onClick={() => handleEdit(t)}
                                >
                                  <Pencil size={11} /> Sửa
                                </button>
                              )}
                              <button
                                className="btn-ghost inline-flex items-center gap-1 !px-2 !py-1 !text-2xs text-err-600 hover:!bg-err-50 dark:text-err-500 dark:hover:!bg-err-700/15"
                                onClick={() => handleVoid(t)}
                              >
                                <XIcon size={11} /> Hủy
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {openForm === 'manual' && (
        <ManualTransactionModal
          accounts={accounts}
          categories={categories}
          onClose={() => setOpenForm(null)}
          onSaved={() => {
            setOpenForm(null);
            toast.push('success', 'Đã tạo giao dịch');
            load();
          }}
          bill={bill}
          setBill={setBill}
          billModalOpen={billModalOpen}
          setBillModalOpen={setBillModalOpen}
        />
      )}
      {editTarget && (
        <ManualTransactionModal
          mode="edit"
          accounts={accounts}
          categories={categories}
          initialValues={editTarget.tx}
          initialAccountId={editTarget.accountId}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
          bill={bill}
          setBill={setBill}
          billModalOpen={billModalOpen}
          setBillModalOpen={setBillModalOpen}
        />
      )}
      {openForm === 'transfer' && (
        <TransferModal
          accounts={accounts}
          onClose={() => setOpenForm(null)}
          onSaved={() => {
            setOpenForm(null);
            load();
          }}
        />
      )}
      {openForm === 'ocr' && (
        <ReceiptImportModal
          open
          accounts={accounts}
          categories={categories}
          onClose={() => setOpenForm(null)}
          onSaved={() => {
            // Load được trigger sau khi modal close (xem bên trong modal).
            load();
          }}
        />
      )}

      {/* Modal Bill read-only — mở nhanh từ nút Info ở danh sách GD */}
      {billDetailTx && (
        <BillDetailModal
          open={!!billDetailTx}
          transactionId={billDetailTx.id}
          transactionAmountMinor={billDetailTx.amount_minor}
          onClose={() => setBillDetailTx(null)}
          onEdit={existingBill => {
            // Mở ManualTransactionModal edit + BillOcrModal update.
            setBillDetailTx(null);
            const tx = items.find(t => t.id === existingBill.bill.transaction_id);
            if (!tx) {
              toast.push('error', 'Không tìm thấy giao dịch để sửa bill');
              return;
            }
            getTransactionAccountId(tx.id).then(accountId => {
              if (!accountId) {
                toast.push('error', 'Không tìm thấy tài khoản của giao dịch');
                return;
              }
              setEditTarget({ tx, accountId });
              setBill(existingBill);
              setBillModalOpen(true);
            });
          }}
          onDeleted={async () => {
            await refreshBillMap();
          }}
        />
      )}

      {/* Modal Bill OCR — mở từ ManualTransactionModal hoặc BillDetailModal.Sửa */}
      {billModalOpen && editTarget && (
        <BillOcrModal
          open={billModalOpen}
          transactionId={editTarget.tx.id}
          transactionAmountMinor={editTarget.tx.amount_minor}
          existingBill={bill}
          onClose={() => {
            setBillModalOpen(false);
            setBill(null);
          }}
          onSaved={saved => {
            setBill(saved);
            setBillModalOpen(false);
          }}
          onDeleted={() => {
            setBill(null);
            setBillModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ==============================
// Helpers
// ==============================

/**
 * Trích message có nghĩa từ mọi loại error Supabase/JS.
 * Trước đây `String(e)` với PostgrestError cho ra `[object Object]` vì object
 * không có custom toString — UI hiển thị vô nghĩa. Helper này ưu tiên `message`,
 * fallback `details` + `hint`, cuối cùng `String(e)`.
 */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const obj = e as { message?: unknown; details?: unknown; hint?: unknown };
    const parts: string[] = [];
    if (typeof obj.message === 'string' && obj.message) parts.push(obj.message);
    if (typeof obj.details === 'string' && obj.details) parts.push(obj.details);
    if (typeof obj.hint === 'string' && obj.hint) parts.push(obj.hint);
    if (parts.length > 0) return parts.join(' — ');
  }
  return String(e);
}

function typeChipClass(t: Transaction['type']) {
  switch (t) {
    case 'income':
      return 'bg-ok-50 text-ok-700 dark:bg-ok-700/15 dark:text-ok-500';
    case 'expense':
      return 'bg-err-50 text-err-700 dark:bg-err-700/15 dark:text-err-500';
    case 'transfer':
      return 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300';
    default:
      return 'bg-ink-50 text-ink-600 dark:bg-ink-800 dark:text-inkDark-500';
  }
}

function amountClass(t: Transaction['type']) {
  switch (t) {
    case 'income':
      return 'text-ok-600 dark:text-ok-500';
    case 'expense':
      return 'text-err-600 dark:text-err-500';
    default:
      return 'text-ink-900 dark:text-inkDark-900';
  }
}

function TransactionTypeBadge({ type }: { type: Transaction['type'] }) {
  const IconCmp =
    type === 'income'
      ? ArrowUpCircle
      : type === 'expense'
        ? ArrowDownCircle
        : type === 'transfer'
          ? ArrowLeftRight
          : RotateCcw;
  const tint =
    type === 'income'
      ? 'text-ok-600 bg-ok-50 dark:bg-ok-700/15 dark:text-ok-500'
      : type === 'expense'
        ? 'text-err-600 bg-err-50 dark:bg-err-700/15 dark:text-err-500'
        : 'text-brand-600 bg-brand-50 dark:bg-brand-500/15 dark:text-brand-400';
  return (
    <div className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-card', tint)}>
      <IconCmp size={20} strokeWidth={1.75} />
    </div>
  );
}

// ==============================
// Manual transaction modal
// ==============================
interface ManualProps {
  accounts: FinancialAccount[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  /** Khi có -> chế độ sửa; khi undefined -> tạo mới */
  initialValues?: Transaction;
  /** accountId lấy từ transaction_entries (transactions không có) */
  initialAccountId?: string;
  mode?: 'create' | 'edit';
  /** Bill state lifted to parent (TransactionsPage) để BillDetailModal.Sửa có thể set */
  bill: BillWithItems | null;
  setBill: (b: BillWithItems | null) => void;
  billModalOpen: boolean;
  setBillModalOpen: (open: boolean) => void;
}

function ManualTransactionModal({
  accounts,
  categories,
  onClose,
  onSaved,
  initialValues,
  initialAccountId,
  mode = 'create',
  bill,
  setBill,
  billModalOpen,
  setBillModalOpen,
}: ManualProps) {
  const tx = initialValues ?? null;
  const isEdit = mode === 'edit' && !!tx;
  const toast = useToast();
  const [type, setType] = useState<'income' | 'expense'>(
    tx?.type === 'income' ? 'income' : 'expense',
  );
  const [accountId, setAccountId] = useState(
    initialAccountId ?? accounts[0]?.id ?? '',
  );
  // null = rỗng (placeholder hiện); create dùng null, edit dùng amount_minor
  const [amount, setAmount] = useState<number | null>(tx?.amount_minor ?? null);
  const [categoryId, setCategoryId] = useState<string>(
    tx?.global_category_id ? `global:${tx.global_category_id}` : (tx?.category_id ?? ''),
  );
  const [payee, setPayee] = useState(tx?.payee ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [occurredAt, setOccurredAt] = useState(
    tx
      ? toLocalDateTimeInput(tx.occurred_at)
      : toLocalDateTimeInput(new Date().toISOString()),
  );
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  // Bill state (chỉ dùng khi category = Mua sắm và đang ở chế độ edit GD expense)
  const [billLoading, setBillLoading] = useState(false);

  // Load bill khi mở form edit GD expense có category = Mua sắm
  useEffect(() => {
    if (!isEdit || !tx) {
      setBill(null);
      return;
    }
    const cat = categories.find(c => c.id === categoryId);
    if (!isShoppingCategory(cat)) {
      setBill(null);
      return;
    }
    setBillLoading(true);
    getBillWithItems(tx.id)
      .then(b => setBill(b))
      .catch(() => setBill(null))
      .finally(() => setBillLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, tx?.id, categoryId]);

  // Trả hộ state
  const [isPayingFor, setIsPayingFor] = useState(false);
  const [activeDebts, setActiveDebts] = useState<Debt[]>([]);
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);

  // Load active lend debts when toggling
  useEffect(() => {
    if (isPayingFor && !isEdit) {
      import('../lib/api').then(async ({ getDebts, getPeople }) => {
        try {
          const debts = await getDebts();
          const people = await getPeople();
          const peopleMap = new Map(people.map(p => [p.id, p.name]));

          // Filter only active lend debts (someone owes money to user)
          const lendDebts = debts.filter(d => d.type === 'lend' && d.status === 'active');
          setActiveDebts(lendDebts);

          // Enrich with person names
          const enriched = lendDebts.map(d => ({
            ...d,
            person_name: peopleMap.get(d.person_id ?? '') ?? 'Người không xác định',
          }));
          setActiveDebts(enriched as Debt[]);

          if (enriched.length > 0) {
            setSelectedDebtId(enriched[0].id);
            setPaymentAmount(enriched[0].remaining_amount);
          }
        } catch (e) {
          console.error('Failed to load debts:', e);
        }
      });
    }
  }, [isPayingFor, isEdit]);

  const selectedDebt = activeDebts.find(d => d.id === selectedDebtId);

  const filteredCats = useMemo(
    () => categories.filter(c => c.kind === type || c.kind === 'both'),
    [categories, type],
  );
  const selectedCategory = categories.find(c => c.id === categoryId) ?? null;

  async function submit() {
    if (!accountId) {
      toast.push('error', 'Vui lòng chọn tài khoản');
      return;
    }
    const amountMinor = amount ?? 0;
    if (amountMinor <= 0) {
      setAmountError('Số tiền phải lớn hơn 0');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && tx) {
        await updateTransaction(tx.id, {
          type,
          account_id: accountId,
          amount_minor: amountMinor,
          occurred_at: fromLocalDateTimeInput(occurredAt),
          category_id: categoryId || null,
          payee: payee.trim() || null,
          note: note.trim() || null,
        });
      } else {
        await createManualTransaction({
          type,
          account_id: accountId,
          amount_minor: amountMinor,
          occurred_at: fromLocalDateTimeInput(occurredAt),
          category_id: categoryId || null,
          payee: payee.trim() || null,
          note: note.trim() || null,
        });

        // Nếu đang ghi nhận trả hộ: tạo transaction thu + payment
        if (isPayingFor && selectedDebt && paymentAmount && paymentAmount > 0) {
          // Tạo transaction thu tiền từ người nợ
          const personName = (selectedDebt as Debt & { person_name?: string }).person_name ?? 'Người nợ';
          await createManualTransaction({
            type: 'income',
            account_id: accountId,
            amount_minor: paymentAmount,
            occurred_at: fromLocalDateTimeInput(occurredAt),
            category_id: categoryId || null,
            payee: personName,
            note: `Thu hộ: ${note || 'Trả hộ'}`,
          });

          // Ghi nhận payment cho khoản nợ
          await addDebtPayment({
            debt_id: selectedDebt.id,
            amount: paymentAmount,
            payment_date: fromLocalDateTimeInput(occurredAt),
            note: note.trim() || null,
          });

          toast.push('success', `Đã thu ${new Intl.NumberFormat('vi-VN').format(paymentAmount)}đ từ ${personName}`);
        }
      }
      onSaved();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (submitting ? null : onClose())}
      title={isEdit ? 'Sửa giao dịch' : 'Giao dịch mới'}
      description={
        isEdit
          ? 'Cập nhật thông tin giao dịch. Số dư tài khoản sẽ được tính lại.'
          : 'Ghi lại một khoản thu hoặc chi.'
      }
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Hủy
          </button>
          <button
            className="btn-primary inline-flex items-center gap-2"
            onClick={submit}
            disabled={submitting}
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? 'Đang lưu…' : isEdit ? 'Cập nhật' : 'Lưu'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="tablist" aria-label="Loại giao dịch" className="grid grid-cols-2 gap-2">
          {(['expense', 'income'] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              className={clsx(
                'flex items-center justify-center gap-2 rounded-card border px-3 py-2.5 text-sm font-medium transition',
                type === t
                  ? t === 'income'
                    ? 'border-ok-500 bg-ok-50 text-ok-700 dark:bg-ok-700/15 dark:text-ok-500'
                    : 'border-err-500 bg-err-50 text-err-700 dark:bg-err-700/15 dark:text-err-500'
                  : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700',
              )}
              onClick={() => {
                setType(t);
                setCategoryId('');
              }}
            >
              {t === 'income' ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
              {TRANSACTION_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <FormField label="Số tiền (VND)" required error={amountError}>
          <VNDInput
            value={amount}
            onChange={n => {
              setAmount(n);
              if (amountError) setAmountError(null);
            }}
            placeholder={isEdit ? undefined : 'Nhập số tiền'}
            autoFocus
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Tài khoản" required>
            <select
              className="input"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Danh mục">
            <select
              className="input"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">-- Chọn danh mục --</option>
              {filteredCats.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Bill mua sắm — chỉ hiện khi đang sửa GD expense có category = Mua sắm */}
        {isEdit && isShoppingCategory(selectedCategory) && (
          <div className="rounded-card border border-brand-200 bg-brand-50/30 p-3 dark:border-brand-800 dark:bg-brand-500/5">
            <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              <Receipt size={12} strokeWidth={1.75} />
              Bill mua sắm
            </div>
            {billLoading ? (
              <div className="flex items-center gap-2 text-xs text-ink-500 dark:text-inkDark-500">
                <Spinner size="sm" /> Đang tải bill…
              </div>
            ) : (
              <BillBadge
                bill={bill}
                onCreate={() => setBillModalOpen(true)}
                onEdit={() => setBillModalOpen(true)}
                onDelete={async () => {
                  if (!bill) return;
                  if (!window.confirm('Xoá bill này? Giao dịch gốc vẫn được giữ nguyên.')) return;
                  try {
                    const { deleteBill } = await import('../lib/api');
                    await deleteBill(bill.bill.id);
                    setBill(null);
                    toast.push('success', 'Đã xoá bill');
                  } catch (e) {
                    toast.push('error', e instanceof Error ? e.message : String(e));
                  }
                }}
              />
            )}
            <div className="mt-2 text-2xs text-ink-500 dark:text-inkDark-500">
              Bill lưu danh sách sản phẩm + kênh mua (online/offline). Số dư tài khoản vẫn tính theo số tiền giao dịch gốc.
            </div>
          </div>
        )}

        {selectedCategory && (
          <div className="flex items-center gap-2 rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-xs text-ink-600 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
            <CategoryIcon name={selectedCategory.icon} color={selectedCategory.color} size="xs" />
            <span>Sẽ gắn nhãn <strong className="text-ink-900 dark:text-inkDark-900">{selectedCategory.name}</strong></span>
          </div>
        )}

        <FormField label="Đối tượng">
          <input
            className="input"
            value={payee}
            onChange={e => setPayee(e.target.value)}
            placeholder="VD: Highlands Coffee"
          />
        </FormField>

        <FormField label="Thời gian">
          <input
            className="input"
            type="datetime-local"
            value={occurredAt}
            onChange={e => setOccurredAt(e.target.value)}
          />
        </FormField>

        <FormField label="Ghi chú">
          <input
            className="input"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="..."
          />
        </FormField>

        {/* Trả hộ toggle - chỉ hiện khi tạo mới giao dịch chi */}
        {!isEdit && type === 'expense' && (
          <div className="rounded-card border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-500/10">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={isPayingFor}
                onChange={e => setIsPayingFor(e.target.checked)}
                className="h-5 w-5 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
              />
              <div className="flex items-center gap-2 text-brand-700 dark:text-brand-400">
                <Users size={18} />
                <span className="font-medium">Trả hộ ai đó</span>
              </div>
            </label>

            {isPayingFor && (
              <div className="mt-3 space-y-3">
                <FormField label="Khoản cho vay">
                  <select
                    className="input w-full"
                    value={selectedDebtId}
                    onChange={e => {
                      setSelectedDebtId(e.target.value);
                      const debt = activeDebts.find(d => d.id === e.target.value);
                      if (debt) {
                        setPaymentAmount(debt.remaining_amount);
                      }
                    }}
                  >
                    {activeDebts.length === 0 ? (
                      <option value="">Không có khoản cho vay nào</option>
                    ) : (
                      activeDebts.map(d => {
                        const personName = (d as Debt & { person_name?: string }).person_name ?? 'Người không xác định';
                        return (
                          <option key={d.id} value={d.id}>
                            {personName} - Còn nợ: {new Intl.NumberFormat('vi-VN').format(d.remaining_amount)}đ
                          </option>
                        );
                      })
                    )}
                  </select>
                </FormField>

                {selectedDebt && (
                  <div className="rounded-card border border-ink-200 bg-surface p-3 dark:border-ink-700 dark:bg-surface-dark">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-600 dark:text-inkDark-400">Số tiền thu lại:</span>
                      <VNDInput
                        value={paymentAmount}
                        onChange={v => setPaymentAmount(v)}
                        className="input w-40"
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedDebt && setPaymentAmount(selectedDebt.remaining_amount)}
                      className="mt-2 text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Thu đủ ({new Intl.NumberFormat('vi-VN').format(selectedDebt.remaining_amount)}đ)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ==============================
// Transfer modal
// ==============================
interface TransferProps {
  accounts: FinancialAccount[];
  onClose: () => void;
  onSaved: () => void;
}

function TransferModal({ accounts, onClose, onSaved }: TransferProps) {
  const toast = useToast();
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState(0);
  const [fee, setFee] = useState(0);
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInput(new Date().toISOString()));
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  async function submit() {
    if (!fromId || !toId) {
      toast.push('error', 'Chọn tài khoản nguồn và đích');
      return;
    }
    if (fromId === toId) {
      toast.push('error', 'Không thể chuyển cùng một tài khoản');
      return;
    }
    if (amount <= 0) {
      setAmountError('Số tiền phải lớn hơn 0');
      return;
    }
    setSubmitting(true);
    try {
      await createTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        amount_minor: amount,
        fee_minor: fee,
        occurred_at: fromLocalDateTimeInput(occurredAt),
        note: note.trim() || null,
      });
      toast.push('success', 'Đã chuyển khoản');
      onSaved();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (submitting ? null : onClose())}
      title="Chuyển khoản nội bộ"
      description="Di chuyển tiền giữa hai tài khoản của bạn."
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Hủy
          </button>
          <button
            className="btn-primary inline-flex items-center gap-2"
            onClick={submit}
            disabled={submitting}
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? 'Đang chuyển…' : 'Chuyển'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Từ tài khoản" required>
            <select className="input" value={fromId} onChange={e => setFromId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Đến tài khoản" required>
            <select className="input" value={toId} onChange={e => setToId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Số tiền (VND)" required error={amountError}>
            <VNDInput
              value={amount}
              onChange={n => {
                setAmount(n);
                if (amountError) setAmountError(null);
              }}
            />
          </FormField>
          <FormField label="Phí (VND)">
            <VNDInput value={fee} onChange={setFee} placeholder="0" />
          </FormField>
        </div>
        <FormField label="Thời gian">
          <input
            className="input"
            type="datetime-local"
            value={occurredAt}
            onChange={e => setOccurredAt(e.target.value)}
          />
        </FormField>
        <FormField label="Ghi chú">
          <input className="input" value={note} onChange={e => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
