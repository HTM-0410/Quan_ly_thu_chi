import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCcw, Users } from 'lucide-react';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useConfirm } from '../hooks/useConfirm';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { createPerson, deletePerson, getPeople, getDebts, updatePerson } from '../lib/api';
import { formatVND } from '../lib/format';
import type { Person } from '../lib/types';

interface PersonWithDebt extends Person {
  totalLend: number;
  totalBorrow: number;
}

interface Form {
  id?: string;
  name: string;
  phone: string;
}

const EMPTY: Form = { name: '', phone: '' };

export function PeoplePage() {
  useDocumentTitle('Người quen');
  const toast = useToast();
  const confirm = useConfirm();
  const [people, setPeople] = useState<PersonWithDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string }>({});
  const [form, setForm] = useState<Form>(EMPTY);

  const [confirmDelete, setConfirmDelete] = useState<PersonWithDebt | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [peopleData, debtsData] = await Promise.all([getPeople(), getDebts()]);

      const totalsMap = new Map<string, { totalLend: number; totalBorrow: number }>();
      for (const debt of debtsData) {
        const existing = totalsMap.get(debt.person_id ?? '') ?? { totalLend: 0, totalBorrow: 0 };
        const remaining = Number(debt.remaining_amount) || 0;
        if (debt.type === 'lend' && debt.status === 'active') {
          existing.totalLend += remaining;
        } else if (debt.type === 'borrow' && debt.status === 'active') {
          existing.totalBorrow += remaining;
        }
        totalsMap.set(debt.person_id ?? '', existing);
      }

      const withTotals: PersonWithDebt[] = peopleData.map(p => ({
        ...p,
        totalLend: totalsMap.get(p.id)?.totalLend ?? 0,
        totalBorrow: totalsMap.get(p.id)?.totalBorrow ?? 0,
      }));

      setPeople(withTotals);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(EMPTY);
    setFormErrors({});
    setOpenForm(true);
  }

  function openEdit(p: Person) {
    setForm({ id: p.id, name: p.name, phone: p.phone ?? '' });
    setFormErrors({});
    setOpenForm(true);
  }

  async function handleSave() {
    const errors: typeof formErrors = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập tên';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      if (form.id) {
        await updatePerson(form.id, form.name.trim(), form.phone.trim() || undefined);
        toast.push('success', 'Đã cập nhật');
      } else {
        await createPerson(form.name.trim(), form.phone.trim() || undefined);
        toast.push('success', 'Đã tạo người quen');
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const ok = await confirm({
      title: 'Xóa người quen?',
      message: `Xóa "${confirmDelete.name}"? Hành động này không thể hoàn tác.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deletePerson(confirmDelete.id);
      toast.push('success', 'Đã xóa');
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {people.length} người quen
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Người quen
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Quản lý công nợ với bạn bè và người quen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={openCreate}>
            <Plus size={16} strokeWidth={2.25} /> Thêm người quen
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          title="Chưa có người quen nào"
          description="Thêm người quen để quản lý công nợ với người khác."
          icon={<Users size={20} strokeWidth={1.5} />}
          action={
            <button onClick={openCreate} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Thêm người quen
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map(p => (
            <div key={p.id} className="card group p-5 transition hover:shadow-pop">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
                    <Users size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                      {p.name}
                    </div>
                    {p.phone && (
                      <div className="text-xs text-ink-500 dark:text-inkDark-500">{p.phone}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {p.totalLend > 0 && (
                  <div className="flex items-center justify-between rounded-card border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-500/10">
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      Đang cho vay
                    </span>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      {formatVND(p.totalLend)}
                    </span>
                  </div>
                )}
                {p.totalBorrow > 0 && (
                  <div className="flex items-center justify-between rounded-card border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800 dark:bg-orange-500/10">
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
                      Đang vay
                    </span>
                    <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                      {formatVND(p.totalBorrow)}
                    </span>
                  </div>
                )}
                {p.totalLend === 0 && p.totalBorrow === 0 && (
                  <div className="rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-xs text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
                    Không có công nợ
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
                  onClick={() => openEdit(p)}
                >
                  <Pencil size={13} strokeWidth={1.75} /> Sửa
                </button>
                <button
                  className="btn-danger flex-1 inline-flex items-center justify-center gap-1.5"
                  onClick={() => setConfirmDelete(p)}
                >
                  <Trash2 size={13} strokeWidth={1.75} /> Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={form.id ? 'Sửa người quen' : 'Thêm người quen'}
        description="Quản lý thông tin người quen và công nợ."
        size="md"
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
        <div className="space-y-4">
          <FormField label="Tên" required error={formErrors.name}>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="VD: Nguyễn Văn A"
              className="input w-full"
              autoFocus
            />
          </FormField>
          <FormField label="Số điện thoại">
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="VD: 0912 345 678"
              className="input w-full"
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Xóa người quen?"
        primaryLabel="Xóa"
        onPrimary={handleDelete}
        loading={deleting}
        destructive
      >
        <p>
          Bạn có chắc muốn xóa <strong>{confirmDelete?.name}</strong>?
          {(confirmDelete?.totalLend ?? 0) > 0 || (confirmDelete?.totalBorrow ?? 0) > 0 ? (
            <span className="mt-2 block text-sm text-orange-500">
              Người này đang có công nợ. Hãy xóa các khoản nợ trước.
            </span>
          ) : null}
        </p>
      </Modal>
    </div>
  );
}
