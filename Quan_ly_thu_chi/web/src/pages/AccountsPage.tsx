import { useEffect, useMemo, useState } from 'react';
import { Archive, Pencil, Plus, RefreshCcw, RotateCcw, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { VNDInput } from '../components/VNDInput';
import { AccountIcon } from '../components/AccountIcon';
import { useToast } from '../components/Toast';
import { useConfirm } from '../hooks/useConfirm';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  adjustAccountBalance,
  archiveAccount,
  createAccount,
  listAccountsWithBalances,
  unarchiveAccount,
  updateAccount,
} from '../lib/api';
import { formatVND } from '../lib/format';
import { ACCOUNT_TYPE_LABEL } from '../lib/labels';
import type { FinancialAccount } from '../lib/types';
import { ColorSwatchPicker, IconPicker } from '../components/IconPicker';

const ACCOUNT_TYPES: FinancialAccount['type'][] = [
  'cash',
  'bank',
  'ewallet',
  'credit_card',
  'savings',
  'other',
];

const ACCOUNT_ICON_OPTIONS = [
  'account_balance_wallet',
  'wallet',
  'savings',
  'piggybank',
  'account_balance',
  'landmark',
  'credit_card',
  'creditcard',
  'payments',
  'banknote',
  'coins',
  'dollar',
  'shopping_bag',
  'shopping_cart',
  'home',
  'store',
  'package',
  'briefcase',
  'shield',
  'building',
];

const COLOR_OPTIONS = [
  '#b8451f', // brand
  '#1e88e5',
  '#15803d',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#ef4444',
  '#f59e0b',
  '#0f766e',
  '#475569',
];

interface FormState {
  id?: string;
  name: string;
  type: FinancialAccount['type'];
  opening_balance_minor: number;
  currency: string;
  color: string;
  institution_name: string;
  icon: string;
}

const empty: FormState = {
  name: '',
  type: 'cash',
  opening_balance_minor: 0,
  currency: 'VND',
  color: COLOR_OPTIONS[0],
  institution_name: '',
  icon: ACCOUNT_ICON_OPTIONS[0],
};

