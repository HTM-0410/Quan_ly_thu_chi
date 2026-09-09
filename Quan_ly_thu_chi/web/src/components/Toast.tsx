import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info' | 'warn';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(
    () => ({
      push,
      success: (msg: string) => push('success', msg),
      error: (msg: string) => push('error', msg),
      info: (msg: string) => push('info', msg),
      warn: (msg: string) => push('warn', msg),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-16 sm:bottom-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none *:pointer-events-auto"
      >
        {items.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setItems(prev => prev.filter(p => p.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const IconCmp =
    toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : toast.kind === 'warn' ? AlertCircle : Info;
  const iconColor =
    toast.kind === 'success'
      ? 'text-ok-600 dark:text-ok-500'
      : toast.kind === 'error'
        ? 'text-err-600 dark:text-err-500'
        : toast.kind === 'warn'
          ? 'text-warn-600 dark:text-warn-500'
          : 'text-brand-600 dark:text-brand-400';

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={
        toast.kind === 'success'
          ? 'flex items-start gap-3 rounded-card border border-ok-100 bg-ok-50 px-4 py-2.5 text-sm text-ok-700 shadow-pop dark:border-ok-700/40 dark:bg-ok-700/15 dark:text-ok-500'
          : toast.kind === 'error'
            ? 'flex items-start gap-3 rounded-card border border-err-100 bg-err-50 px-4 py-2.5 text-sm text-err-700 shadow-pop dark:border-err-700/40 dark:bg-err-700/15 dark:text-err-500'
            : toast.kind === 'warn'
              ? 'flex items-start gap-3 rounded-card border border-warn-100 bg-warn-50 px-4 py-2.5 text-sm text-warn-700 shadow-pop dark:border-warn-700/40 dark:bg-warn-700/15 dark:text-warn-500'
              : 'flex items-start gap-3 rounded-card border border-ink-200 bg-surface-raised px-4 py-2.5 text-sm text-ink-800 shadow-pop dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-900'
      }
    >
      <IconCmp size={18} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
      <span className="flex-1 pt-0.5">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-m-1 grid place-items-center rounded p-1 text-current opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        onClick={onDismiss}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}