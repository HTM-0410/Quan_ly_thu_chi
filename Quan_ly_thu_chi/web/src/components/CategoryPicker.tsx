import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X as XIcon, Folder, FolderOpen, Check } from 'lucide-react';
import clsx from 'clsx';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '../lib/types';

interface Props {
  /** Danh sách categories (đã trộn user + global) */
  categories: Category[];
  /** kind lọc (income / expense). 'both' = tất cả */
  kind: 'income' | 'expense';
  /** id hiện đang chọn (Category.id) */
  value: string;
  /** Gọi khi user chọn 1 category (CHA hoặc CON) */
  onChange: (id: string) => void;
  /** Label hiển thị trên trigger */
  label?: string;
  /** Nhãn placeholder khi chưa chọn */
  placeholder?: string;
  /** Bỏ chọn → set id rỗng */
  clearable?: boolean;
  /** Compact styling for tables/cards */
  compact?: boolean;
}

interface TreeNode {
  cat: Category;
  children: TreeNode[];
}

/**
 * Category picker dạng popup cây CHA → CON.
 *
 * UX:
 * - Click trigger mở popup cây CHA.
 * - CHA không có CON → click chọn luôn (CHA là leaf trong cây chọn).
 * - CHA có CON → click toggle expand; trong panel CON click chọn.
 * - Có search filter để tìm nhanh CHA/CON.
 * - Item đang chọn hiện check + highlight.
 *
 * Tách CHA/CON bằng parent_id. Chỉ hiển thị CHA có kind khớp (hoặc 'both');
 * CON chỉ hiện khi CHA parent match kind.
 */