export function AccountsPage() {
  useDocumentTitle('Tài khoản');
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<(FinancialAccount & { balance: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [adjustTarget, setAdjustTarget] = useState<(FinancialAccount & { balance: number }) | null>(null);
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const accs = await listAccountsWithBalances(true);
      setItems(accs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeAccounts = useMemo(() => items.filter(a => !a.is_archived), [items]);
  const archivedAccounts = useMemo(() => items.filter(a => a.is_archived), [items]);
  const displayedAccounts = tab === 'active' ? activeAccounts : archivedAccounts;

  const totalBalance = useMemo(
    () => activeAccounts.reduce((sum, a) => sum + a.balance, 0),
    [activeAccounts],
  );

  const isFormDirty = useMemo(() => {
    if (!openForm) return false;
    if (!form.id) {
      return (
        form.name.trim() !== '' ||
        form.opening_balance_minor !== 0 ||
        form.institution_name.trim() !== '' ||
        form.type !== 'cash'
      );
    }
    const original = items.find(a => a.id === form.id);
    if (!original) return false;
    return (
      form.name !== original.name ||
      form.type !== original.type ||
      form.color !== original.color ||
      (form.institution_name || '') !== (original.institution_name || '') ||
      form.icon !== original.icon
    );
  }, [openForm, form, items]);

  function openCreate() {
    setForm(empty);
    setNameError(null);
    setOpenForm(true);
  }

  function openEdit(a: FinancialAccount) {
    setForm({
      id: a.id,
      name: a.name,
      type: a.type,
      opening_balance_minor: a.opening_balance_minor,
      currency: a.currency,
      color: a.color,
      institution_name: a.institution_name ?? '',
      icon: a.icon,
    });
    setNameError(null);
    setOpenForm(true);
  }

  async function handleSave() {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setNameError('Vui lòng nhập tên tài khoản.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        type: form.type,
        opening_balance_minor: form.opening_balance_minor,
        currency: form.currency || 'VND',
        color: form.color,
        institution_name: form.institution_name.trim() || null,
        icon: form.icon,
      };
      if (form.id) {
        await updateAccount(form.id, payload);
        toast.push('success', 'Đã cập nhật tài khoản');
      } else {
        await createAccount(payload);
        toast.push('success', 'Đã tạo tài khoản');
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(a: FinancialAccount & { balance: number }) {
    let warning = `Tài khoản "${a.name}" sẽ bị ẩn khỏi danh sách tài khoản hoạt động. Bạn có thể xem lại và khôi phục trong tab Đã lưu trữ.`;
    if (a.balance > 0) {
      warning = `CẢNH BÁO TÀI CHÍNH: Tài khoản "${a.name}" vẫn còn số dư ${formatVND(a.balance)}. Bạn có chắc muốn lưu trữ không? Số dư này sẽ không còn hiển thị trong danh sách tài khoản hoạt động.`;
    } else if (a.balance < 0) {
      warning = `CẢNH BÁO DƯ NỢ: Tài khoản "${a.name}" đang có số dư âm ${formatVND(a.balance)}. Bạn có chắc muốn lưu trữ không?`;
    }

    const ok = await confirm({
      title: 'Lưu trữ tài khoản?',
      message: warning,
      confirmText: 'Lưu trữ',
      cancelText: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await archiveAccount(a.id);
      toast.push('success', 'Đã lưu trữ tài khoản');
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUnarchive(a: FinancialAccount) {
    const ok = await confirm({
      title: 'Khôi phục tài khoản?',
      message: `Đưa tài khoản "${a.name}" trở lại danh sách hoạt động để tiếp tục ghi nhận giao dịch.`,
      confirmText: 'Khôi phục',
      cancelText: 'Hủy',
      variant: 'default',
    });
    if (!ok) return;
    try {
      await unarchiveAccount(a.id);
      toast.push('success', 'Đã khôi phục tài khoản');
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
            {tab === 'active'
              ? `${activeAccounts.length} tài khoản đang hoạt động`
              : `${archivedAccounts.length} tài khoản đã lưu trữ`}
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Tài khoản
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Tiền mặt, ngân hàng, ví điện tử, thẻ tín dụng và tiết kiệm.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách tài khoản"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={openCreate}>
            <Plus size={16} strokeWidth={2.25} /> Thêm tài khoản
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {/* Tabs */}
      <div className="flex gap-1 rounded-card bg-ink-100 p-1 dark:bg-ink-800 max-w-xs">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={clsx(
            'flex-1 rounded-btn py-1.5 text-sm font-medium transition',
            tab === 'active'
              ? 'bg-surface shadow-sm text-ink-900 dark:bg-surface-dark dark:text-inkDark-900'
              : 'text-ink-600 hover:text-ink-900 dark:text-inkDark-500 dark:hover:text-inkDark-900'
          )}
        >
          Đang hoạt động ({activeAccounts.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('archived')}
          className={clsx(
            'flex-1 rounded-btn py-1.5 text-sm font-medium transition',
            tab === 'archived'
              ? 'bg-surface shadow-sm text-ink-900 dark:bg-surface-dark dark:text-inkDark-900'
              : 'text-ink-600 hover:text-ink-900 dark:text-inkDark-500 dark:hover:text-inkDark-900'
          )}
        >
          Đã lưu trữ ({archivedAccounts.length})
        </button>
      </div>

      {!loading && tab === 'active' && activeAccounts.length > 0 && (
        <div className="card flex items-center justify-between gap-4 p-5">
          <div>
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500 dark:text-inkDark-500">
              Tổng số dư
            </div>
            <div className="num mt-1 text-[28px] leading-none tracking-tight text-ink-900 dark:text-inkDark-900">
              {formatVND(totalBalance)}
            </div>
          </div>
          <Wallet size={28} strokeWidth={1.5} className="text-brand-500" />
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : displayedAccounts.length === 0 ? (
        <EmptyState
          title={tab === 'active' ? 'Chưa có tài khoản nào' : 'Không có tài khoản đã lưu trữ'}
          description={
            tab === 'active'
              ? 'Tạo tài khoản đầu tiên để bắt đầu theo dõi.'
              : 'Các tài khoản bạn đã lưu trữ sẽ xuất hiện tại đây.'
          }
          icon={<Wallet size={20} strokeWidth={1.5} />}
          action={
            tab === 'active' ? (
              <button onClick={openCreate} className="btn-primary inline-flex items-center gap-1.5">
                <Plus size={16} strokeWidth={2.25} /> Tạo tài khoản
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayedAccounts.map(a => (
            <div
              key={a.id}
              className={clsx(
                'card group p-5 transition hover:shadow-pop',
                a.is_archived && 'opacity-75 bg-ink-50/50 dark:bg-ink-900/30'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AccountIcon name={a.icon} color={a.color} size="lg" variant="solid" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                        {a.name}
                      </span>
                      {a.is_archived && (
                        <span className="rounded bg-ink-200 px-1.5 py-0.5 text-2xs font-medium text-ink-700 dark:bg-ink-700 dark:text-inkDark-200">
                          Đã lưu trữ
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500 dark:text-inkDark-500">
                      {ACCOUNT_TYPE_LABEL[a.type]}
                      {a.institution_name ? ` · ${a.institution_name}` : ''}
                    </div>
                  </div>
                </div>
              </div>
              <div className="num mt-4 text-2xl tabular-nums text-ink-900 dark:text-inkDark-900">
                {formatVND(a.balance)}
              </div>
              <div className="mt-4 flex gap-2">
                {!a.is_archived ? (
                  <>
                    <button
                      className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
                      onClick={() => openEdit(a)}
                    >
                      <Pencil size={13} strokeWidth={1.75} /> Sửa
                    </button>
                    <button
                      className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
                      onClick={() => setAdjustTarget(a)}
                      title="Đặt số dư tuyệt đối"
                    >
                      <Wallet size={13} strokeWidth={1.75} /> Số dư
                    </button>
                    <button
                      className="btn-danger flex-1 inline-flex items-center justify-center gap-1.5"
                      onClick={() => handleArchive(a)}
                    >
                      <Archive size={13} strokeWidth={1.75} /> Lưu trữ
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-secondary w-full inline-flex items-center justify-center gap-1.5"
                    onClick={() => handleUnarchive(a)}
                  >
                    <RotateCcw size={13} strokeWidth={1.75} /> Khôi phục tài khoản
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={form.id ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        description={form.id ? 'Cập nhật thông tin tài khoản.' : 'Tạo một tài khoản mới để theo dõi.'}
        size="lg"
        isDirty={isFormDirty}
        loading={submitting}
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
              onClick={handleSave}
              disabled={submitting}
            >
              {submitting && <Spinner size="sm" tone="current" />}
              {submitting ? 'Đang lưu…' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Tên tài khoản" required error={nameError}>
              <input
                className="input"
                value={form.name}
                onChange={e => {
                  setForm({ ...form, name: e.target.value });
                  if (nameError) setNameError(null);
                }}
                placeholder="VD: Tiền mặt, Techcombank..."
                autoFocus
              />
            </FormField>
            <FormField label="Loại">
              <select
                className="input"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as FinancialAccount['type'] })}
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Ngân hàng / Tổ chức">
            <input
              className="input"
              value={form.institution_name}
              onChange={e => setForm({ ...form, institution_name: e.target.value })}
              placeholder="VCB, Techcombank..."
            />
          </FormField>

          {!form.id && (
            <FormField label="Số dư ban đầu (VND)">
              <VNDInput
                value={form.opening_balance_minor || null}
                onChange={minor => setForm({ ...form, opening_balance_minor: minor ?? 0 })}
                placeholder="Số dư mong muốn khi mở tài khoản"
              />
            </FormField>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Màu sắc">
              <ColorSwatchPicker
                options={COLOR_OPTIONS}
                value={form.color}
                onChange={c => setForm({ ...form, color: c })}
                ariaLabel="Chọn màu tài khoản"
              />
            </FormField>
            <FormField label="Biểu tượng">
              <IconPicker
                options={ACCOUNT_ICON_OPTIONS}
                value={form.icon}
                accent={form.color}
                columns={5}
                onChange={ic => setForm({ ...form, icon: ic })}
                ariaLabel="Chọn biểu tượng tài khoản"
              />
            </FormField>
          </div>
        </div>
      </Modal>

      {adjustTarget && (
        <AdjustBalanceDialog
          account={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={() => {
            setAdjustTarget(null);
            toast.push('success', 'Đã đặt số dư');
            load();
          }}
        />
      )}
    </div>
  );
}

// ==============================
// Adjust balance dialog
// Đặt số dư tuyệt đối: gọi RPC adjust_account_balance để chỉnh opening_balance
// sao cho opening + entries = target.
// ==============================
interface AdjustProps {
  account: FinancialAccount & { balance: number };
  onClose: () => void;
  onSaved: () => void;
}

function AdjustBalanceDialog({ account, onClose, onSaved }: AdjustProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [target, setTarget] = useState<number | null>(account.balance);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (target == null || target < 0) {
      toast.push('error', 'Số dư mong muốn phải >= 0');
      return;
    }
    const delta = target - account.balance;
    const ok = await confirm({
      title: 'Đặt số dư tài khoản?',
      message: `${account.name}: ${formatVND(account.balance)} → ${formatVND(target)} (${delta >= 0 ? '+' : ''}${formatVND(delta)}). Hệ thống sẽ tự điều chỉnh để khớp.`,
      confirmText: 'Đặt số dư',
      cancelText: 'Không',
      variant: 'default',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await adjustAccountBalance(account.id, target, note.trim() || undefined);
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
      title={`Đặt số dư: ${account.name}`}
      description={`Số dư hiện tại: ${formatVND(account.balance)} · Số dư gốc: ${formatVND(account.opening_balance_minor)}`}
      size="md"
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
            {submitting && <Spinner size="sm" tone="current" />}
            {submitting ? 'Đang lưu…' : 'Đặt số dư'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Số dư mong muốn (VND)" required>
          <VNDInput
            value={target}
            onChange={n => setTarget(n ?? 0)}
            placeholder="VD: 5.000.000"
            autoFocus
          />
        </FormField>
        <FormField label="Lý do (tùy chọn)">
          <input
            className="input"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="VD: Đối chiếu với sao kê ngân hàng"
          />
        </FormField>
        <div className="rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-xs text-ink-600 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
          Hệ thống sẽ tự căn chỉnh để <strong>Số dư hiện tại = Số dư mong muốn</strong>. Hành động này được ghi audit log.
        </div>
      </div>
    </Modal>
  );
}
