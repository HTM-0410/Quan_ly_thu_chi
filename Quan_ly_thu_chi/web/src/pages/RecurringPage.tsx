import { useEffect, useState } from 'react';
import { Pause, Pencil, Play, Plus, RefreshCcw, Repeat } from 'lucide-react';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { AccountIcon } from '../components/AccountIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { useToast } from '../components/Toast';
import { VNDInput } from '../components/VNDInput';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  createRecurring,
  listAccounts,
  listCategories,
  listRecurring,
  materializeRecurring,
  updateRecurring,
} from '../lib/api';
import { formatDate, formatVND } from '../lib/format';
import {
  RECURRING_FREQ_LABEL,
  RECURRING_STATUS_LABEL,
  TRANSACTION_TYPE_LABEL,
} from '../lib/labels';
import clsx from 'clsx';
import type {
  Category,
  FinancialAccount,
  RecurringFrequency,
  RecurringRule,
} from '../lib/types';

const FREQS: RecurringFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

interface Form {
  id?: string;
  name: string;
  type: 'income' | 'expense';
  account_id: string;
  amount_minor: number;
  frequency: RecurringFrequency;
  start_date: string;
  category_id: string;
  payee: string;
  note: string;
  day_of_month: string;
}

const EMPTY: Form = {
  name: '',
  type: 'expense',
  account_id: '',
  amount_minor: 0,
  frequency: 'monthly',
  start_date: new Date().toISOString().slice(0, 10),
  category_id: '',
  payee: '',
  note: '',
  day_of_month: '1',
};

