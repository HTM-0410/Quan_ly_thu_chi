import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Banknote,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Filter,
  Info,
  Pencil,
  Plus,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Search,
  Tag,
  Users,
  Wallet,
  X as XIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { generateTransactionsCsv, downloadCsvFile } from '../lib/exportCsv';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryPicker } from '../components/CategoryPicker';
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
  createManualTransaction,
  createTransfer,
  getBillWithItems,
  getDebtWithPayments,
  getTransactionAccountId,
  listAccounts,
  listCategories,
  listTransactions,
  listTransactionsPaginated,
  updateTransaction,
  voidTransaction,
  getBillSummariesForTransactions,
  type BillWithItems,
  type BillSummary,
} from '../lib/api';
import { createPayingForOperation } from '../lib/financialOperations';
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

/** Tên danh mục có gắn bill — user có thể đính kèm bill (hóa đơn mua hàng). */
const BILLABLE_CATEGORY_NAMES = ['Mua sắm', 'Đi chợ/Siêu thị'];

/** True nếu category thuộc nhóm có gắn bill (case-insensitive, trim). */
function isShoppingCategory(
  cat: { name: string; parent_id?: string | null } | null | undefined,
  categoryById?: ReadonlyMap<string, { name: string }>,
): boolean {
  if (!cat) return false;
  const n = cat.name.trim().toLowerCase();
  if (BILLABLE_CATEGORY_NAMES.some(x => x.toLowerCase() === n)) return true;
  if (cat.parent_id && categoryById) {
    const parent = categoryById.get(cat.parent_id);
    if (parent) {
      const pn = parent.name.trim().toLowerCase();
      return BILLABLE_CATEGORY_NAMES.some(x => x.toLowerCase() === pn);
    }
  }
  return false;
}

const SHOPPING_CATEGORY_NAME = 'Mua sắm';

