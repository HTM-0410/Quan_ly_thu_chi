import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  RefreshCcw,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
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
  deleteCategory,
  listCategories,
  updateCategory,
} from '../lib/api';
import { CATEGORY_KIND_LABEL } from '../lib/labels';
import clsx from 'clsx';
import type { Category } from '../lib/types';

const KINDS: Category['kind'][] = ['income', 'expense', 'both'];

const CATEGORY_ICON_OPTIONS = [
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

/** Form dùng cho cả create + edit + add sub. */
interface Form {
  id?: string;
  name: string;
  kind: Category['kind'];
  color: string;
  icon: string;
  /** Cha trực tiếp (chỉ set khi tạo CON). */
  parentId?: string | null;
  /** kind kế thừa từ CHA (readonly khi tạo CON). */
  inheritedKind?: Category['kind'];
}

const EMPTY: Form = {
  name: '',
  kind: 'expense',
  color: COLOR_OPTIONS[0],
  icon: CATEGORY_ICON_OPTIONS[0],
  parentId: null,
};

/**
 * Build cây 2 cấp: CHA (parent_id = null) + CON (parent_id = cha.id).
 * - Gom cả user + global; global hiển thị read-only.
 * - Match CHA với CON theo cùng scope để tránh mix.
 */
interface CategoryNode {
  parent: Category;
  children: Category[];
}

function buildTree(items: Category[]): CategoryNode[] {
  const parents = items.filter(c => !c.parent_id);
  const childrenByParent = new Map<string, Category[]>();
  for (const c of items) {
    if (c.parent_id) {
      // Chỉ match CON với CHA cùng scope
      const parentInSameScope = parents.find(p => p.id === c.parent_id && p.scope === c.scope);
      if (!parentInSameScope) continue;
      const arr = childrenByParent.get(c.parent_id) ?? [];
      arr.push(c);
      childrenByParent.set(c.parent_id, arr);
    }
  }
  // Sort: parent theo kind trước, rồi sort_order
  parents.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'global' ? -1 : 1; // global trước
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.sort_order - b.sort_order;
  });
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  return parents.map(p => ({ parent: p, children: childrenByParent.get(p.id) ?? [] }));
}

