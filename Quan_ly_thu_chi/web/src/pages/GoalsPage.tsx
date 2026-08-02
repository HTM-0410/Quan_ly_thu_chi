import { useEffect, useState } from 'react';
import { Pause, Pencil, Play, Plus, RefreshCcw, Target as TargetIcon, Wallet } from 'lucide-react';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { CategoryIcon } from '../components/CategoryIcon';
import { ColorSwatchPicker, IconPicker } from '../components/IconPicker';
import { useToast } from '../components/Toast';
import { VNDInput } from '../components/VNDInput';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  addGoalContribution,
  createGoal,
  listAccounts,
  listGoals,
  updateGoal,
} from '../lib/api';
import { formatDate, formatVND } from '../lib/format';
import { GOAL_STATUS_LABEL } from '../lib/labels';
import clsx from 'clsx';
import type { FinancialAccount, SavingGoal } from '../lib/types';

const COLORS = [
  '#b8451f', '#1e88e5', '#15803d', '#7c3aed',
  '#c026d3', '#db2777', '#ef4444', '#f59e0b',
];

const GOAL_ICONS = [
  'savings', 'piggybank', 'wallet', 'account_balance', 'landmark',
  'home', 'house', 'flight', 'car', 'school',
  'shield', 'gift', 'sparkles', 'star', 'target',
];

interface Form {
  id?: string;
  name: string;
  target_amount_minor: number;
  start_date: string;
  target_date: string;
  color: string;
  icon: string;
  note: string;
  linked_account_id: string;
}

const EMPTY: Form = {
  name: '',
  target_amount_minor: 0,
  start_date: new Date().toISOString().slice(0, 10),
  target_date: '',
  color: COLORS[0],
  icon: GOAL_ICONS[0],
  note: '',
  linked_account_id: '',
};