export function TransactionsPage() {
  useDocumentTitle('Giao dịch');
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'posted' | 'voided' | 'all'>('posted');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<Tab>('all');
  const [openForm, setOpenForm] = useState<FormMode | null>(() =>
    searchParams.get('action') === 'new' ? 'manual' : null,
  );

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setOpenForm('manual');
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
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
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('posted');
    setPage(1);
  }
  const columnFilterCount =
    payeeFilter.length +
    accountFilter.length +
    categoryFilter.length +
    (datePreset ? 1 : 0) +
    (amountMin != null ? 1 : 0) +
    (amountMax != null ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (statusFilter !== 'posted' ? 1 : 0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadData(targetPage = page) {
    setLoading(true);
    setErr(null);
    try {
      let fromIso: string | undefined = undefined;
      let toIso: string | undefined = undefined;
      if (datePreset) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (datePreset === 'today') {
          fromIso = startOfDay.toISOString();
        } else if (datePreset === 'this_week') {
          const startOfWeek = new Date(startOfDay);
          startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
          fromIso = startOfWeek.toISOString();
        } else if (datePreset === 'this_month') {
          fromIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else if (datePreset === 'last_7') {
          const d7 = new Date(startOfDay);
          d7.setDate(startOfDay.getDate() - 7);
          fromIso = d7.toISOString();
        } else if (datePreset === 'last_30') {
          const d30 = new Date(startOfDay);
          d30.setDate(startOfDay.getDate() - 30);
          fromIso = d30.toISOString();
        }
      }

      const effectiveSearch =
        (searchQuery.trim() || (payeeFilter.length > 0 ? payeeFilter[0] : '')) || undefined;

      const [res, accs, cats] = await Promise.all([
        listTransactionsPaginated({
          page: targetPage,
          pageSize,
          type: filter === 'all' ? undefined : filter,
          status: statusFilter,
          search: effectiveSearch,
          accountId: accountFilter.length > 0 ? accountFilter[0] : undefined,
          categoryId: categoryFilter.length > 0 ? categoryFilter[0] : undefined,
          from: fromIso,
          to: toIso,
          minAmount: amountMin != null ? amountMin : undefined,
          maxAmount: amountMax != null ? amountMax : undefined,
        }),
        accounts.length === 0 ? listAccounts() : Promise.resolve(accounts),
        categories.length === 0 ? listCategories() : Promise.resolve(categories),
      ]);

      setItems(res.items);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
      setPage(res.page);
      if (accounts.length === 0) setAccounts(accs);
      if (categories.length === 0) setCategories(cats);

      const txIds = res.items.map(t => t.id).filter(Boolean);
      try {
        const map = await getBillSummariesForTransactions(txIds);
        setBillMap(map);
      } catch {
        setBillMap(new Map());
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Load lại khi filter hoặc pageSize thay đổi
  useEffect(() => {
    loadData(1);
  }, [filter, statusFilter, searchQuery, accountFilter, categoryFilter, datePreset, amountMin, amountMax, pageSize]);

  // Load lại khi page thay đổi
  useEffect(() => {
    loadData(page);
  }, [page]);

  const datePresets = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const day7 = new Date(startOfDay);
    day7.setDate(startOfDay.getDate() - 7);
    const day30 = new Date(startOfDay);
    day30.setDate(startOfDay.getDate() - 30);
    return [
      {
        id: 'today',
        label: 'Hôm nay',
        match: (iso: string) => new Date(iso) >= startOfDay,
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

  const filtered = items;

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
      loadData(page);
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
    loadData(page);
  }

  const [exporting, setExporting] = useState(false);

  async function handleExportCsv() {
    setExporting(true);
    try {
      let fromIso: string | undefined = undefined;
      let toIso: string | undefined = undefined;
      if (datePreset) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (datePreset === 'today') {
          fromIso = startOfDay.toISOString();
        } else if (datePreset === 'this_week') {
          const startOfWeek = new Date(startOfDay);
          startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
          fromIso = startOfWeek.toISOString();
        } else if (datePreset === 'this_month') {
          fromIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else if (datePreset === 'last_7') {
          const d7 = new Date(startOfDay);
          d7.setDate(startOfDay.getDate() - 7);
          fromIso = d7.toISOString();
        } else if (datePreset === 'last_30') {
          const d30 = new Date(startOfDay);
          d30.setDate(startOfDay.getDate() - 30);
          fromIso = d30.toISOString();
        }
      }

      const effectiveSearch =
        (searchQuery.trim() || (payeeFilter.length > 0 ? payeeFilter[0] : '')) || undefined;

      const res = await listTransactionsPaginated({
        page: 1,
        pageSize: 10000,
        type: filter === 'all' ? undefined : filter,
        status: statusFilter,
        search: effectiveSearch,
        accountId: accountFilter.length > 0 ? accountFilter[0] : undefined,
        categoryId: categoryFilter.length > 0 ? categoryFilter[0] : undefined,
        from: fromIso,
        to: toIso,
        minAmount: amountMin != null ? amountMin : undefined,
        maxAmount: amountMax != null ? amountMax : undefined,
      });

      if (res.items.length === 0) {
        toast.push('error', 'Không có giao dịch nào để xuất');
        return;
      }

      const accountMap = new Map<string, string>();
      accounts.forEach(a => accountMap.set(a.id, a.name));
      const categoryMap = new Map<string, string>();
      categories.forEach(c => categoryMap.set(c.id, c.name));

      const csv = generateTransactionsCsv(res.items, { accountMap, categoryMap });
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `giao-dich-${dateStr}.csv`;
      downloadCsvFile(filename, csv);
      toast.push('success', `Đã xuất ${res.items.length} giao dịch sang ${filename}`);
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Plus }[] = [
    { id: 'all', label: 'Tất cả', icon: Receipt },
    { id: 'income', label: 'Thu nhập', icon: ArrowUpCircle },
    { id: 'expense', label: 'Chi tiêu', icon: ArrowDownCircle },
    { id: 'transfer', label: 'Chuyển khoản', icon: ArrowLeftRight },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {loading ? 'Đang tải…' : `${totalCount} giao dịch`}
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Giao dịch
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Tất cả thu chi và chuyển khoản của bạn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick utility icon buttons */}
          <div className="flex items-center gap-1.5">
            <button
              className="btn-secondary inline-flex h-9 w-9 items-center justify-center !p-0"
              onClick={() => loadData(page)}
              disabled={loading}
              aria-label="Làm mới danh sách giao dịch"
              title="Làm mới"
            >
              {loading ? <Spinner size="sm" /> : <RefreshCcw size={15} strokeWidth={1.75} />}
            </button>
            <button
              className="btn-secondary inline-flex h-9 w-9 items-center justify-center !p-0"
              onClick={handleExportCsv}
              disabled={exporting || loading}
              title="Xuất CSV"
              aria-label="Xuất CSV"
            >
              {exporting ? <Spinner size="sm" /> : <Download size={15} strokeWidth={1.75} />}
            </button>
          </div>

          {/* Primary & Quick Action buttons */}
          <button
            className="btn-secondary inline-flex items-center gap-1.5 text-xs font-medium"
            onClick={() => setOpenForm('ocr')}
            title="Import giao dịch từ ảnh bằng AI"
          >
            <Camera size={14} strokeWidth={2} /> Từ ảnh
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-1.5 text-xs font-medium"
            onClick={() => setOpenForm('transfer')}
            title="Chuyển khoản giữa các tài khoản"
          >
            <ArrowLeftRight size={14} strokeWidth={2} /> Chuyển khoản
          </button>
          <button
            className="btn-primary inline-flex items-center gap-1.5 text-xs font-medium"
            onClick={() => setOpenForm('manual')}
          >
            <Plus size={15} strokeWidth={2.25} /> Giao dịch
          </button>
        </div>
      </header>

      {/* Search Input */}
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 dark:text-inkDark-400" />
        <input
          type="text"
          className="input h-10 w-full pl-10 pr-9 text-sm rounded-xl shadow-xs"
          placeholder="Tìm kiếm theo đối tác, mô tả, ghi chú..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:text-ink-600 dark:text-inkDark-400 dark:hover:text-inkDark-200"
            title="Xóa tìm kiếm"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* Tabs & Filter Chips (Open layout without restrictive box) */}
      <div className="space-y-2">
        {/* Type Segmented Control */}
        <div className="flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Lọc giao dịch theo loại"
            className="inline-flex rounded-pill bg-surface-sunken p-1 dark:bg-surface-dark-sunken overflow-x-auto no-scrollbar max-w-full"
          >
            {tabs.map(t => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setFilter(t.id); setPage(1); }}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-medium transition whitespace-nowrap select-none',
                    active
                      ? 'bg-surface-raised text-ink-900 shadow-2xs font-semibold dark:bg-surface-dark-raised dark:text-inkDark-900'
                      : 'text-ink-600 hover:text-ink-900 dark:text-inkDark-400 dark:hover:text-inkDark-200',
                  )}
                >
                  <t.icon size={13} strokeWidth={active ? 2.25 : 1.75} className={active ? 'text-brand-600 dark:text-brand-400' : ''} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 py-0.5">
          {/* Thời gian */}
          <ColumnFilterTrigger
            variant="chip"
            label="Thời gian"
            chipLabel={
              datePreset
                ? (datePresets.find(p => p.id === datePreset)?.label ?? 'Thời gian')
                : 'Thời gian'
            }
            icon={<Calendar size={13} />}
            kind="datePresets"
            presets={datePresets}
            value={datePreset}
            onChange={setDatePreset}
            activeCount={datePreset ? 1 : 0}
            onReset={() => setDatePreset(null)}
          />

          {/* Tài khoản */}
          <ColumnFilterTrigger
            variant="chip"
            label="Tài khoản"
            chipLabel={
              accountFilter.length === 1
                ? (accounts.find(a => a.id === accountFilter[0])?.name ?? 'Tài khoản')
                : accountFilter.length > 1
                ? `Tài khoản (${accountFilter.length})`
                : 'Tài khoản'
            }
            icon={<Wallet size={13} />}
            kind="checkbox"
            options={accounts.map(a => ({
              id: a.id,
              label: a.name,
              icon: <AccountIcon name={a.icon} color={a.color} size="xs" variant="solid" />,
            }))}
            selected={accountFilter}
            onToggle={v => toggleIn(setAccountFilter, v)}
            onReset={() => setAccountFilter([])}
            activeCount={accountFilter.length}
          />

          {/* Danh mục */}
          <ColumnFilterTrigger
            variant="chip"
            label="Danh mục"
            chipLabel={
              categoryFilter.length === 1
                ? (categories.find(c => c.id === categoryFilter[0])?.name ?? 'Danh mục')
                : categoryFilter.length > 1
                ? `Danh mục (${categoryFilter.length})`
                : 'Danh mục'
            }
            icon={<Tag size={13} />}
            kind="checkbox"
            options={categories.map(c => ({
              id: c.id,
              label: c.name,
              icon: <CategoryIcon name={c.icon} color={c.color} size="xs" />,
            }))}
            selected={categoryFilter}
            onToggle={v => toggleIn(setCategoryFilter, v)}
            onReset={() => setCategoryFilter([])}
            activeCount={categoryFilter.length}
          />

          {/* Số tiền */}
          <ColumnFilterTrigger
            variant="chip"
            label="Số tiền"
            chipLabel={
              amountMin != null && amountMax != null
                ? `${formatVND(amountMin)} - ${formatVND(amountMax)}`
                : amountMin != null
                ? `≥ ${formatVND(amountMin)}`
                : amountMax != null
                ? `≤ ${formatVND(amountMax)}`
                : 'Số tiền'
            }
            icon={<Banknote size={13} />}
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

          {/* Trạng thái */}
          <ColumnFilterTrigger
            variant="chip"
            label="Trạng thái"
            chipLabel={
              statusFilter === 'voided'
                ? 'Đã hủy'
                : statusFilter === 'all'
                ? 'Tất cả trạng thái'
                : 'Trạng thái'
            }
            icon={<Filter size={13} />}
            kind="select"
            value={statusFilter}
            onChange={val => {
              setStatusFilter(val as 'posted' | 'voided' | 'all');
              setPage(1);
            }}
            options={[
              { id: 'posted', label: 'Đã ghi sổ (mặc định)' },
              { id: 'voided', label: 'Đã hủy' },
              { id: 'all', label: 'Tất cả' },
            ]}
            activeCount={statusFilter !== 'posted' ? 1 : 0}
            onReset={() => {
              setStatusFilter('posted');
              setPage(1);
            }}
          />

          {/* Đối tác (nếu có dữ liệu) */}
          {payeeOptions.length > 0 && (
            <ColumnFilterTrigger
              variant="chip"
              label="Đối tác"
              chipLabel={
                payeeFilter.length === 1
                  ? payeeFilter[0]
                  : payeeFilter.length > 1
                  ? `Đối tác (${payeeFilter.length})`
                  : 'Đối tác'
              }
              icon={<Users size={13} />}
              kind="search"
              options={payeeOptions}
              selected={payeeFilter}
              onToggle={v => toggleIn(setPayeeFilter, v)}
              onReset={() => setPayeeFilter([])}
              activeCount={payeeFilter.length}
              placeholder="Tìm đối tác..."
            />
          )}

          {/* Xóa bộ lọc */}
          {columnFilterCount > 0 && (
            <button
              type="button"
              onClick={resetAllColumnFilters}
              className="inline-flex items-center gap-1 rounded-pill border border-dashed border-err-300 bg-err-50/50 px-2.5 py-1.5 text-xs font-medium text-err-600 transition hover:bg-err-100 hover:text-err-700 dark:border-err-500/30 dark:bg-err-500/10 dark:text-err-400 dark:hover:bg-err-500/20 shrink-0 select-none"
              title="Đặt lại tất cả các bộ lọc"
            >
              <XIcon size={12} />
              <span>Xóa bộ lọc ({columnFilterCount})</span>
            </button>
          )}
        </div>

        {/* Filter summary when active */}
        {columnFilterCount > 0 && (
          <div className="flex items-center justify-between px-1 text-xs text-ink-500 dark:text-inkDark-400">
            <span>
              Đang lọc: <strong className="text-ink-800 dark:text-inkDark-200">{totalCount}</strong> giao dịch phù hợp
            </span>
            <button
              type="button"
              onClick={resetAllColumnFilters}
              className="inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              <XIcon size={11} /> Đặt lại tất cả
            </button>
          </div>
        )}
      </div>

      {err && <ErrorState message={err} onRetry={() => loadData(page)} />}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : totalCount === 0 ? (
        <EmptyState
          title={columnFilterCount > 0 ? 'Không tìm thấy giao dịch nào' : 'Chưa có giao dịch nào'}
          description={
            columnFilterCount > 0
              ? 'Thử thay đổi hoặc xóa bộ lọc để xem các giao dịch khác.'
              : 'Tạo giao dịch đầu tiên để bắt đầu theo dõi.'
          }
          icon={<Receipt size={20} strokeWidth={1.5} />}
          action={
            columnFilterCount > 0 ? (
              <button
                className="btn-secondary inline-flex items-center gap-1.5"
                onClick={resetAllColumnFilters}
              >
                <XIcon size={14} /> Xóa tất cả bộ lọc
              </button>
            ) : (
              <button
                className="btn-primary inline-flex items-center gap-1.5"
                onClick={() => setOpenForm('manual')}
              >
                <Plus size={16} strokeWidth={2.25} /> Tạo giao dịch
              </button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile: card layout */}
          <ul className="space-y-2 md:hidden">
            {filtered.map(t => {
              const acc = accountById.get(t.account_id ?? '');
              const cat = resolveCategory(categoryById, t);
              const isVoid = t.status === 'voided';
              const fromAcc = t.from_account_id ? accountById.get(t.from_account_id) : null;
              const toAcc = t.to_account_id ? accountById.get(t.to_account_id) : null;
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
                      {t.type === 'transfer' && fromAcc && toAcc ? (
                        ` · ${fromAcc.name} → ${toAcc.name}`
                      ) : acc ? (
                        ` · ${acc.name}`
                      ) : ''}
                      {cat ? ` · ${cat.name}` : ''}
                      {isVoid && (
                        <span className="ml-1 font-semibold text-err-600 dark:text-err-500">(đã hủy)</span>
                      )}
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
                          options={accounts.map(a => ({
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
                          options={categories.map(c => ({
                            id: c.id,
                            label: c.name,
                            icon: (
                              <CategoryIcon name={c.icon} color={c.color} size="xs" />
                            ),
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
                    const fromAcc = t.from_account_id ? accountById.get(t.from_account_id) : null;
                    const toAcc = t.to_account_id ? accountById.get(t.to_account_id) : null;
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
                          {t.type === 'transfer' && fromAcc && toAcc ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-ink-800 dark:text-inkDark-200">
                              <AccountIcon
                                name={fromAcc.icon}
                                color={fromAcc.color}
                                size="xs"
                                variant="solid"
                              />
                              <span className="truncate max-w-[100px]">{fromAcc.name}</span>
                              <ArrowLeftRight size={12} className="shrink-0 text-brand-500" />
                              <AccountIcon
                                name={toAcc.icon}
                                color={toAcc.color}
                                size="xs"
                                variant="solid"
                              />
                              <span className="truncate max-w-[100px]">{toAcc.name}</span>
                            </span>
                          ) : acc ? (
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
                            <span className="ml-1 font-semibold text-err-600 dark:text-err-500">(đã hủy)</span>
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

          {/* Phân trang Server-side */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-ink-600 dark:text-inkDark-400">
            <div className="flex items-center gap-2">
              <span>
                Hiển thị {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, totalCount)} trên {totalCount} giao dịch
              </span>
              <span className="text-ink-300 dark:text-ink-700">|</span>
              <label className="inline-flex items-center gap-1.5">
                <span>Mỗi trang:</span>
                <select
                  className="rounded border border-ink-200 bg-surface-raised px-2 py-1 text-xs dark:border-ink-800 dark:bg-surface-dark-raised"
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-secondary !p-1.5 disabled:opacity-30"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(1)}
                  title="Trang đầu"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  className="btn-secondary !p-1.5 disabled:opacity-30"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  title="Trang trước"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-2 font-medium text-ink-900 dark:text-inkDark-900">
                  Trang {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary !p-1.5 disabled:opacity-30"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  title="Trang sau"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn-secondary !p-1.5 disabled:opacity-30"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(totalPages)}
                  title="Trang cuối"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            )}
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
            loadData(page);
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
            loadData(page);
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
            loadData(page);
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

export function ManualTransactionModal({
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
  const [accountId, setAccountId] = useState(() => {
    if (initialAccountId) return initialAccountId;
    const lastUsed = localStorage.getItem('last_used_account_id');
    if (lastUsed && accounts.some(a => a.id === lastUsed && !a.is_archived)) {
      return lastUsed;
    }
    const firstActive = accounts.find(a => !a.is_archived);
    return firstActive ? firstActive.id : (accounts[0]?.id ?? '');
  });
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
  // One form submission is one operation. Keep this key while the modal stays
  // open so an unknown result followed by a user retry cannot create a second
  // transaction.
  const [operationId] = useState(() => crypto.randomUUID());

  // Lookup CHA từ parent_id khi check category billable (CON của Mua sắm / Đi chợ).
  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);

  // Bill state (chỉ dùng khi category = Mua sắm / Đi chợ và đang ở chế độ edit GD expense)
  const [billLoading, setBillLoading] = useState(false);

  // Load bill khi mở form edit GD expense có category = Mua sắm / Đi chợ
  useEffect(() => {
    if (!isEdit || !tx) {
      setBill(null);
      return;
    }
    const cat = categories.find(c => c.id === categoryId);
    if (!isShoppingCategory(cat, categoryById)) {
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

  // Picker cây CHA/CON: user chọn trực tiếp CHA hoặc CON trong popup cây.
  // selectedCategory vẫn giữ để các phần khác (Bill mua sắm, "Sẽ gắn nhãn") dùng.
  const selectedCategory = categories.find(c => c.id === categoryId) ?? null;

  const isDirty = useMemo(() => {
    if (isEdit) {
      if (!tx) return false;
      return (
        type !== tx.type ||
        accountId !== (initialAccountId ?? '') ||
        amount !== tx.amount_minor ||
        categoryId !== (tx.global_category_id ? `global:${tx.global_category_id}` : (tx.category_id ?? '')) ||
        payee !== (tx.payee ?? '') ||
        note !== (tx.note ?? '')
      );
    }
    return (
      amount !== null ||
      payee.trim() !== '' ||
      note.trim() !== '' ||
      categoryId !== '' ||
      isPayingFor
    );
  }, [isEdit, tx, type, accountId, initialAccountId, amount, categoryId, payee, note, isPayingFor]);

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
    if (!isEdit && isPayingFor) {
      if (!selectedDebt) {
        toast.push('error', 'Vui lòng chọn khoản cho vay để trả hộ');
        return;
      }
      if (!paymentAmount || paymentAmount <= 0) {
        toast.push('error', 'Số tiền thu lại phải lớn hơn 0');
        return;
      }
      if (paymentAmount > selectedDebt.remaining_amount) {
        toast.push('error', 'Số tiền thu lại vượt quá số nợ còn lại');
        return;
      }
      if (paymentAmount > amountMinor) {
        toast.push('error', 'Số tiền thu lại không được vượt quá số tiền chi hộ');
        return;
      }
    }
    setSubmitting(true);
    try {
      localStorage.setItem('last_used_account_id', accountId);
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
        // The paying-for path is one atomic RPC. It also marks both cash flows
        // as principal so the reimbursement cannot inflate income reports.
        if (isPayingFor && selectedDebt && paymentAmount && paymentAmount > 0) {
          const personName = (selectedDebt as Debt & { person_name?: string }).person_name ?? 'Người nợ';
          await createPayingForOperation({
            operation_id: operationId,
            account_id: accountId,
            expense_amount_minor: amountMinor,
            payment_amount_minor: paymentAmount,
            debt_id: selectedDebt.id,
            occurred_at: fromLocalDateTimeInput(occurredAt),
            category_id: categoryId || null,
            payee: payee.trim() || null,
            note: note.trim() || null,
          });
          toast.push('success', `Đã thu ${new Intl.NumberFormat('vi-VN').format(paymentAmount)}đ từ ${personName}`);
        } else {
          await createManualTransaction({
            client_generated_id: operationId,
            type,
            account_id: accountId,
            amount_minor: amountMinor,
            occurred_at: fromLocalDateTimeInput(occurredAt),
            category_id: categoryId || null,
            payee: payee.trim() || null,
            note: note.trim() || null,
          });
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
      isDirty={isDirty}
      loading={submitting}
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
            <CategoryPicker
              categories={categories}
              kind={type}
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Chọn danh mục…"
            />
          </FormField>
        </div>

        {/* Bill mua sắm — chỉ hiện khi đang sửa GD expense có category = Mua sắm / Đi chợ (CHA hoặc CON) */}
        {isEdit && isShoppingCategory(selectedCategory, categoryById) && (
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
  const [fromId, setFromId] = useState(() => {
    const lastUsed = localStorage.getItem('last_used_account_id');
    if (lastUsed && accounts.some(a => a.id === lastUsed && !a.is_archived)) {
      return lastUsed;
    }
    const firstActive = accounts.find(a => !a.is_archived);
    return firstActive ? firstActive.id : (accounts[0]?.id ?? '');
  });
  const [toId, setToId] = useState(() => {
    const remaining = accounts.filter(a => a.id !== fromId && !a.is_archived);
    return remaining[0]?.id ?? accounts[1]?.id ?? accounts[0]?.id ?? '';
  });
  const [amount, setAmount] = useState(0);
  const [fee, setFee] = useState(0);
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInput(new Date().toISOString()));
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    return amount > 0 || fee > 0 || note.trim() !== '';
  }, [amount, fee, note]);

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
      localStorage.setItem('last_used_account_id', fromId);
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
      isDirty={isDirty}
      loading={submitting}
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
