import { useEffect, useState } from 'react';
import { Plus, RefreshCcw, Tag as TagIcon } from 'lucide-react';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { CategoryIcon } from '../components/CategoryIcon';
import { ColorSwatchPicker, IconPicker } from '../components/IconPicker';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  createCategory,
  listCategories,
  updateCategory,
} from '../lib/api';
import { CATEGORY_KIND_LABEL } from '../lib/labels';
import clsx from 'clsx';
import type { Category } from '../lib/types';

const KINDS: Category['kind'][] = ['income', 'expense', 'both'];

const CATEGORY_ICON_OPTIONS = [
  // expense-ish
  'restaurant',
  'coffee',
  'shopping_bag',
  'shopping_cart',
  'home',
  'receipt_long',
  'wrench',
  'plug',
  'directions_car',
  'directions_bus',
  'flight',
  'local_hospital',
  'medical_services',
  'fitness_center',
  'spa',
  'school',
  'sports_esports',
  'music',
  'tv',
  'laptop',
  'pets',
  'gift',
  'card_giftcard',
  'shield',
  'security',
  'package',
  'phone',
  'wifi',
  'wallet',
  'account_balance_wallet',
  // income-ish
  'payments',
  'account_balance',
  'landmark',
  'trending_up',
  'store',
  'briefcase',
  'coins',
  'dollar',
  'house',
  'volunteer_activism',
  'handheart',
  'hand_heart',
  'replay',
  'more_horiz',
];

const COLOR_OPTIONS = [
  '#b8451f',
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

interface Form {
  id?: string;
  name: string;
  kind: Category['kind'];
  color: string;
  icon: string;
}

const EMPTY: Form = {
  name: '',
  kind: 'expense',
  color: COLOR_OPTIONS[0],
  icon: CATEGORY_ICON_OPTIONS[0],
};

export function CategoriesPage() {
  useDocumentTitle('Danh mục');
  const toast = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setItems(await listCategories());
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
    setNameError(null);
    setOpenForm(true);
  }
  function openEdit(c: Category) {
    setForm({ id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon });
    setNameError(null);
    setOpenForm(true);
  }

  async function save() {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setNameError('Vui lòng nhập tên danh mục.');
      return;
    }
    setSubmitting(true);
    try {
      if (form.id) {
        await updateCategory(form.id, {
          name: trimmedName,
          kind: form.kind,
          color: form.color,
          icon: form.icon,
        });
        toast.push('success', 'Đã cập nhật');
      } else {
        await createCategory({
          name: trimmedName,
          kind: form.kind,
          color: form.color,
          icon: form.icon,
        });
        toast.push('success', 'Đã tạo danh mục');
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const grouped: Record<string, Category[]> = {};
  for (const c of items) {
    grouped[c.kind] = grouped[c.kind] ?? [];
    grouped[c.kind].push(c);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Phân loại thu chi
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Danh mục
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Phân loại thu chi để báo cáo chính xác hơn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách danh mục"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={openCreate}>
            <Plus size={16} strokeWidth={2.25} /> Thêm danh mục
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có danh mục"
          description="Tạo danh mục để phân loại giao dịch."
          icon={<TagIcon size={20} strokeWidth={1.5} />}
          action={
            <button onClick={openCreate} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Tạo danh mục
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {KINDS.map(k => {
            const list = grouped[k] ?? [];
            if (list.length === 0) return null;
            return (
              <div key={k} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5 dark:border-ink-800">
                  <div className="flex items-center gap-2">
                    <span className="h-display text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                      {CATEGORY_KIND_LABEL[k]}
                    </span>
                    <span className="chip bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-inkDark-500">
                      {list.length}
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {list.map(c => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                        onClick={() => openEdit(c)}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <CategoryIcon name={c.icon} color={c.color} size="md" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-ink-900 dark:text-inkDark-900">
                              {c.name}
                            </div>
                            <div className="text-xs text-ink-500 dark:text-inkDark-500">
                              {c.is_system ? 'Mặc định hệ thống' : 'Danh mục của bạn'}
                            </div>
                          </div>
                        </div>
                        {c.is_system && (
                          <span className="chip bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-inkDark-500">
                            mặc định
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={form.id ? 'Sửa danh mục' : 'Thêm danh mục'}
        description={form.id ? 'Cập nhật thông tin danh mục.' : 'Tạo danh mục để gắn nhãn giao dịch.'}
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
        <div className="space-y-5">
          <FormField label="Tên danh mục" required error={nameError}>
            <input
              className="input"
              value={form.name}
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                if (nameError) setNameError(null);
              }}
              autoFocus
            />
          </FormField>

          <FormField label="Loại">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(k => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === k}
                  onClick={() => setForm({ ...form, kind: k })}
                  className={clsx(
                    'rounded-card border px-3 py-2 text-sm font-medium transition',
                    form.kind === k
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700',
                  )}
                >
                  {CATEGORY_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Màu sắc">
              <ColorSwatchPicker
                options={COLOR_OPTIONS}
                value={form.color}
                onChange={c => setForm({ ...form, color: c })}
                ariaLabel="Chọn màu danh mục"
              />
            </FormField>
            <FormField label="Biểu tượng">
              <IconPicker
                options={CATEGORY_ICON_OPTIONS}
                value={form.icon}
                accent={form.color}
                columns={8}
                onChange={ic => setForm({ ...form, icon: ic })}
                ariaLabel="Chọn biểu tượng danh mục"
              />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
