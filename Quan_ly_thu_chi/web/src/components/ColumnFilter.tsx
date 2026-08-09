import { useEffect, useRef, useState } from 'react';
import { Filter, X as XIcon } from 'lucide-react';
import clsx from 'clsx';

interface BaseProps {
  label: string;
  activeCount: number;
  onReset: () => void;
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

export type ColumnFilterProps =
  | CheckboxProps
  | SearchProps
  | DatePresetsProps
  | AmountRangeProps;

export function ColumnFilterTrigger(props: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Lọc cột ${props.label}`}
        aria-pressed={props.activeCount > 0}
        onClick={e => {
          e.stopPropagation();
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
      {open && (
        <div
          role="dialog"
          aria-label={`Bộ lọc ${props.label}`}
          onClick={e => e.stopPropagation()}
          className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-ink-200 bg-surface-raised p-3 text-ink-800 shadow-pop dark:border-ink-700 dark:bg-surface-dark-raised dark:text-inkDark-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-600 dark:text-inkDark-500">
              {props.label}
            </span>
            {props.activeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  props.onReset();
                }}
                className="inline-flex items-center gap-1 text-2xs font-medium text-ink-500 hover:text-ink-800 dark:text-inkDark-500 dark:hover:text-inkDark-100"
              >
                <XIcon size={11} /> Xóa
              </button>
            )}
          </div>
          {props.kind === 'checkbox' && <CheckboxList {...props} />}
          {props.kind === 'search' && <SearchList {...props} />}
          {props.kind === 'datePresets' && <DatePresetList {...props} />}
          {props.kind === 'amountRange' && <AmountRangeForm {...props} />}
        </div>
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

function DatePresetList({ value, onChange, presets }: DatePresetsProps) {
  return (
    <ul className="space-y-1">
      {[{ id: 'all', label: 'Tất cả', match: () => true }, ...presets].map(p => {
        const active = p.id === 'all' ? value == null : value === p.id;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onChange(p.id === 'all' ? null : p.id)}
              className={clsx(
                'flex w-full items-center justify-between rounded px-2 py-1.5 text-sm transition',
                active
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-ink-800 hover:bg-ink-50 dark:text-inkDark-700 dark:hover:bg-ink-800',
              )}
            >
              <span>{p.label}</span>
              {active && <span className="text-2xs">●</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AmountRangeForm({ min, max, onChange }: AmountRangeProps) {
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
  }

  return (
    <div className="space-y-2">
      <label className="block text-2xs font-medium text-ink-600 dark:text-inkDark-400">
        Tối thiểu (VND)
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={minText}
          onChange={e => setMinText(e.target.value)}
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
          onBlur={commit}
          className="input mt-1 h-8 text-xs"
          placeholder="Không giới hạn"
        />
      </label>
      <p className="text-2xs text-ink-500 dark:text-inkDark-400">
        Để trống = không giới hạn cạnh đó.
      </p>
    </div>
  );
}