export function GoalsPage() {
  useDocumentTitle('Mục tiêu');
  const toast = useToast();
  const [items, setItems] = useState<SavingGoal[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; target?: string; date?: string }>({});
  const [form, setForm] = useState<Form>(EMPTY);
  const [contribFor, setContribFor] = useState<SavingGoal | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [g, a] = await Promise.all([listGoals(), listAccounts()]);
      setItems(g);
      setAccounts(a);
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
    setForm(EMPTY);
    setFormErrors({});
    setOpenForm(true);
  }
  function openEdit(g: SavingGoal) {
    setForm({
      id: g.id,
      name: g.name,
      target_amount_minor: g.target_amount_minor,
      start_date: g.start_date,
      target_date: g.target_date ?? '',
      color: g.color,
      icon: g.icon || GOAL_ICONS[0],
      note: g.note ?? '',
      linked_account_id: g.linked_account_id ?? '',
    });
    setFormErrors({});
    setOpenForm(true);
  }

  function validate(): boolean {
    const errors: typeof formErrors = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập tên mục tiêu.';
    if (form.target_amount_minor <= 0) errors.target = 'Số tiền mục tiêu phải lớn hơn 0.';
    if (form.target_date && form.target_date < form.start_date) {
      errors.date = 'Ngày kết thúc phải sau ngày bắt đầu.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        target_amount_minor: form.target_amount_minor,
        start_date: form.start_date,
        target_date: form.target_date || null,
        color: form.color,
        icon: form.icon,
        note: form.note.trim() || null,
        linked_account_id: form.linked_account_id || null,
      };
      if (form.id) {
        await updateGoal(form.id, payload);
        toast.push('success', 'Đã cập nhật mục tiêu');
      } else {
        await createGoal(payload);
        toast.push('success', 'Đã tạo mục tiêu');
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(g: SavingGoal, status: SavingGoal['status']) {
    try {
      await updateGoal(g.id, { status });
      toast.push('success', `Đã đổi trạng thái → ${GOAL_STATUS_LABEL[status]}`);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {items.length} mục tiêu
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Mục tiêu tiết kiệm
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Đặt mục tiêu và theo dõi tiến độ tích lũy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách mục tiêu"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={openCreate}>
            <Plus size={16} strokeWidth={2.25} /> Thêm mục tiêu
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có mục tiêu nào"
          description="Tạo mục tiêu tiết kiệm để có động lực tích lũy."
          icon={<TargetIcon size={20} strokeWidth={1.5} />}
          action={
            <button onClick={openCreate} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Tạo mục tiêu
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(g => {
            const pct = Math.min(
              100,
              Math.round((g.current_amount_minor / Math.max(1, g.target_amount_minor)) * 100),
            );
            const statusChip =
              g.status === 'completed'
                ? 'bg-ok-50 text-ok-700 dark:bg-ok-700/15 dark:text-ok-500'
                : g.status === 'paused'
                  ? 'bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-500'
                  : g.status === 'abandoned'
                    ? 'bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-inkDark-500'
                    : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300';
            return (
              <div key={g.id} className="card space-y-4 p-5 transition hover:shadow-pop">
                <div className="flex items-start gap-3">
                  <CategoryIcon
                    name={g.icon || 'savings'}
                    color={g.color}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
                      {g.name}
                    </div>
                    <div className="text-xs text-ink-500 dark:text-inkDark-500">
                      Bắt đầu {formatDate(g.start_date)}
                      {g.target_date ? ` · Đến ${formatDate(g.target_date)}` : ''}
                    </div>
                  </div>
                  <span className={clsx('chip', statusChip)}>
                    {GOAL_STATUS_LABEL[g.status]}
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="num text-lg tabular-nums text-ok-700 dark:text-ok-500">
                      {formatVND(g.current_amount_minor)}
                    </span>
                    <span className="num text-2xs tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
                      / {formatVND(g.target_amount_minor)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: g.color,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
                    {pct}% hoàn thành
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
                    onClick={() => setContribFor(g)}
                  >
                    <Wallet size={13} strokeWidth={1.75} /> Đóng góp
                  </button>
                  <button
                    className="btn-secondary inline-flex items-center gap-1.5 !px-3"
                    onClick={() => openEdit(g)}
                  >
                    <Pencil size={13} strokeWidth={1.75} /> Sửa
                  </button>
                  {g.status === 'active' && (
                    <button
                      className="btn-secondary inline-flex items-center gap-1.5 !px-3"
                      onClick={() => setStatus(g, 'paused')}
                    >
                      <Pause size={13} strokeWidth={1.75} /> Tạm dừng
                    </button>
                  )}
                  {g.status === 'paused' && (
                    <button
                      className="btn-primary inline-flex items-center gap-1.5 !px-3"
                      onClick={() => setStatus(g, 'active')}
                    >
                      <Play size={13} strokeWidth={1.75} /> Tiếp tục
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={form.id ? 'Sửa mục tiêu' : 'Thêm mục tiêu'}
        description={form.id ? 'Cập nhật thông tin mục tiêu.' : 'Tạo mục tiêu tiết kiệm mới.'}
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
          <FormField label="Tên mục tiêu" required error={formErrors.name}>
            <input
              className="input"
              value={form.name}
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
              }}
              autoFocus
            />
          </FormField>
          <FormField label="Số tiền cần đạt (VND)" required error={formErrors.target}>
            <VNDInput
              value={form.target_amount_minor}
              onChange={n => {
                setForm({ ...form, target_amount_minor: n });
                if (formErrors.target) setFormErrors({ ...formErrors, target: undefined });
              }}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ngày bắt đầu">
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
              />
            </FormField>
            <FormField label="Ngày kết thúc" error={formErrors.date}>
              <input
                className="input"
                type="date"
                value={form.target_date}
                min={form.start_date}
                onChange={e => {
                  setForm({ ...form, target_date: e.target.value });
                  if (formErrors.date) setFormErrors({ ...formErrors, date: undefined });
                }}
              />
            </FormField>
          </div>
          <FormField label="Tài khoản liên kết">
            <select
              className="input"
              value={form.linked_account_id}
              onChange={e => setForm({ ...form, linked_account_id: e.target.value })}
            >
              <option value="">-- Không liên kết --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Màu sắc">
              <ColorSwatchPicker
                options={COLORS}
                value={form.color}
                onChange={c => setForm({ ...form, color: c })}
                ariaLabel="Chọn màu mục tiêu"
              />
            </FormField>
            <FormField label="Biểu tượng">
              <IconPicker
                options={GOAL_ICONS}
                value={form.icon}
                accent={form.color}
                columns={5}
                onChange={ic => setForm({ ...form, icon: ic })}
                ariaLabel="Chọn biểu tượng mục tiêu"
              />
            </FormField>
          </div>
          <FormField label="Ghi chú">
            <input
              className="input"
              value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
            />
          </FormField>
        </div>
      </Modal>

      <ContributionModal
        goal={contribFor}
        onClose={() => setContribFor(null)}
        onDone={() => {
          setContribFor(null);
          load();
        }}
      />
    </div>
  );
}

function ContributionModal({
  goal,
  onClose,
  onDone,
}: {
  goal: SavingGoal | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  if (!goal) return null;
  const goalId = goal.id;

  async function submit() {
    if (amount === 0) {
      setAmountError('Vui lòng nhập số tiền.');
      return;
    }
    setSubmitting(true);
    try {
      await addGoalContribution({
        goal_id: goalId,
        amount_minor: amount,
        note: note.trim() || null,
      });
      toast.push('success', 'Đã ghi nhận đóng góp');
      onDone();
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
      title={`Đóng góp cho "${goal.name}"`}
      size="sm"
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
            {submitting ? 'Đang lưu…' : 'Đóng góp'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-card border border-ink-100 bg-surface-sunken p-3 text-sm dark:border-ink-800 dark:bg-surface-dark-sunken">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-500 dark:text-inkDark-500">Hiện tại</span>
            <span className="num tabular-nums text-ink-900 dark:text-inkDark-900">
              {formatVND(goal.current_amount_minor)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-ink-500 dark:text-inkDark-500">Mục tiêu</span>
            <span className="num tabular-nums text-ink-700 dark:text-inkDark-500">
              {formatVND(goal.target_amount_minor)}
            </span>
          </div>
        </div>
        <FormField label="Số tiền (VND, dương = thêm, âm = rút)" required error={amountError}>
          <VNDInput
            value={amount}
            onChange={n => {
              setAmount(n);
              if (amountError) setAmountError(null);
            }}
            placeholder="VD: 1.000.000"
            autoFocus
          />
        </FormField>
        <FormField label="Ghi chú">
          <input className="input" value={note} onChange={e => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
