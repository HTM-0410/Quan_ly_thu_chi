import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PaymentModal } from './PaymentModal';
import { useToast } from './Toast';
import { getDebtWithPayments, deleteDebt, getPeople, markDebtPaid } from '../lib/api';
import { formatDate, formatVND, unwrapError } from '../lib/format';
import type { Debt, DebtPayment, Person } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  debt: Debt | null;
}

export function DebtDetailModal({ open, onClose, onSuccess, debt }: Props) {
  const toast = useToast();
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [personName, setPersonName] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (open && debt) {
      setLoading(true);
      Promise.all([
        getDebtWithPayments(debt.id),
        getPeople(),
      ])
        .then(([{ payments: p }, people]) => {
          setPayments(p);
          const person = people.find(p => p.id === debt.person_id);
          setPersonName(person?.name ?? 'Người không xác định');
        })
        .catch(e => toast.error(unwrapError(e)))
        .finally(() => setLoading(false));
    }
  }, [open, debt]);

  async function handleDelete() {
    if (!debt) return;
    setDeleting(true);
    try {
      await deleteDebt(debt.id);
      toast.success('Đã xóa khoản nợ');
      setConfirmDelete(false);
      onClose();
      onSuccess();
    } catch (e) {
      toast.error(unwrapError(e));
    } finally {
      setDeleting(false);
    }
  }

  if (!debt) return null;

  const paid = debt.original_amount - debt.remaining_amount;
  const progress = debt.original_amount > 0
    ? Math.round((paid / debt.original_amount) * 100)
    : 0;

  return (
    <>
      <Modal
        open={open && !!debt && !confirmDelete && !showPaymentModal}
        onClose={onClose}
        title={debt.type === 'lend' ? 'Khoản cho vay' : 'Khoản vay'}
        primaryLabel={debt.type === 'lend' ? 'Ghi nhận trả tiền' : 'Đánh dấu đã trả'}
        onPrimary={() => {
          if (!debt) return;
          if (debt.type === 'lend') {
            setShowPaymentModal(true);
          } else {
            // For borrow: mark as paid directly
            markDebtPaid(debt.id)
              .then(() => {
                toast.success('Đã đánh dấu đã trả');
                onClose();
                onSuccess();
              })
              .catch(e => toast.error(unwrapError(e)));
          }
        }}
        secondaryLabel="Xóa"
        onSecondary={() => setConfirmDelete(true)}
      >
        <div className="space-y-4">
          {/* Person Info */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-lg font-medium dark:bg-ink-800 dark:text-inkDark-300">
              {personName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-medium">{personName}</div>
              <div className={debt.type === 'lend'
                ? 'text-green-600 dark:text-green-400'
                : 'text-orange-600 dark:text-orange-400'
              }>
                {debt.type === 'lend' ? 'Đang cho vay' : 'Đang vay'}
              </div>
            </div>
          </div>

          {/* Amount Info */}
          <div className="rounded-card border border-ink-100 bg-surface p-4 dark:border-ink-800 dark:bg-surface-dark">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-ink-600 dark:text-inkDark-400">Số tiền nợ</span>
              <span className="text-2xl font-semibold">{formatVND(debt.original_amount)}</span>
            </div>

            {/* Progress Bar */}
            <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              <div
                className={`h-full rounded-full transition-all ${debt.type === 'lend' ? 'bg-green-500' : 'bg-orange-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-500 dark:text-inkDark-500">
                Đã trả: {formatVND(paid)} ({progress}%)
              </span>
              <span className={debt.type === 'lend' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}>
                Còn: {formatVND(debt.remaining_amount)}
              </span>
            </div>
          </div>

          {/* Notes */}
          {debt.notes && (
            <div className="text-sm text-ink-600 dark:text-inkDark-500">
              <span className="font-medium">Ghi chú:</span> {debt.notes}
            </div>
          )}

          {/* Payment History */}
          {loading ? (
            <div className="text-center py-4 text-ink-500">Đang tải...</div>
          ) : payments.length > 0 ? (
            <div>
              <h4 className="mb-2 text-sm font-medium text-ink-700 dark:text-inkDark-300">
                Lịch sử trả nợ
              </h4>
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-btn bg-ink-50 p-2 text-sm dark:bg-ink-800">
                    <span>{formatDate(p.payment_date)}</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      +{formatVND(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-ink-400 dark:text-inkDark-500">
              Chưa có khoản trả nào
            </div>
          )}
        </div>
      </Modal>

      {/* Payment Modal */}
      <PaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={() => {
          setShowPaymentModal(false);
          onSuccess();
        }}
        debt={debt}
        personName={personName}
      />

      {/* Delete Confirm */}
      {confirmDelete && (
        <Modal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Xóa khoản nợ"
          primaryLabel="Xóa"
          onPrimary={handleDelete}
          loading={deleting}
          destructive
        >
          <p>Bạn có chắc muốn xóa khoản nợ này?</p>
        </Modal>
      )}
    </>
  );
}
