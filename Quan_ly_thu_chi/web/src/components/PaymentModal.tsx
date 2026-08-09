import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { FormField } from './FormField';
import { VNDInput } from './VNDInput';
import { useToast } from './Toast';
import {
  addDebtPayment,
  createManualTransaction,
  deleteDebt,
  listAccounts,
} from '../lib/api';
import { supabase } from '../lib/supabase';
import { formatVND, unwrapError } from '../lib/format';
import clsx from 'clsx';
import type { Debt, FinancialAccount } from '../lib/types';

type PaymentMode = 'full' | 'partial';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  debt: Debt | null;
  personName: string;
}

export function PaymentModal({ open, onClose, onSuccess, debt, personName }: Props) {
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<PaymentMode>('partial');
  const [accountId, setAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; account?: string }>({});

  const remainingAmount = debt?.remaining_amount ?? 0;
  const isFullPayment = mode === 'full' || amount === remainingAmount;

  // Load accounts mỗi lần modal mở (không cache account cũ qua debt khác).
  useEffect(() => {
    if (!open) return;
    setErrors({});
    listAccounts()
      .then(list => {
        const active = list.filter(a => !a.is_archived);
        setAccounts(active);
        setAccountId(prev => prev || active[0]?.id || '');
      })
      .catch(e => toast.error(unwrapError(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setAmount(0);
    setMode('partial');
    setErrors({});
    onClose();
  }

  function handleModeChange(newMode: PaymentMode) {
    setMode(newMode);
    if (newMode === 'full' && debt) {
      setAmount(remainingAmount);
    }
    setErrors({});
  }

  async function handleSave() {
    if (!debt) return;

    const paymentAmount = mode === 'full' ? remainingAmount : amount;

    const errs: typeof errors = {};
    if (paymentAmount <= 0) errs.amount = 'Số tiền phải lớn hơn 0';
    if (paymentAmount > remainingAmount) errs.amount = 'Số tiền trả vượt quá số nợ còn lại';
    if (!accountId) errs.account = 'Vui lòng chọn tài khoản';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    let createdPaymentId: string | null = null;
    try {
      // Bước 1: ghi nhận debt payment (trigger DB tự trừ remaining_amount).
      const payment = await addDebtPayment({
        debt_id: debt.id,
        amount: paymentAmount,
        payment_date: new Date().toISOString(),
      });
      createdPaymentId = payment.id;

      // Bước 2: tạo giao dịch income/expense tương ứng.
      //   lend  → income  (thu tiền về)   → cộng vào tài khoản
      //   borrow→ expense (trả tiền đi)   → trừ khỏi tài khoản
      // Nếu Bước 2 fail, rollback Bước 1 để tránh debt bị trừ mà tiền không đổi.
      try {
        await createManualTransaction({
          type: debt.type === 'lend' ? 'income' : 'expense',
          account_id: accountId,
          amount_minor: paymentAmount,
          occurred_at: new Date().toISOString(),
          payee: personName,
          note: `Thanh toán khoản ${debt.type === 'lend' ? 'cho vay' : 'vay'} - ${personName}`,
        });
      } catch (txErr) {
        // Rollback: xóa payment row + revert remaining_amount trên debts.
        const reason = unwrapError(txErr);
        console.error('[payment-modal] transaction failed, rolling back payment', {
          paymentId: createdPaymentId,
          debtId: debt.id,
          amount: paymentAmount,
          reason,
        });
        await supabase.from('debt_payments').delete().eq('id', createdPaymentId);
        // Trigger không có sẵn để "restore remaining", nên tự recompute.
        const { data: allPayments } = await supabase
          .from('debt_payments')
          .select('amount')
          .eq('debt_id', debt.id);
        const totalPaid = (allPayments ?? []).reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        );
        const restored = Math.max(0, debt.original_amount - totalPaid);
        await supabase
          .from('debts')
          .update({
            remaining_amount: restored,
            status: restored === 0 ? 'paid' : 'active',
          })
          .eq('id', debt.id);
        throw new Error(`Không thể tạo giao dịch (đã rollback): ${reason}`);
      }

      toast.success(mode === 'full' ? 'Đã trả hết khoản nợ' : 'Đã ghi nhận thanh toán');
      handleClose();
      onSuccess();
    } catch (e) {
      toast.error(unwrapError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!debt) return;
    setDeleting(true);
    try {
      await deleteDebt(debt.id);
      toast.success('Đã xóa khoản nợ');
      setConfirmDelete(false);
      handleClose();
      onSuccess();
    } catch (e) {
      toast.error(unwrapError(e));
    } finally {
      setDeleting(false);
    }
  }

  const modalContent = (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 dark:text-inkDark-500">
        {debt?.type === 'lend'
          ? `Thu tiền từ ${personName}`
          : `Trả tiền cho ${personName}`}
      </p>

      {debt && (
        <div className="rounded-card bg-ink-50 p-3 text-sm dark:bg-ink-800">
          <div className="flex justify-between">
            <span className="text-ink-600 dark:text-inkDark-400">Tổng nợ:</span>
            <span className="font-medium">{formatVND(debt.original_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600 dark:text-inkDark-400">Còn nợ:</span>
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {formatVND(remainingAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Payment Mode Toggle */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-inkDark-300">
          Chọn cách trả
        </label>
        <div className="flex rounded-btn border border-ink-200 p-0.5 dark:border-ink-700">
          <button
            type="button"
            onClick={() => handleModeChange('full')}
            className={clsx(
              'flex-1 rounded-btn py-2 text-sm font-medium transition',
              mode === 'full'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-ink-600 hover:bg-ink-50 dark:text-inkDark-400 dark:hover:bg-ink-800'
            )}
          >
            Trả hết
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('partial')}
            className={clsx(
              'flex-1 rounded-btn py-2 text-sm font-medium transition',
              mode === 'partial'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-ink-600 hover:bg-ink-50 dark:text-inkDark-400 dark:hover:bg-ink-800'
            )}
          >
            Trả một phần
          </button>
        </div>
      </div>

      {/* Amount Input */}
      <FormField label="Số tiền" required error={errors.amount}>
        <VNDInput
          value={mode === 'full' ? remainingAmount : amount}
          onChange={v => {
            setAmount(v);
            setMode(v === remainingAmount ? 'full' : 'partial');
          }}
          placeholder={`Trả hết: ${formatVND(remainingAmount)}`}
          className="input w-full"
          disabled={mode === 'full'}
          autoFocus={mode === 'partial'}
        />
        {isFullPayment && (
          <span className="mt-1 inline-block rounded-btn bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/20 dark:text-green-300">
            Trả hết
          </span>
        )}
      </FormField>

      {/* Account Select */}
      <FormField
        label={debt?.type === 'lend' ? 'Tài khoản nhận tiền' : 'Tài khoản trả tiền'}
        required
        error={errors.account}
      >
        <select
          className="input w-full"
          value={accountId}
          onChange={e => {
            setAccountId(e.target.value);
            setErrors(prev => ({ ...prev, account: undefined }));
          }}
        >
          {accounts.length === 0 && <option value="">— Chưa có tài khoản —</option>}
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} {a.institution_name ? `(${a.institution_name})` : ''}
            </option>
          ))}
        </select>
      </FormField>

      {/* Delete Debt Button */}
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="w-full rounded-btn border border-red-200 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        Xóa khoản vay
      </button>
    </div>
  );

  return (
    <>
      <Modal
        open={open && !confirmDelete}
        onClose={handleClose}
        title={debt?.type === 'lend' ? 'Ghi nhận trả tiền' : 'Đánh dấu đã trả'}
        primaryLabel="Lưu"
        onPrimary={handleSave}
        loading={submitting}
      >
        {modalContent}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Xóa khoản vay"
        primaryLabel="Xóa"
        onPrimary={handleDelete}
        loading={deleting}
        destructive
      >
        <p className="text-ink-700 dark:text-inkDark-300">
          Bạn có chắc muốn xóa khoản vay này? Hành động này không thể hoàn tác.
        </p>
      </Modal>
    </>
  );
}