import clsx from 'clsx';
import { Icon } from './Icon';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface IconPickerProps {
  /** Lucide icon IDs (must exist in registry). */
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Optional accent color for the selected ring. */
  accent?: string;
  columns?: 4 | 5 | 6 | 7 | 8;
  ariaLabel?: string;
}

export function IconPicker({
  options,
  value,
  onChange,
  accent,
  columns = 6,
  ariaLabel = 'Chọn biểu tượng',
}: IconPickerProps) {
  const colsClass =
    columns === 4
      ? 'grid-cols-4'
      : columns === 5
        ? 'grid-cols-5'
        : columns === 6
          ? 'grid-cols-6'
          : columns === 7
            ? 'grid-cols-7'
            : 'grid-cols-8';

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx('grid gap-1.5', colsClass)}>
      {options.map(opt => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt}
            onClick={() => onChange(opt)}
            className={clsx(
              'group relative grid aspect-square place-items-center rounded-card border bg-surface-raised text-ink-700 transition',
              'hover:border-ink-300 hover:text-ink-900',
              'dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700 dark:hover:text-inkDark-900',
              selected
                ? 'border-transparent ring-2 ring-offset-2 ring-offset-surface dark:ring-offset-surface-dark'
                : 'border-ink-200 dark:border-ink-800',
            )}
            style={
              selected
                ? {
                    color: accent,
                    boxShadow: `0 0 0 2px ${accent}`,
                  }
                : undefined
            }
          >
            <Icon name={opt} size={20} strokeWidth={1.75} />
            {selected && (
              <span
                className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full text-white"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              >
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface ColorSwatchPickerProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export function ColorSwatchPicker({
  options,
  value,
  onChange,
  ariaLabel = 'Chọn màu',
}: ColorSwatchPickerProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map(c => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Chọn màu ${c}`}
            onClick={() => onChange(c)}
            className={clsx(
              'relative h-8 w-8 rounded-card border-2 transition',
              selected
                ? 'border-ink-900 dark:border-inkDark-900 scale-110'
                : 'border-transparent hover:scale-105',
            )}
            style={{ backgroundColor: c }}
          >
            {selected && (
              <Check
                size={14}
                strokeWidth={3}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="h-display text-lg font-semibold text-ink-900 dark:text-inkDark-900">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-ink-500 dark:text-inkDark-500">{description}</p>
      )}
    </div>
  );
}

// Helper type re-export for convenience
export type IconComponent = LucideIcon;
