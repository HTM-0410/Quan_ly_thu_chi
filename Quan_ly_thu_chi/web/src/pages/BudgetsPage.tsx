import { useEffect, useState } from 'react';
import { Pause, Plus, RefreshCcw, Target as TargetIcon } from 'lucide-react';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { VNDInput } from '../components/VNDInput';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { createBudget, getBudgetProgress, listBudgets } from '../lib/api';
import { formatDate, formatVND } from '../lib/format';
import { BUDGET_CADENCE_LABEL } from '../lib/labels';
import clsx from 'clsx';
import type { Budget } from '../lib/types';

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
}

const EMPTY: Form = {
  name: '',
  amount_minor: 0,
  cadence: 'monthly',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
};

export function BudgetsPage() {
  useDocumentTitle('Ngân sách');
  const toast = useToast();
  const [items, setItems] = useState<Budget[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; amount?: string; date?: string }>({});
  const [form, setForm] = useState<Form>(EMPTY);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const budgets = await listBudgets();
      setItems(budgets);
      const ps: Record<string, Progress | undefined> = {};
      await Promise.all(
        budgets.map(async b => {
          const start = periodStart(b).toISOString();
          const end = periodEnd(b).toISOString();
          try {
            ps[b.id] = await getBudgetProgress(b.id, start, end);
          } catch {
            ps[b.id] = undefined;
          }
        }),
      );
      setProgress(ps);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function validate(): boolean {
    const errors: typeof formErrors = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập tên ngân sách.';
    if (form.amount_minor <= 0) errors.amount = 'Số tiền phải lớn hơn 0.';
    if (form.end_date && form.end_date < form.start_date) {
      errors.date = 'Ngày kết thúc phải sau ngày bắt đầu.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createBudget({
        name: form.name.trim(),
        amount_minor: form.amount_minor,
        cadence: form.cadence,
        start_date: form.start_date,
        end_date: form.end_date || null,
      });
      toast.push('success', 'Đã tạo ngân sách');
      setOpenForm(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {items.length} ngân sách đang chạy
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Ngân sách
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Đặt giới hạn chi tiêu và theo dõi tiến độ theo chu kỳ.
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
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setOpenForm(true)}>
            <Plus size={16} strokeWidth={2.25} /> Thêm ngân sách
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có ngân sách"
          description="Đặt ngân sách để kiểm soát chi tiêu theo kỳ."
          icon={<TargetIcon size={20} strokeWidth={1.5} />}
          action={
            <button onClick={() => setOpenForm(true)} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Tạo ngân sách
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map(b => {
            const p = progress[b.id];
            const spent = p?.spent_minor ?? 0;
            const pct = Math.min(150, Math.round(p?.percent ?? 0));
            const overshoot = (p?.percent ?? 0) > 100;
            const trackColor = overshoot
              ? 'bg-gradient-to-r from-err-500 to-err-600'
              : 'bg-gradient-to-r from-brand-500 to-brand-600';
            return (
              <div key={b.id} className="card group p-5 transition hover:shadow-pop">
                <div className="flex items-start gap-4">
                  <div
                    className={clsx(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-card',
                      overshoot
                        ? 'bg-err-50 text-err-600 dark:bg-err-700/15 dark:text-err-500'
                        : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
                    )}
                  >
                    <TargetIcon size={20} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
                          {b.name}
                        </div>
                        <div className="text-xs text-ink-500 dark:text-inkDark-500">
                          {BUDGET_CADENCE_LABEL[b.cadence]} · Bắt đầu {formatDate(b.start_date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="num text-base tabular-nums text-ink-900 dark:text-inkDark-900">
                          {formatVND(spent)}{' '}
                          <span className="num text-sm text-ink-500 dark:text-inkDark-500">
                            / {formatVND(b.amount_minor)}
                          </span>
                        </div>
                        <div className="text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
                          {p?.transaction_count ?? 0} giao dịch
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div
                        className={clsx('h-2 rounded-full transition-all', trackColor)}
                        style={{ width: `${Math.min(100, pct)}%` }}
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
                        {pct}% đã dùng
                      </span>
                      {overshoot && (
                        <span className="inline-flex items-center gap-1 text-err-600 dark:text-err-500">
                          <Pause size={11} /> Vượt ngân sách
                        </span>
                      )}
                    </div>
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
        title="Thêm ngân sách"
        description="Đặt giới hạn chi tiêu theo chu kỳ."
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
          <FormField label="Tên ngân sách" required error={formErrors.name}>
            <input
              className="input"
              value={form.name}
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
              }}
              placeholder="VD: Ăn uống tháng này"
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
            />
          </FormField>
          <FormField label="Chu kỳ">
            <select
              className="input"
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
                className="input"
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
              />
            </FormField>
            <FormField label="Kết thúc (tùy chọn)" error={formErrors.date}>
              <input
                className="input"
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
    </div>
  );
}