export function CategoryPicker({
  categories,
  kind,
  value,
  onChange,
  label = 'Danh mục',
  placeholder = 'Chọn danh mục…',
  clearable = true,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  // Tính vị trí popup: neo theo trigger, tự động flip lên trên (dropup) khi ở gần cuối trang
  // và clamp trong viewport.
  const updatePos = useCallback(() => {
    const t = triggerRef.current;
    if (!t || !t.isConnected) return;
    const rect = t.getBoundingClientRect();

    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 1024;

    // Trigger scrolled out of viewport (only when layout exists)
    if (rect.height > 0 && (rect.bottom < 0 || rect.top > vh)) {
      setOpen(false);
      return;
    }

    const GAP = 6;
    const MARGIN = 8;
    const ESTIMATED_LIST_MAX = 320;
    const HEADER_FOOTER_ESTIMATE = 88;

    const spaceBelow = vh - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;

    // Flip to top (dropup) if space below is too tight and space above has more room
    const isDropup = spaceBelow < 280 && spaceAbove > spaceBelow;
    const placement = isDropup ? 'top' : 'bottom';

    const availableSpace = placement === 'top' ? spaceAbove - GAP : spaceBelow - GAP;
    const maxListHeight = Math.max(120, Math.min(ESTIMATED_LIST_MAX, availableSpace - HEADER_FOOTER_ESTIMATE));

    const POPUP_MIN = 280;
    const POPUP_MAX = 448;
    const maxAllowedWidth = Math.max(200, vw - MARGIN * 2);
    const effectiveTriggerWidth = rect.width > 0 ? rect.width : POPUP_MIN;
    const width = Math.min(POPUP_MAX, Math.max(Math.min(POPUP_MIN, maxAllowedWidth), effectiveTriggerWidth));

    let left = rect.left;
    if (left + width > vw - MARGIN) {
      left = vw - width - MARGIN;
    }
    if (left < MARGIN) {
      left = MARGIN;
    }

    if (placement === 'top') {
      setPopupPos({
        left,
        bottom: vh - rect.top + GAP,
        width,
        maxHeight: maxListHeight,
        placement: 'top',
      });
    } else {
      setPopupPos({
        left,
        top: rect.bottom + GAP,
        width,
        maxHeight: maxListHeight,
        placement: 'bottom',
      });
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setPopupPos(null);
      return;
    }

    updatePos();

    function onScrollOrResize() {
      updatePos();
    }

    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updatePos]);

  // Đóng popup khi click ngoài / ESC
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Focus search khi mở
  useEffect(() => {
    if (open) {
      // microtask để chắc input đã mount
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  // Build cây CHA → CON (đã lọc theo kind)
  const tree = useMemo<TreeNode[]>(() => {
    const matchKind = (c: Category) => c.kind === kind || c.kind === 'both';
    const parents = categories.filter(c => !c.parent_id && matchKind(c));
    // children lấy theo parent_id match CHA trong tập cha
    const parentIds = new Set(parents.map(p => p.id));
    const children = categories.filter(
      c => c.parent_id && parentIds.has(c.parent_id) && matchKind(c),
    );
    // group children
    const byParent = new Map<string, Category[]>();
    children.forEach(c => {
      if (!c.parent_id) return;
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    });
    byParent.forEach(arr => arr.sort((a, b) => a.sort_order - b.sort_order));
    return parents
      .sort((a, b) => {
        // CHA 'both' trước rồi CHA đúng kind; trong cùng kind sort theo sort_order
        const ak = a.kind === kind ? 0 : 1;
        const bk = b.kind === kind ? 0 : 1;
        if (ak !== bk) return ak - bk;
        return a.sort_order - b.sort_order;
      })
      .map(p => ({
        cat: p,
        children: (byParent.get(p.id) ?? []).map(c => ({ cat: c, children: [] })),
      }));
  }, [categories, kind]);

  // Auto-expand CHA đang được chọn (để user thấy CON nào đang chọn)
  useEffect(() => {
    if (!open || !value) return;
    const selected = categories.find(c => c.id === value);
    if (!selected) return;
    if (selected.parent_id) {
      setExpanded(prev => new Set(prev).add(selected.parent_id!));
    } else {
      setExpanded(prev => new Set(prev).add(selected.id));
    }
  }, [open, value, categories]);

  // Lọc theo query
  const filteredTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map(node => {
        const parentMatch = node.cat.name.toLowerCase().includes(q);
        const childMatches = node.children.filter(c =>
          c.cat.name.toLowerCase().includes(q),
        );
        if (parentMatch) return node;
        if (childMatches.length > 0) {
          return { cat: node.cat, children: childMatches };
        }
        return null;
      })
      .filter((n): n is TreeNode => n !== null);
  }, [tree, query]);

  const selectedCat = categories.find(c => c.id === value) ?? null;
  const triggerText = selectedCat ? selectedCat.name : placeholder;
  const triggerSubtext =
    selectedCat && selectedCat.parent_id
      ? categories.find(c => c.id === selectedCat.parent_id)?.name
      : null;

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  return (
    <div ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex w-full items-center justify-between gap-2 rounded-input border bg-surface-raised text-left transition',
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm',
          'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:bg-surface-dark-raised dark:hover:border-ink-600',
          open && 'ring-2 ring-brand-300 border-brand-400 dark:ring-brand-500/40',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedCat ? (
            <CategoryIcon name={selectedCat.icon} color={selectedCat.color} size="xs" />
          ) : (
            <Folder size={compact ? 12 : 14} className="text-ink-400 dark:text-inkDark-400 shrink-0" />
          )}
          <span className="min-w-0 truncate">
            {triggerSubtext && (
              <span className="text-ink-500 dark:text-inkDark-400">{triggerSubtext} › </span>
            )}
            <span
              className={clsx(
                'font-medium',
                selectedCat
                  ? 'text-ink-900 dark:text-inkDark-900'
                  : 'text-ink-400 dark:text-inkDark-400',
              )}
            >
              {triggerText}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selectedCat && clearable && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Bỏ chọn danh mục"
              onClick={clearValue}
              className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:text-inkDark-400 dark:hover:bg-ink-800 dark:hover:text-inkDark-100"
            >
              <XIcon size={compact ? 10 : 12} />
            </span>
          )}
          <ChevronDown
            size={compact ? 12 : 14}
            className={clsx(
              'text-ink-400 transition-transform dark:text-inkDark-400',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>

      {open && popupPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popupRef}
              role="dialog"
              aria-label={label}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: popupPos.left,
                ...(popupPos.placement === 'top'
                  ? { bottom: popupPos.bottom }
                  : { top: popupPos.top }),
                width: popupPos.width,
              }}
              className={clsx(
                'z-[70]',
                'rounded-card border border-ink-200 bg-surface-raised shadow-2xl backdrop-blur-none',
                'dark:border-ink-700 dark:bg-surface-dark-raised',
              )}
            >
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2 dark:border-ink-700">
            <Search size={14} className="text-ink-400 dark:text-inkDark-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm danh mục…"
              className="flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-inkDark-900 dark:placeholder:text-inkDark-400"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-ink-500 hover:bg-ink-100 dark:text-inkDark-400 dark:hover:bg-ink-800"
              aria-label="Đóng"
            >
              <XIcon size={14} />
            </button>
          </div>

          <div style={{ maxHeight: popupPos.maxHeight }} className="overflow-y-auto p-1.5">
            {filteredTree.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-500 dark:text-inkDark-400">
                Không có danh mục khớp.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredTree.map(node => {
                  const isParent = node.children.length > 0;
                  const isExpanded = expanded.has(node.cat.id) || query.trim().length > 0;
                  const isParentSelected =
                    !selectedCat?.parent_id && selectedCat?.id === node.cat.id;
                  return (
                    <li key={node.cat.id}>
                      <div
                        className={clsx(
                          'group flex items-center gap-1.5 rounded px-2 py-1.5 text-sm',
                          'hover:bg-ink-50 dark:hover:bg-ink-800',
                          isParentSelected && 'bg-brand-50 dark:bg-brand-500/15',
                        )}
                      >
                        {isParent ? (
                          <button
                            type="button"
                            aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                            onClick={() => toggleExpand(node.cat.id)}
                            className="rounded p-0.5 text-ink-500 hover:bg-ink-200 dark:text-inkDark-400 dark:hover:bg-ink-700"
                          >
                            <ChevronDown
                              size={14}
                              className={clsx(
                                'transition-transform',
                                !isExpanded && '-rotate-90',
                              )}
                            />
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        <button
                          type="button"
                          onClick={() => handleSelect(node.cat.id)}
                          className="flex flex-1 min-w-0 items-center gap-2 text-left"
                        >
                          <CategoryIcon
                            name={node.cat.icon}
                            color={node.cat.color}
                            size="xs"
                          />
                          <span
                            className={clsx(
                              'flex-1 truncate font-medium',
                              isParentSelected
                                ? 'text-brand-700 dark:text-brand-300'
                                : 'text-ink-800 dark:text-inkDark-900',
                            )}
                          >
                            {node.cat.name}
                          </span>
                          {isParent && (
                            <span className="text-2xs text-ink-400 dark:text-inkDark-400">
                              {node.children.length}
                            </span>
                          )}
                          {isParentSelected && (
                            <Check
                              size={14}
                              className="text-brand-600 dark:text-brand-300"
                            />
                          )}
                        </button>
                      </div>
                      {isParent && isExpanded && (
                        <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-ink-200 pl-2 dark:border-ink-700">
                          {node.children.map(child => {
                            const isChildSelected = selectedCat?.id === child.cat.id;
                            return (
                              <li key={child.cat.id}>
                                <button
                                  type="button"
                                  onClick={() => handleSelect(child.cat.id)}
                                  className={clsx(
                                    'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                                    'hover:bg-ink-50 dark:hover:bg-ink-800',
                                    isChildSelected &&
                                      'bg-brand-50 dark:bg-brand-500/15',
                                  )}
                                >
                                  <CategoryIcon
                                    name={child.cat.icon}
                                    color={child.cat.color}
                                    size="xs"
                                  />
                                  <span
                                    className={clsx(
                                      'flex-1 truncate',
                                      isChildSelected
                                        ? 'font-medium text-brand-700 dark:text-brand-300'
                                        : 'text-ink-700 dark:text-inkDark-700',
                                    )}
                                  >
                                    {child.cat.name}
                                  </span>
                                  {isChildSelected && (
                                    <Check
                                      size={14}
                                      className="text-brand-600 dark:text-brand-300"
                                    />
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-2xs text-ink-500 dark:border-ink-700 dark:text-inkDark-400">
            <span>{filteredTree.length} danh mục cha</span>
            {selectedCat && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                Xong
              </button>
            )}
          </div>
        </div>,
        document.body,
      )
    : null}
    </div>
  );
}
