import type { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Lucide icon component, emoji string, or JSX element */
  icon?: LucideIcon | string | ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  // Check if icon is a function (Lucide component) or string (emoji) or ReactNode
  const isFunction = typeof icon === 'function';
  const isString = typeof icon === 'string';
  const isReactElement = isFunction || (icon !== null && typeof icon === 'object' && 'type' in (icon as object));

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-12 text-center',
        'dark:border-ink-700 dark:bg-surface-dark-sunken',
        className,
      )}
    >
      {isFunction ? (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-raised text-ink-400 ring-1 ring-ink-100 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:ring-ink-700">
          {(() => {
            const IconComponent = icon as LucideIcon;
            return <IconComponent size={20} />;
          })()}
        </div>
      ) : isString ? (
        <div className="text-3xl" aria-hidden="true">
          {icon}
        </div>
      ) : isReactElement ? (
        <div className="text-3xl" aria-hidden="true">
          {icon}
        </div>
      ) : (
        <div className="text-3xl" aria-hidden="true">📭</div>
      )}
      <div className="text-base font-semibold text-ink-900 dark:text-inkDark-900">{title}</div>
      {description && (
        <div className="max-w-sm text-sm text-ink-500 dark:text-inkDark-500">{description}</div>
      )}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-card border border-err-100 bg-err-50 px-4 py-3 text-sm text-err-700 dark:border-err-700/40 dark:bg-err-700/15 dark:text-err-500">
      <div className="font-semibold">Đã xảy ra lỗi</div>
      <div className="mt-0.5 text-err-700/90 dark:text-err-500/90">{message}</div>
      {onRetry && (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-md bg-ink-100 dark:bg-ink-800',
        className,
      )}
    />
  );
}
