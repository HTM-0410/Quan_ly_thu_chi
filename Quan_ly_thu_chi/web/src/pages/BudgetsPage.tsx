import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Edit2,
  Layers,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Target as TargetIcon,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { VNDInput } from '../components/VNDInput';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  createBudget,
  deleteBudget,
  getBudgetProgress,
  listBudgets,
  listCategories,
  toggleBudgetActive,
  updateBudget,
} from '../lib/api';
import { formatDate, formatVND } from '../lib/format';
import { BUDGET_CADENCE_LABEL } from '../lib/labels';
import clsx from 'clsx';
import type { Budget, Category } from '../lib/types';

interface Progress {
  budget_id: string;
  period_start: string;
  period_end: string;
  spent_minor: number;
  transaction_count: number;
  percent: number;
}

function periodStart(b: Budget): Date {
  const today = new Date();
  if (b.cadence === 'weekly') {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (b.cadence === 'monthly') {
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }
  return new Date(b.start_date);
}

function periodEnd(b: Budget): Date {
  const start = periodStart(b);
  if (b.cadence === 'weekly') {
    const d = new Date(start);
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (b.cadence === 'monthly') {
    const d = new Date(start);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (b.end_date) return new Date(b.end_date);
  const d = new Date(start);
  d.setMonth(d.getMonth() + 1);
  return d;
}

interface Form {
  id?: string;
  name: string;
  amount_minor: number;
  cadence: Budget['cadence'];
  start_date: string;
  end_date: string;
  scope: 'all' | 'specific';
  category_ids: string[];
}

const EMPTY: Form = {
  name: '',
  amount_minor: 0,
  cadence: 'monthly',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  scope: 'all',
  category_ids: [],
};

type TabFilter = 'active' | 'paused' | 'all';

export function BudgetsPage() {
  useDocumentTitle('Ngân sách');
  const toast = useToast();
  const [items, setItems] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress | undefined>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tabFilter, setTabFilter] = useState<TabFilter>('active');
  const [formErrors, setFormErrors] = useState<{ name?: string; amount?: string; date?: string; categories?: string }>({});
  const [form, setForm] = useState<Form>(EMPTY);

  // Chỉ lấy danh mục chi tiêu (expense)
  const expenseCategories = useMemo(
    () => categories.filter(c => c.kind === 'expense'),
    [categories],
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(c => map.set(c.id, c));
    return map;
  }, [categories]);

  // Nhóm danh mục cha và danh mục con
  const parentCategories = useMemo(
    () => expenseCategories.filter(c => !c.parent_id),
    [expenseCategories],
  );

  const getChildCategories = (parentId: string) =>
    expenseCategories.filter(c => c.parent_id === parentId);

  async function loadProgressForBudget(b: Budget) {
    const start = periodStart(b).toISOString();
    const end = periodEnd(b).toISOString();
    try {
      const p = await getBudgetProgress(b.id, start, end);
      setProgress(prev => ({ ...prev, [b.id]: p }));
      setCardErrors(prev => ({ ...prev, [b.id]: undefined }));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setCardErrors(prev => ({ ...prev, [b.id]: errMsg }));
      setProgress(prev => ({ ...prev, [b.id]: undefined }));
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [budgets, cats] = await Promise.all([
        listBudgets({ includeInactive: true }),
        listCategories(),
      ]);
      setItems(budgets);
      setCategories(cats);

      // Tải tiến độ cho từng ngân sách song song
      await Promise.all(budgets.map(b => loadProgressForBudget(b)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleOpenCreate() {
    setForm(EMPTY);
    setFormErrors({});
    setOpenForm(true);
  }

  function handleOpenEdit(b: Budget) {
    const hasSpecificCategories = Array.isArray(b.category_ids) && b.category_ids.length > 0;
    setForm({
      id: b.id,
      name: b.name,
      amount_minor: b.amount_minor,
      cadence: b.cadence,
      start_date: b.start_date,
      end_date: b.end_date ?? '',
      scope: hasSpecificCategories ? 'specific' : 'all',
      category_ids: hasSpecificCategories ? [...b.category_ids!] : [],
    });
    setFormErrors({});
    setOpenForm(true);
  }

  async function handleTogglePause(b: Budget) {
    try {
      const nextActive = !b.is_active;
      await toggleBudgetActive(b.id, nextActive);
      toast.push('success', nextActive ? 'Đã kích hoạt lại ngân sách' : 'Đã tạm dừng ngân sách');
      setItems(prev => prev.map(item => item.id === b.id ? { ...item, is_active: nextActive } : item));
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingBudget) return;
    setDeleting(true);
    try {
      await deleteBudget(deletingBudget.id);
      toast.push('success', 'Đã xóa ngân sách');
      setItems(prev => prev.filter(item => item.id !== deletingBudget.id));
      setDeletingBudget(null);
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function validate(): boolean {
    const errors: typeof formErrors = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập tên ngân sách.';
    if (form.amount_minor <= 0) errors.amount = 'Số tiền phải lớn hơn 0.';
    if (form.end_date && form.end_date < form.start_date) {
      errors.date = 'Ngày kết thúc phải sau ngày bắt đầu.';
    }
    if (form.scope === 'specific' && form.category_ids.length === 0) {
      errors.categories = 'Vui lòng chọn ít nhất một danh mục áp dụng.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const categoryIdsToSave = form.scope === 'all' ? [] : form.category_ids;
      if (form.id) {
        // Cập nhật ngân sách hiện có
        await updateBudget(form.id, {
          name: form.name.trim(),
          amount_minor: form.amount_minor,
          cadence: form.cadence,
          start_date: form.start_date,
          end_date: form.end_date || null,
          category_ids: categoryIdsToSave,
        });
        toast.push('success', 'Đã cập nhật ngân sách');
      } else {
        // Tạo ngân sách mới
        await createBudget({
          name: form.name.trim(),
          amount_minor: form.amount_minor,
          cadence: form.cadence,
          start_date: form.start_date,
          end_date: form.end_date || null,
          category_ids: categoryIdsToSave,
        });
        toast.push('success', 'Đã tạo ngân sách');
      }
      setOpenForm(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Danh sách ngân sách theo tab lọc
  const filteredItems = useMemo(() => {
    if (tabFilter === 'active') return items.filter(b => b.is_active);
    if (tabFilter === 'paused') return items.filter(b => !b.is_active);
    return items;
  }, [items, tabFilter]);

  const activeCount = useMemo(() => items.filter(b => b.is_active).length, [items]);
  const pausedCount = useMemo(() => items.filter(b => !b.is_active).length, [items]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {activeCount} ngân sách đang chạy {pausedCount > 0 && `· ${pausedCount} tạm dừng`}
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Ngân sách
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Đặt giới hạn chi tiêu theo danh mục hoặc toàn bộ chi tiêu và theo dõi tiến độ theo chu kỳ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách ngân sách"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={handleOpenCreate}>
            <Plus size={16} strokeWidth={2.25} /> Thêm ngân sách
          </button>
        </div>
      </header>

      {/* Tabs lọc trạng thái */}
      <div className="flex border-b border-ink-100 dark:border-ink-800">
        <button
          type="button"
          onClick={() => setTabFilter('active')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition -mb-px flex items-center gap-2',
            tabFilter === 'active'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-inkDark-500 dark:hover:text-inkDark-300',
          )}
        >
          <span>Đang chạy</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
            {activeCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTabFilter('paused')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition -mb-px flex items-center gap-2',
            tabFilter === 'paused'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-inkDark-500 dark:hover:text-inkDark-300',
          )}
        >
          <span>Đã tạm dừng</span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-ink-800 dark:text-inkDark-400">
            {pausedCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTabFilter('all')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition -mb-px flex items-center gap-2',
            tabFilter === 'all'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-inkDark-500 dark:hover:text-inkDark-300',
          )}
        >
          <span>Tất cả</span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-ink-800 dark:text-inkDark-400">
            {items.length}
          </span>
        </button>
      </div>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <Skeleton className="h-40" />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={
            tabFilter === 'paused'
              ? 'Không có ngân sách nào đang tạm dừng'
              : tabFilter === 'active'
              ? 'Không có ngân sách nào đang chạy'
              : 'Chưa có ngân sách'
          }
          description="Đặt ngân sách để kiểm soát chi tiêu theo kỳ."
          icon={<TargetIcon size={20} strokeWidth={1.5} />}
          action={
            <button onClick={handleOpenCreate} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Tạo ngân sách
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredItems.map(b => {
            const p = progress[b.id];
            const cardErr = cardErrors[b.id];
            const spent = p?.spent_minor ?? 0;
            // Không chặn trần ở 150%: giữ nguyên phần trăm thực tế kể cả 300%
            const realPct = p?.percent != null ? Math.round(p.percent) : 0;
            const overshoot = realPct > 100;
            const remaining = Math.max(0, b.amount_minor - spent);
            const overAmount = spent > b.amount_minor ? spent - b.amount_minor : 0;

            const trackColor = overshoot
              ? 'bg-gradient-to-r from-err-500 to-err-600'
              : 'bg-gradient-to-r from-brand-500 to-brand-600';

            // Xác định nhãn phạm vi danh mục
            const hasCategories = Array.isArray(b.category_ids) && b.category_ids.length > 0;
            const assignedCatNames = hasCategories
              ? b.category_ids!
                  .map(cid => categoryMap.get(cid)?.name)
                  .filter(Boolean)
              : [];

            return (
              <div
                key={b.id}
                className={clsx(
                  'card group p-5 transition hover:shadow-pop',
                  !b.is_active && 'opacity-70 bg-ink-50/50 dark:bg-ink-900/30',
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={clsx(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-card',
                      !b.is_active
                        ? 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-inkDark-500'
                        : overshoot
                        ? 'bg-err-50 text-err-600 dark:bg-err-700/15 dark:text-err-500'
                        : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
                    )}
                  >
                    <TargetIcon size={20} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
                            {b.name}
                          </span>
                          {!b.is_active && (
                            <span className="rounded-full bg-ink-200 px-2 py-0.5 text-2xs font-semibold text-ink-600 dark:bg-ink-700 dark:text-inkDark-300">
                              Đã tạm dừng
                            </span>
                          )}
                          {/* Scope badge */}
                          {hasCategories ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-btn bg-brand-50 px-2 py-0.5 text-2xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                              title={assignedCatNames.join(', ')}
                            >
                              <Layers size={10} />
                              {assignedCatNames.length <= 2
                                ? assignedCatNames.join(', ')
                                : `${assignedCatNames.slice(0, 2).join(', ')} +${assignedCatNames.length - 2}`}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-btn bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              title="Áp dụng cho toàn bộ các khoản chi tiêu"
                            >
                              Toàn bộ chi tiêu
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-500 dark:text-inkDark-500 mt-0.5">
                          {BUDGET_CADENCE_LABEL[b.cadence]} · Bắt đầu {formatDate(b.start_date)}
                          {b.end_date && ` · Kết thúc ${formatDate(b.end_date)}`}
                        </div>
                      </div>

                      {/* Số liệu tiến độ hoặc Nút thao tác */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="num text-base tabular-nums text-ink-900 dark:text-inkDark-900">
                            {formatVND(spent)}{' '}
                            <span className="num text-sm text-ink-500 dark:text-inkDark-500">
                              / {formatVND(b.amount_minor)}
                            </span>
                          </div>
                          <div className="text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
                            {p ? `${p.transaction_count} giao dịch` : '—'}
                          </div>
                        </div>

                        {/* Thao tác Sửa / Dừng / Xóa */}
                        <div className="flex items-center gap-1 border-l border-ink-100 pl-3 dark:border-ink-800">
                          <button
                            type="button"
                            onClick={() => handleTogglePause(b)}
                            className="p-1.5 rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-inkDark-400 dark:hover:bg-ink-800 dark:hover:text-inkDark-200"
                            title={b.is_active ? 'Tạm dừng ngân sách' : 'Kích hoạt lại ngân sách'}
                          >
                            {b.is_active ? <Pause size={15} /> : <Play size={15} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(b)}
                            className="p-1.5 rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-inkDark-400 dark:hover:bg-ink-800 dark:hover:text-inkDark-200"
                            title="Chỉnh sửa ngân sách"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingBudget(b)}
                            className="p-1.5 rounded-btn text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                            title="Xóa ngân sách"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Hiển thị lỗi riêng từng card nếu có (F17) */}
                    {cardErr ? (
                      <div className="mt-3 flex items-center justify-between rounded-btn bg-err-50 px-3 py-2 text-xs text-err-700 dark:bg-err-900/20 dark:text-err-300">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle size={14} />
                          Không thể tải tiến độ ({cardErr})
                        </span>
                        <button
                          type="button"
                          onClick={() => loadProgressForBudget(b)}
                          className="font-medium underline hover:text-err-800"
                        >
                          Thử lại
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Thanh Progress */}
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                          <div
                            className={clsx('h-2 rounded-full transition-all', trackColor)}
                            style={{ width: `${Math.min(100, realPct)}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-2xs">
                          <span
                            className={clsx(
                              'font-semibold uppercase tracking-[0.14em]',
                              overshoot
                                ? 'text-err-600 dark:text-err-500'
                                : 'text-brand-600 dark:text-brand-400',
                            )}
                          >
                            {realPct}% đã dùng
                          </span>
                          <span className="text-ink-600 dark:text-inkDark-400">
                            {overshoot ? (
                              <span className="font-medium text-err-600 dark:text-err-400">
                                Vượt ngân sách: +{formatVND(overAmount)}
                              </span>
                            ) : (
                              <span>Còn lại: {formatVND(remaining)}</span>
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm/Sửa Ngân Sách */}
      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={form.id ? 'Chỉnh sửa ngân sách' : 'Thêm ngân sách'}
        description="Đặt giới hạn chi tiêu theo danh mục hoặc toàn bộ chi tiêu."
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setOpenForm(false)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              className="btn-primary inline-flex items-center gap-2"
              onClick={save}
              disabled={submitting}
            >
              {submitting && <Spinner size="sm" />}
              {submitting ? 'Đang lưu…' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <FormField label="Tên ngân sách" required error={formErrors.name}>
            <input
              className="input w-full"
              value={form.name}
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
              }}
              placeholder="VD: Ăn uống & Mua sắm tháng này"
              autoFocus
            />
          </FormField>

          <FormField label="Số tiền (VND)" required error={formErrors.amount}>
            <VNDInput
              value={form.amount_minor}
              onChange={n => {
                setForm({ ...form, amount_minor: n });
                if (formErrors.amount) setFormErrors({ ...formErrors, amount: undefined });
              }}
              className="input w-full"
            />
          </FormField>

          {/* Chọn Phạm vi Danh mục (F03, F04) */}
          <FormField label="Phạm vi chi tiêu" required error={formErrors.categories}>
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-ink-800 dark:text-inkDark-200">
                  <input
                    type="radio"
                    name="scope"
                    checked={form.scope === 'all'}
                    onChange={() => {
                      setForm(f => ({ ...f, scope: 'all' }));
                      if (formErrors.categories) setFormErrors(e => ({ ...e, categories: undefined }));
                    }}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Toàn bộ chi tiêu (All categories)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-ink-800 dark:text-inkDark-200">
                  <input
                    type="radio"
                    name="scope"
                    checked={form.scope === 'specific'}
                    onChange={() => setForm(f => ({ ...f, scope: 'specific' }))}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Chọn danh mục cụ thể</span>
                </label>
              </div>

              {form.scope === 'specific' && (
                <div className="rounded-card border border-ink-200 p-3 bg-ink-50/50 space-y-2 dark:border-ink-700 dark:bg-ink-800/50 max-h-56 overflow-y-auto">
                  <p className="text-2xs text-ink-500 dark:text-inkDark-400 mb-2">
                    Mẹo: Khi chọn danh mục cha, toàn bộ các danh mục con sẽ được tự động tính gộp mà không bị tính trùng.
                  </p>
                  {parentCategories.map(parent => {
                    const children = getChildCategories(parent.id);
                    const isParentChecked = form.category_ids.includes(parent.id);

                    return (
                      <div key={parent.id} className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-sm text-ink-800 dark:text-inkDark-200">
                          <input
                            type="checkbox"
                            checked={isParentChecked}
                            onChange={e => {
                              const checked = e.target.checked;
                              setForm(f => {
                                const newIds = checked
                                  ? [...f.category_ids, parent.id]
                                  : f.category_ids.filter(id => id !== parent.id);
                                return { ...f, category_ids: newIds };
                              });
                              if (formErrors.categories) setFormErrors(e => ({ ...e, categories: undefined }));
                            }}
                            className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span>{parent.name}</span>
                          {children.length > 0 && (
                            <span className="text-xs text-ink-400 dark:text-inkDark-500">
                              (gồm {children.length} mục con)
                            </span>
                          )}
                        </label>

                        {/* Danh sách con nếu cha chưa được chọn */}
                        {children.length > 0 && (
                          <div className="pl-6 space-y-1">
                            {children.map(child => {
                              const isChildChecked = form.category_ids.includes(child.id);
                              return (
                                <label
                                  key={child.id}
                                  className={clsx(
                                    'flex items-center gap-2 text-xs cursor-pointer',
                                    isParentChecked
                                      ? 'text-ink-400 dark:text-inkDark-500'
                                      : 'text-ink-700 dark:text-inkDark-300',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isParentChecked || isChildChecked}
                                    disabled={isParentChecked}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setForm(f => {
                                        const newIds = checked
                                          ? [...f.category_ids, child.id]
                                          : f.category_ids.filter(id => id !== child.id);
                                        return { ...f, category_ids: newIds };
                                      });
                                      if (formErrors.categories) setFormErrors(e => ({ ...e, categories: undefined }));
                                    }}
                                    className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                                  />
                                  <span>{child.name}</span>
                                  {isParentChecked && (
                                    <span className="text-2xs italic text-brand-600 dark:text-brand-400">
                                      (đã gồm theo {parent.name})
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </FormField>

          <FormField label="Chu kỳ">
            <select
              className="input w-full"
              value={form.cadence}
              onChange={e => setForm({ ...form, cadence: e.target.value as Budget['cadence'] })}
            >
              <option value="weekly">{BUDGET_CADENCE_LABEL.weekly}</option>
              <option value="monthly">{BUDGET_CADENCE_LABEL.monthly}</option>
              <option value="custom">{BUDGET_CADENCE_LABEL.custom}</option>
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bắt đầu">
              <input
                className="input w-full"
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
              />
            </FormField>
            <FormField label="Kết thúc (tùy chọn)" error={formErrors.date}>
              <input
                className="input w-full"
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={e => {
                  setForm({ ...form, end_date: e.target.value });
                  if (formErrors.date) setFormErrors({ ...formErrors, date: undefined });
                }}
              />
            </FormField>
          </div>
        </div>
      </Modal>

      {/* Modal xác nhận xóa */}
      <Modal
        open={Boolean(deletingBudget)}
        onClose={() => setDeletingBudget(null)}
        title="Xóa ngân sách"
        description="Bạn có chắc chắn muốn xóa ngân sách này? Hành động này không thể hoàn tác."
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setDeletingBudget(null)}
              disabled={deleting}
            >
              Hủy
            </button>
            <button
              className="btn-primary bg-red-600 hover:bg-red-700 inline-flex items-center gap-2"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting && <Spinner size="sm" />}
              {deleting ? 'Đang xóa…' : 'Xóa'}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-inkDark-400">
          Ngân sách <strong>{deletingBudget?.name}</strong> sẽ bị xóa vĩnh viễn khỏi danh sách theo dõi.
        </p>
      </Modal>
    </div>
  );
}
