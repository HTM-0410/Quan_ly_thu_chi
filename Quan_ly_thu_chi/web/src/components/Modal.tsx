import { type ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={clsx(
          'flex w-full max-h-[92vh] flex-col overflow-hidden rounded-t-card border border-ink-200 bg-surface-raised shadow-pop',
          'sm:rounded-card dark:border-ink-800 dark:bg-surface-dark-raised',
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
            className="grid h-8 w-8 shrink-0 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-surface-sunken px-5 py-3.5 dark:border-ink-800 dark:bg-surface-dark-sunken">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