export function RecurringPage() {
  useDocumentTitle('Định kỳ');
  const toast = useToast();
  const [items, setItems] = useState<RecurringRule[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; amount?: string }>({});
  const [form, setForm] = useState<Form>(EMPTY);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [r, a, c] = await Promise.all([
        listRecurring(),
        listAccounts(),
        listCategories(),
      ]);
      setItems(r);
      setAccounts(a);
      setCategories(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({ ...EMPTY, account_id: accounts[0]?.id ?? '' });
    setFormErrors({});
    setOpenForm(true);
  }
  function openEdit(r: RecurringRule) {
    setForm({
      id: r.id,
      name: r.name,
      type: r.type === 'income' ? 'income' : 'expense',
      account_id: r.account_id,
      amount_minor: r.amount_minor,
      frequency: r.frequency,
      start_date: r.start_date,
      category_id: r.category_id ?? '',
      payee: r.payee ?? '',
      note: r.note ?? '',
      day_of_month: r.day_of_month?.toString() ?? '1',
    });
    setFormErrors({});
    setOpenForm(true);
  }

  function validate(): boolean {
    const errors: typeof formErrors = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập tên quy tắc.';
    if (form.amount_minor <= 0) errors.amount = 'Số tiền phải lớn hơn 0.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        account_id: form.account_id,
        amount_minor: form.amount_minor,
        frequency: form.frequency,
        start_date: form.start_date,
        day_of_month: form.day_of_month ? Number(form.day_of_month) : null,
        category_id: form.category_id || null,
        payee: form.payee.trim() || null,
        note: form.note.trim() || null,
      };
      if (form.id) {
        await updateRecurring(form.id, payload);
        toast.push('success', 'Đã cập nhật');
      } else {
        await createRecurring(payload);
        toast.push('success', 'Đã tạo quy tắc');
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePause(r: RecurringRule) {
    try {
      const status: RecurringRule['status'] =
        r.status === 'active' ? 'paused' : 'active';
      await updateRecurring(r.id, { status });
      toast.push('success', `Đã ${status === 'active' ? 'tiếp tục' : 'tạm dừng'}`);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    }
  }

  async function runMaterialize() {
    setRunning(true);
    try {
      const created = await materializeRecurring();
      toast.push('success', `Đã sinh ${created} giao dịch`);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const accountById = new Map(accounts.map(a => [a.id, a]));
  const cats = categories.filter(c => c.kind === form.type || c.kind === 'both');

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {items.length} quy tắc
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Giao dịch định kỳ
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Tự động sinh giao dịch khi đến hạn. Có thể chạy thủ công bất kỳ lúc nào.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách quy tắc"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={runMaterialize}
            disabled={running}
          >
            {running ? <Spinner size="sm" /> : <Repeat size={14} strokeWidth={1.75} />}
            {running ? 'Đang chạy…' : 'Sinh ngay'}
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={openCreate}>
            <Plus size={16} strokeWidth={2.25} /> Thêm quy tắc
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có quy tắc định kỳ"
          description="Tạo quy tắc cho thu nhập (lương) hoặc chi phí cố định (thuê nhà, Netflix…) để không phải nhập tay mỗi kỳ."
          icon={<Repeat size={20} strokeWidth={1.5} />}
          action={
            <button onClick={openCreate} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Tạo quy tắc
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map(r => {
            const acc = accountById.get(r.account_id);
            const cat = r.category_id ? categories.find(c => c.id === r.category_id) : null;
            const statusChip =
              r.status === 'active'
                ? 'bg-ok-50 text-ok-700 dark:bg-ok-700/15 dark:text-ok-500'
                : r.status === 'paused'
                  ? 'bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-500'
                  : 'bg-ink-50 text-ink-600 dark:bg-ink-800 dark:text-inkDark-500';
            return (
              <div
                key={r.id}
                className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:shadow-pop"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {cat ? (
                    <CategoryIcon name={cat.icon} color={cat.color} size="md" />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                      <Repeat size={20} strokeWidth={1.75} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="h-display text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                      {r.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500 dark:text-inkDark-500">
                      <span>{TRANSACTION_TYPE_LABEL[r.type]}</span>
                      <span className="text-ink-300 dark:text-inkDark-400">·</span>
                      <span>{RECURRING_FREQ_LABEL[r.frequency]}</span>
                      {acc && (
                        <>
                          <span className="text-ink-300 dark:text-inkDark-400">·</span>
                          <span className="inline-flex items-center gap-1">
                            <AccountIcon name={acc.icon} color={acc.color} size="xs" variant="solid" />
                            {acc.name}
                          </span>
                        </>
                      )}
                      <span className="text-ink-300 dark:text-inkDark-400">·</span>
                      <span>Từ {formatDate(r.start_date)}</span>
                      {r.next_occurrence && (
                        <>
                          <span className="text-ink-300 dark:text-inkDark-400">→</span>
                          <span>Kế tiếp {formatDate(r.next_occurrence)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={clsx(
                      'num text-base tabular-nums',
                      r.type === 'income'
                        ? 'text-ok-600 dark:text-ok-500'
                        : 'text-err-600 dark:text-err-500',
                    )}
                  >
                    {r.type === 'income' ? '+' : '−'}
                    {formatVND(r.amount_minor)}
                  </span>
                  <span className={clsx('chip', statusChip)}>
                    {RECURRING_STATUS_LABEL[r.status]}
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost grid h-8 w-8 place-items-center !p-0"
                      onClick={() => openEdit(r)}
                      aria-label="Sửa quy tắc"
                      title="Sửa"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      className="btn-ghost grid h-8 w-8 place-items-center !p-0"
                      onClick={() => togglePause(r)}
                      aria-label={r.status === 'active' ? 'Tạm dừng' : 'Tiếp tục'}
                      title={r.status === 'active' ? 'Tạm dừng' : 'Tiếp tục'}
                    >
                      {r.status === 'active' ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={form.id ? 'Sửa quy tắc' : 'Thêm quy tắc định kỳ'}
        description="Quy tắc sẽ sinh giao dịch khi đến hạn."
        size="lg"
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
        <div className="space-y-4">
          <FormField label="Tên" required error={formErrors.name}>
            <input
              className="input"
              value={form.name}
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
              }}
              placeholder="VD: Lương tháng, Netflix..."
              autoFocus
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Loại">
              <select
                className="input"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as 'income' | 'expense' })}
              >
                <option value="expense">{TRANSACTION_TYPE_LABEL.expense}</option>
                <option value="income">{TRANSACTION_TYPE_LABEL.income}</option>
              </select>
            </FormField>
            <FormField label="Số tiền (VND)" required error={formErrors.amount}>
              <VNDInput
                value={form.amount_minor}
                onChange={n => {
                  setForm({ ...form, amount_minor: n });
                  if (formErrors.amount) setFormErrors({ ...formErrors, amount: undefined });
                }}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tài khoản">
              <select
                className="input"
                value={form.account_id}
                onChange={e => setForm({ ...form, account_id: e.target.value })}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tần suất">
              <select
                className="input"
                value={form.frequency}
                onChange={e =>
                  setForm({ ...form, frequency: e.target.value as RecurringFrequency })
                }
              >
                {FREQS.map(f => (
                  <option key={f} value={f}>
                    {RECURRING_FREQ_LABEL[f]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bắt đầu">
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
              />
            </FormField>
            <FormField
              label="Ngày trong tháng"
              hint="Áp dụng cho tháng/quý/năm. Ngày 31 sẽ tự về ngày cuối tháng nếu tháng đó ít hơn 31 ngày."
            >
              <input
                className="input"
                type="number"
                min={1}
                max={31}
                value={form.day_of_month}
                onChange={e => setForm({ ...form, day_of_month: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Danh mục">
            <select
              className="input"
              value={form.category_id}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">-- Không --</option>
              {cats.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Đối tượng">
            <input
              className="input"
              value={form.payee}
              onChange={e => setForm({ ...form, payee: e.target.value })}
            />
          </FormField>
          <FormField label="Ghi chú">
            <input
              className="input"
              value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
