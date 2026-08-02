import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Modal } from '../components/Modal';

export type ConfirmVariant = 'default' | 'danger';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (ok: boolean) => {
      setPending(prev => {
        if (prev) prev.resolve(ok);
        return null;
      });
    },
    [],
  );

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <Modal
          open
          onClose={() => handleClose(false)}
          title={pending.title}
          size="sm"
          footer={
            <>
              <button
                className="btn-secondary"
                onClick={() => handleClose(false)}
                autoFocus
              >
                {pending.cancelText ?? 'Hủy'}
              </button>
              <button
                className={pending.variant === 'danger' ? 'btn-danger' : 'btn-primary'}
                onClick={() => handleClose(true)}
              >
                {pending.confirmText ?? 'Xác nhận'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-800">{pending.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}