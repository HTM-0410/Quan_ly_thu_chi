import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Convenience prop: renders a primary button in the footer */
  primaryLabel?: string;
  onPrimary?: () => void;
  loading?: boolean;
  destructive?: boolean;
  /** Secondary/destructive button in the footer */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDestructive?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Có thay đổi chưa lưu -> xác nhận trước khi đóng qua backdrop/Escape */
  isDirty?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  primaryLabel,
  onPrimary,
  loading = false,
  destructive = false,
  secondaryLabel,
  onSecondary,
  secondaryDestructive = false,
  size = 'md',
  isDirty = false,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  function handleAttemptClose() {
    if (loadingRef.current) return;
    if (isDirtyRef.current) {
      const ok = window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy bỏ không?');
      if (!ok) return;
    }
    onCloseRef.current();
  }

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (loadingRef.current) return;
        handleAttemptClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);

    queueMicrotask(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([aria-label="Đóng"])',
      );
      first?.focus();
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previousActiveRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  const width =
    size === 'sm'
      ? 'max-w-sm'
      : size === 'lg'
        ? 'max-w-2xl'
        : size === 'xl'
          ? 'max-w-5xl'
          : 'max-w-md';

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3.5 sm:p-4 bg-ink-900/50 backdrop-blur-sm dark:bg-black/70 animate-in fade-in-0 duration-200"
      onClick={handleAttemptClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={clsx(
          'flex w-full max-h-[88vh] sm:max-h-[90vh] flex-col overflow-hidden rounded-card border border-ink-200 bg-surface-raised shadow-pop',
          'dark:border-ink-800 dark:bg-surface-dark-raised animate-in zoom-in-95 duration-200',
          width,
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div className="min-w-0">
            <h3 id={titleId} className="h-display text-lg font-semibold text-ink-900 dark:text-inkDark-900">
              {title}
            </h3>
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-ink-500 dark:text-inkDark-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
            onClick={handleAttemptClose}
            disabled={loading}
            aria-label="Đóng"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {(footer || primaryLabel || secondaryLabel) && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-surface-sunken px-5 py-3.5 dark:border-ink-800 dark:bg-surface-dark-sunken">
            {footer}
            {secondaryLabel && (
              <button
                type="button"
                disabled={loading}
                onClick={onSecondary}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-btn px-4 py-2 text-sm font-semibold transition shadow-sm',
                  secondaryDestructive
                    ? 'border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-500/10'
                    : 'border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:text-inkDark-400 dark:hover:bg-ink-800'
                )}
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {secondaryLabel}
              </button>
            )}
            {primaryLabel && (
              <button
                type="button"
                disabled={loading}
                onClick={onPrimary}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-btn px-4 py-2 text-sm font-semibold transition shadow-sm',
                  destructive
                    ? 'bg-err-600 text-white hover:bg-err-700 disabled:opacity-50'
                    : 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400 dark:active:bg-brand-600',
                )}
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {primaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