export function CategoriesPage() {
  useDocumentTitle('Danh mục');
  const toast = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [filterKind, setFilterKind] = useState<Category['kind'] | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listCategories();
      setItems(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Sau khi items thay đổi, tự động mở rộng tất cả CHA có CON
  useEffect(() => {
    const ids = new Set<string>();
    for (const c of items) {
      if (c.parent_id && c.scope === 'user') ids.add(c.parent_id);
    }
    setExpanded(ids);
  }, [items]);

  const tree = useMemo(() => buildTree(items), [items]);

  const filteredTree = useMemo(() => {
    if (filterKind === 'all') return tree;
    return tree.filter(node => node.parent.kind === filterKind);
  }, [tree, filterKind]);

  function openCreateRoot() {
    setForm({ ...EMPTY, kind: filterKind === 'all' ? 'expense' : filterKind });
    setNameError(null);
    setOpenForm(true);
  }

  function openEdit(c: Category) {
    setForm({
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      icon: c.icon,
      parentId: c.parent_id,
    });
    setNameError(null);
    setOpenForm(true);
  }

  function openAddSub(parent: Category) {
    setForm({
      name: '',
      kind: parent.kind,
      color: parent.color,
      icon: parent.icon,
      parentId: parent.id,
      inheritedKind: parent.kind,
    });
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
          parent_id: form.parentId ?? null,
        });
        toast.push('success', form.parentId ? 'Đã thêm danh mục con' : 'Đã tạo danh mục');
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(c: Category) {
    if (!window.confirm(`Xoá danh mục "${c.name}"?`)) return;
    setDeletingId(c.id);
    try {
      await deleteCategory(c.id);
      toast.push('success', 'Đã xoá');
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Gom nhóm theo kind để giữ UI section header
  const groupedByKind = useMemo(() => {
    const map = new Map<Category['kind'], typeof filteredTree>();
    for (const node of filteredTree) {
      const arr = map.get(node.parent.kind) ?? [];
      arr.push(node);
      map.set(node.parent.kind, arr);
    }
    return map;
  }, [filteredTree]);

  const formTitle = form.id
    ? 'Sửa danh mục'
    : form.parentId
      ? 'Thêm danh mục con'
      : 'Thêm danh mục';
  const formDesc = form.id
    ? 'Cập nhật thông tin danh mục.'
    : form.parentId
      ? 'Danh mục con sẽ kế thừa loại từ danh mục cha.'
      : 'Tạo danh mục để gắn nhãn giao dịch. Sau khi tạo CHA, bạn có thể thêm CON.';

  return (
    <div className="space-y-8 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Phân loại thu chi
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Danh mục
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Phân loại thu chi để báo cáo chính xác hơn. CHA nhóm, CON chi tiết.
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
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={openCreateRoot}>
            <Plus size={16} strokeWidth={2.25} /> Thêm danh mục
          </button>
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500 dark:text-inkDark-500">
          Lọc
        </span>
        <button
          type="button"
          onClick={() => setFilterKind('all')}
          className={clsx(
            'rounded-full px-3 py-1 text-xs font-medium transition',
            filterKind === 'all'
              ? 'bg-ink-900 text-white dark:bg-inkDark-900'
              : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-inkDark-500 dark:hover:bg-ink-700',
          )}
        >
          Tất cả
        </button>
        {KINDS.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setFilterKind(k)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              filterKind === k
                ? 'bg-ink-900 text-white dark:bg-inkDark-900'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-inkDark-500 dark:hover:bg-ink-700',
            )}
          >
            {CATEGORY_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {err && <ErrorState message={err} onRetry={load} />}

      {loading ? (
        <Skeleton className="h-40" />
      ) : filteredTree.length === 0 ? (
        <EmptyState
          title="Chưa có danh mục"
          description="Tạo danh mục để phân loại giao dịch."
          icon={<TagIcon size={20} strokeWidth={1.5} />}
          action={
            <button onClick={openCreateRoot} className="btn-primary inline-flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.25} /> Tạo danh mục
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {Array.from(groupedByKind.entries()).map(([kind, nodes]) => (
            <div key={kind} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5 dark:border-ink-800">
                <div className="flex items-center gap-2">
                  <span className="h-display text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                    {CATEGORY_KIND_LABEL[kind]}
                  </span>
                  <span className="chip bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-inkDark-500">
                    {nodes.length} cha
                  </span>
                </div>
              </div>
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {nodes.map(({ parent, children }) => {
                  const isOpen = expanded.has(parent.id);
                  return (
                    <li key={parent.id} className="px-5 py-2">
                      {/* CHA row */}
                      <div className="flex items-center justify-between gap-3 py-2.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                          onClick={() => parent.scope === 'user' && openEdit(parent)}
                          disabled={parent.scope === 'global'}
                        >
                          <CategoryIcon name={parent.icon} color={parent.color} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Folder size={14} strokeWidth={1.75} className="text-ink-400 dark:text-inkDark-400" />
                              <span className="truncate text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                                {parent.name}
                              </span>
                              <span className="text-xs text-ink-500 dark:text-inkDark-500">
                                ({children.length} con)
                              </span>
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          {parent.scope === 'user' && (
                            <>
                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
                                onClick={() => openAddSub(parent)}
                                aria-label={`Thêm con cho ${parent.name}`}
                                title="Thêm danh mục con"
                              >
                                <FolderPlus size={16} strokeWidth={1.75} />
                              </button>
                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
                                onClick={() => openEdit(parent)}
                                aria-label={`Sửa ${parent.name}`}
                                title="Sửa"
                              >
                                <Pencil size={14} strokeWidth={1.75} />
                              </button>
                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 hover:bg-err-50 hover:text-err-600 dark:text-inkDark-500 dark:hover:bg-err-700/15 dark:hover:text-err-500"
                                onClick={() => confirmDelete(parent)}
                                disabled={deletingId === parent.id}
                                aria-label={`Xoá ${parent.name}`}
                                title="Xoá"
                              >
                                {deletingId === parent.id ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <Trash2 size={14} strokeWidth={1.75} />
                                )}
                              </button>
                            </>
                          )}
                          {parent.scope === 'global' && (
                            <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                              Hệ thống
                            </span>
                          )}
                          {children.length > 0 && (
                            <button
                              type="button"
                              className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 dark:text-inkDark-500 dark:hover:bg-ink-800"
                              onClick={() => toggleExpand(parent.id)}
                              aria-label={isOpen ? `Thu gọn ${parent.name}` : `Mở rộng ${parent.name}`}
                              aria-expanded={isOpen}
                              title={isOpen ? 'Thu gọn' : 'Mở rộng'}
                            >
                              <ChevronRight
                                size={16}
                                strokeWidth={2}
                                className={clsx('transition', isOpen && 'rotate-90')}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* CON rows */}
                      {isOpen && children.length > 0 && (
                        <ul className="mb-2 ml-6 border-l-2 border-ink-100 pl-3 dark:border-ink-800">
                          {children.map(child => (
                            <li
                              key={child.id}
                              className="flex items-center justify-between gap-3 py-2"
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-btn px-2 py-1 hover:bg-ink-50 dark:hover:bg-ink-800/50 disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
                                onClick={() => child.scope === 'user' && openEdit(child)}
                                disabled={child.scope === 'global'}
                              >
                                <CategoryIcon name={child.icon} color={child.color} size="sm" />
                                <span className="truncate text-sm text-ink-700 dark:text-inkDark-500">
                                  {child.name}
                                </span>
                              </button>
                              <div className="flex items-center gap-1">
                                {child.scope === 'user' ? (
                                  <>
                                    <button
                                      type="button"
                                      className="grid h-7 w-7 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
                                      onClick={() => openEdit(child)}
                                      aria-label={`Sửa ${child.name}`}
                                      title="Sửa"
                                    >
                                      <Pencil size={12} strokeWidth={1.75} />
                                    </button>
                                    <button
                                      type="button"
                                      className="grid h-7 w-7 place-items-center rounded-btn text-ink-500 hover:bg-err-50 hover:text-err-600 dark:text-inkDark-500 dark:hover:bg-err-700/15 dark:hover:text-err-500"
                                      onClick={() => confirmDelete(child)}
                                      disabled={deletingId === child.id}
                                      aria-label={`Xoá ${child.name}`}
                                      title="Xoá"
                                    >
                                      {deletingId === child.id ? (
                                        <Spinner size="sm" />
                                      ) : (
                                        <Trash2 size={12} strokeWidth={1.75} />
                                      )}
                                    </button>
                                  </>
                                ) : (
                                  <span className="chip bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-inkDark-500">
                                    Hệ thống
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                          {parent.scope === 'user' && (
                            <li className="pb-1 pt-2">
                              <button
                                type="button"
                                onClick={() => openAddSub(parent)}
                                className="inline-flex items-center gap-1.5 rounded-btn px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                              >
                                <Plus size={12} strokeWidth={2.25} /> Thêm con
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={openForm}
        onClose={() => (submitting ? null : setOpenForm(false))}
        title={formTitle}
        description={formDesc}
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
              placeholder={form.parentId ? 'VD: Ăn sáng, Cà phê, Xăng xe…' : 'VD: Ăn uống, Đi lại…'}
            />
          </FormField>

          {/* Loại (chỉ enabled khi tạo CHA hoặc edit) */}
          <FormField label="Loại">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(k => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === k}
                  onClick={() => setForm({ ...form, kind: k })}
                  disabled={!!form.parentId && !form.id}
                  className={clsx(
                    'rounded-card border px-3 py-2 text-sm font-medium transition',
                    form.kind === k
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700',
                    form.parentId && !form.id && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {CATEGORY_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {form.parentId && !form.id && (
              <p className="mt-1.5 text-2xs text-ink-500 dark:text-inkDark-500">
                Loại sẽ kế thừa từ CHA: {CATEGORY_KIND_LABEL[form.inheritedKind ?? form.kind]}
              </p>
            )}
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
