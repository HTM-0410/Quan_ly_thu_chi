import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Filter, X as XIcon } from 'lucide-react';
import clsx from 'clsx';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface BaseProps {
  label: string;
  activeCount: number;
  onReset: () => void;
  variant?: 'icon' | 'chip';
  chipLabel?: string;
  icon?: React.ReactNode;
  align?: 'left' | 'right';
}

interface CheckboxProps extends BaseProps {
  kind: 'checkbox';
  options: { id: string; label: string; icon?: React.ReactNode; count?: number }[];
  selected: string[];
  onToggle: (id: string) => void;
}

interface SearchProps extends BaseProps {
  kind: 'search';
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}

interface DatePresetsProps extends BaseProps {
  kind: 'datePresets';
  value: string | null;
  onChange: (value: string | null) => void;
  presets: { id: string; label: string; match: (iso: string) => boolean }[];
}

interface AmountRangeProps extends BaseProps {
  kind: 'amountRange';
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

interface SelectProps extends BaseProps {
  kind: 'select';
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string; icon?: React.ReactNode }[];
}

export type ColumnFilterProps =
  | CheckboxProps
  | SearchProps
  | DatePresetsProps
  | AmountRangeProps
  | SelectProps;

interface PopoverPos {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

export function ColumnFilterTrigger(props: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const updatePos = useCallback(() => {
    if (!ref.current || !ref.current.isConnected) return;
    const rect = ref.current.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 375;

    if (rect.height > 0 && (rect.bottom < 0 || rect.top > vh)) {
      setOpen(false);
      return;
    }

    const GAP = 6;
    const MARGIN = 10;
    const POPUP_WIDTH = Math.min(290, Math.max(240, vw - MARGIN * 2));

    const spaceBelow = vh - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const isDropup = spaceBelow < 220 && spaceAbove > spaceBelow;
    const placement = isDropup ? 'top' : 'bottom';
    const availableSpace = placement === 'top' ? spaceAbove - GAP : spaceBelow - GAP;
    const maxHeight = Math.max(160, Math.min(360, availableSpace));

    let left = rect.left;
    if (props.align === 'right' || left + POPUP_WIDTH > vw - MARGIN) {
      left = Math.max(MARGIN, rect.right - POPUP_WIDTH);
    }
    if (left + POPUP_WIDTH > vw - MARGIN) {
      left = vw - POPUP_WIDTH - MARGIN;
    }
    if (left < MARGIN) {
      left = MARGIN;
    }

    if (placement === 'top') {
      setPos({
        left,
        bottom: vh - rect.top + GAP,
        width: POPUP_WIDTH,
        maxHeight,
        placement: 'top',
      });
    } else {
      setPos({
        left,
        top: rect.bottom + GAP,
        width: POPUP_WIDTH,
        maxHeight,
        placement: 'bottom',
      });
    }
  }, [props.align]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;

    function onDocClick(e: Event) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScrollOrResize() {
      updatePos();
    }

    document.addEventListener('pointerdown', onDocClick);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onDocClick);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updatePos]);

  const isChip = props.variant === 'chip';

  return (
    <div ref={ref} className="relative inline-block">
      {isChip ? (
        <button
          type="button"
          aria-label={`Lọc ${props.label}`}
          aria-pressed={props.activeCount > 0}
          onClick={e => {
            e.stopPropagation();
            if (!open) {
              updatePos();
            }
            setOpen(o => !o);
          }}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap shrink-0 shadow-2xs select-none',
            props.activeCount > 0
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/15 dark:text-brand-300 font-semibold'
              : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-surface-dark-raised dark:text-inkDark-200 dark:hover:border-ink-600 dark:hover:bg-ink-800',
          )}
        >
          {props.icon && <span className="shrink-0 text-ink-400 dark:text-inkDark-400">{props.icon}</span>}
          <span>{props.chipLabel ?? props.label}</span>
          {props.activeCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white dark:bg-brand-500 dark:text-ink-950">
              {props.activeCount}
            </span>
          )}
          <ChevronDown
            size={12}
            className={clsx(
              'transition-transform duration-200 text-ink-400 dark:text-inkDark-400',
              open && 'rotate-180',
            )}
          />
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Lọc cột ${props.label}`}
          aria-pressed={props.activeCount > 0}
          onClick={e => {
            e.stopPropagation();
            if (!open) {
              updatePos();
            }
            setOpen(o => !o);
          }}
          className={clsx(
            'inline-flex h-6 w-6 items-center justify-center rounded transition',
            props.activeCount > 0
              ? 'bg-brand-100 text-brand-700 hover:bg-brand-200 dark:bg-brand-500/20 dark:text-brand-300 dark:hover:bg-brand-500/30'
              : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:text-inkDark-400 dark:hover:bg-ink-800 dark:hover:text-inkDark-100',
          )}
        >
          <Filter size={12} strokeWidth={1.75} />
        </button>
      )}

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Bộ lọc ${props.label}`}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: pos.left,
            ...(pos.placement === 'top' ? { bottom: pos.bottom } : { top: pos.top }),
            width: pos.width,
            maxHeight: pos.maxHeight,
          }}
          className={clsx(
            'z-[90] flex flex-col rounded-card border border-ink-200 bg-surface-raised p-3 text-ink-800 shadow-2xl dark:border-ink-700 dark:bg-surface-dark-raised dark:text-inkDark-900',
            pos.placement === 'top' ? 'animate-popover-up' : 'animate-popover-down',
          )}
        >
          <div className="mb-2.5 flex shrink-0 items-center justify-between pb-2 border-b border-ink-100 dark:border-ink-800">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-600 dark:text-inkDark-400">
              {props.label}
            </span>
            {props.activeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  props.onReset();
                }}
                className="inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                <XIcon size={11} /> Đặt lại
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pr-0.5">
            {props.kind === 'checkbox' && <CheckboxList {...props} />}
            {props.kind === 'search' && <SearchList {...props} />}
            {props.kind === 'datePresets' && <DatePresetList {...props} onSelect={() => setOpen(false)} />}
            {props.kind === 'amountRange' && <AmountRangeForm {...props} onApplied={() => setOpen(false)} />}
            {props.kind === 'select' && <SingleSelectList {...props} onSelect={() => setOpen(false)} />}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function CheckboxList({ options, selected, onToggle }: CheckboxProps) {
  if (options.length === 0) {
    return (
      <p className="py-3 text-center text-xs text-ink-500 dark:text-inkDark-400">Không có giá trị.</p>
    );
  }
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
      {options.map(opt => {
        const checked = selected.includes(opt.id);
        return (
          <li key={opt.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
              <input
                type="checkbox"
                className="checkbox"
                checked={checked}
                onChange={() => onToggle(opt.id)}
              />
              {opt.icon}
              <span className="flex-1 truncate text-ink-800 dark:text-inkDark-700">{opt.label}</span>
              {typeof opt.count === 'number' && (
                <span className="text-2xs text-ink-500 dark:text-inkDark-400">{opt.count}</span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function SearchList({ options, selected, onToggle, placeholder }: SearchProps) {
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;
  return (
    <div>
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder ?? 'Tìm...'}
        className="input mb-2 h-8 text-xs"
      />
      {filtered.length === 0 ? (
        <p className="py-3 text-center text-xs text-ink-500 dark:text-inkDark-400">Không có kết quả.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {filtered.map(opt => {
            const checked = selected.includes(opt.id);
            return (
              <li key={opt.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt.id)}
                  />
                  <span className="flex-1 truncate text-ink-800 dark:text-inkDark-700">{opt.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DatePresetList({
  value,
  onChange,
  presets,
  onSelect,
}: DatePresetsProps & { onSelect?: () => void }) {
  return (
    <ul className="space-y-1">
      {[{ id: 'all', label: 'Tất cả thời gian', match: () => true }, ...presets].map(p => {
        const active = p.id === 'all' ? value == null : value === p.id;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                onChange(p.id === 'all' ? null : p.id);
                onSelect?.();
              }}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition',
                active
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-ink-800 hover:bg-ink-50 dark:text-inkDark-700 dark:hover:bg-ink-800',
              )}
            >
              <span>{p.label}</span>
              {active && <Check size={14} className="text-brand-600 dark:text-brand-400" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SingleSelectList({
  options,
  value,
  onChange,
  onSelect,
}: SelectProps & { onSelect?: () => void }) {
  return (
    <ul className="space-y-1">
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <li key={opt.id}>
            <button
              type="button"
              onClick={() => {
                onChange(opt.id);
                onSelect?.();
              }}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition',
                active
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-ink-800 hover:bg-ink-50 dark:text-inkDark-700 dark:hover:bg-ink-800',
              )}
            >
              <span className="flex items-center gap-2">
                {opt.icon}
                {opt.label}
              </span>
              {active && <Check size={14} className="text-brand-600 dark:text-brand-400" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AmountRangeForm({
  min,
  max,
  onChange,
  onApplied,
}: AmountRangeProps & { onApplied?: () => void }) {
  const [minText, setMinText] = useState(min == null ? '' : String(min));
  const [maxText, setMaxText] = useState(max == null ? '' : String(max));
  useEffect(() => {
    setMinText(min == null ? '' : String(min));
  }, [min]);
  useEffect(() => {
    setMaxText(max == null ? '' : String(max));
  }, [max]);

  function commit() {
    const parsedMin = minText.trim() === '' ? null : Number(minText);
    const parsedMax = maxText.trim() === '' ? null : Number(maxText);
    onChange(
      parsedMin != null && Number.isFinite(parsedMin) ? parsedMin : null,
      parsedMax != null && Number.isFinite(parsedMax) ? parsedMax : null,
    );
    onApplied?.();
  }

  return (
    <div className="space-y-2.5">
      <label className="block text-2xs font-medium text-ink-600 dark:text-inkDark-400">
        Tối thiểu (VND)
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={minText}
          onChange={e => setMinText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit()}
          onBlur={commit}
          className="input mt-1 h-8 text-xs"
          placeholder="0"
        />
      </label>
      <label className="block text-2xs font-medium text-ink-600 dark:text-inkDark-400">
        Tối đa (VND)
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={maxText}
          onChange={e => setMaxText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit()}
          onBlur={commit}
          className="input mt-1 h-8 text-xs"
          placeholder="Không giới hạn"
        />
      </label>
      <p className="text-2xs text-ink-400 dark:text-inkDark-500">
        Để trống nếu không giới hạn.
      </p>
      <button
        type="button"
        onClick={commit}
        className="btn-primary w-full py-1 text-xs font-medium"
      >
        Áp dụng
      </button>
    </div>
  );
}
