import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { FormField } from './FormField';
import { VNDInput } from './VNDInput';
import { useToast } from './Toast';
import { createDebt, createPerson, getPeople, listAccounts } from '../lib/api';
import { unwrapError } from '../lib/format';
import clsx from 'clsx';
import type { Person, DebtType, FinancialAccount } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Form {
  person_id: string;
  newPersonName: string;
  newPersonPhone: string;
  type: DebtType;
  amount: number;
  notes: string;
  disburseFromWallet: boolean;
  disburse_account_id: string;
}

const EMPTY: Form = {
  person_id: '',
  newPersonName: '',
  newPersonPhone: '',
  type: 'lend',
  amount: 0,
  notes: '',
  disburseFromWallet: false,
  disburse_account_id: '',
};

export function DebtFormModal({ open, onClose, onSuccess }: Props) {
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<{ person?: string; amount?: string; account?: string }>({});

  useEffect(() => {
    if (open) {
      getPeople()
        .then(setPeople)
        .catch(e => toast.error(unwrapError(e)));
      listAccounts()
        .then(list => {
          const active = list.filter(a => !a.is_archived);
          setAccounts(active);
          if (active.length > 0) {
            setForm(f => ({
              ...f,
              disburse_account_id: f.disburse_account_id || active[0].id,
            }));
          }
        })
        .catch(e => toast.error(unwrapError(e)));
    }
  }, [open]);

  function handleClose() {
    setForm(EMPTY);
    setErrors({});
    onClose();
  }

  async function handleSave() {
    const errs: typeof errors = {};

    const personId = form.person_id === '__new__' ? null : form.person_id;
    const personName = form.person_id === '__new__' ? form.newPersonName.trim() : null;

    if (!personId && !personName) errs.person = 'Vui lòng chọn hoặc thêm người';
    if (form.person_id === '__new__' && !personName) errs.person = 'Vui lòng nhập tên người mới';
    if (form.amount <= 0) errs.amount = 'Số tiền phải lớn hơn 0';
    if (form.disburseFromWallet && !form.disburse_account_id) {
      errs.account = 'Vui lòng chọn tài khoản';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      let finalPersonId = personId;

      // Create new person if needed
      if (!finalPersonId && personName) {
        const newPerson = await createPerson(personName, form.newPersonPhone.trim() || undefined);
        finalPersonId = newPerson.id;
      }

      await createDebt({
        person_id: finalPersonId!,
        type: form.type,
        original_amount: form.amount,
        notes: form.notes.trim() || null,
        disburse_account_id: form.disburseFromWallet ? form.disburse_account_id : null,
      });

      toast.success('Đã tạo khoản nợ');
      handleClose();
      onSuccess();
    } catch (e) {
      toast.error(unwrapError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm khoản nợ"
      primaryLabel="Tạo"
      onPrimary={handleSave}
      loading={submitting}
    >
      <div className="space-y-4">
        {/* Type Toggle */}
        <FormField label="Loại" required>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: 'lend' }))}
              className={clsx(
                'flex-1 rounded-btn border py-2 text-sm font-medium transition',
                form.type === 'lend'
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-inkDark-500 dark:hover:bg-ink-800'
              )}
            >
              Cho vay
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: 'borrow' }))}
              className={clsx(
                'flex-1 rounded-btn border py-2 text-sm font-medium transition',
                form.type === 'borrow'
                  ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-500/20 dark:text-orange-300'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-inkDark-500 dark:hover:bg-ink-800'
              )}
            >
              Đi vay
            </button>
          </div>
        </FormField>

        {/* Person Select */}
        <FormField label="Người" required error={errors.person}>
          <select
            value={form.person_id}
            onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))}
            className="input w-full"
          >
            <option value="">-- Chọn người --</option>
            {people.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.phone ? `(${p.phone})` : ''}
              </option>
            ))}
            <option value="__new__">+ Thêm người mới</option>
          </select>
        </FormField>

        {/* New Person Fields */}
        {form.person_id === '__new__' && (
          <div className="space-y-3 rounded-card border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-500/10">
            <FormField label="Tên người mới">
              <input
                type="text"
                value={form.newPersonName}
                onChange={e => setForm(f => ({ ...f, newPersonName: e.target.value }))}
                placeholder="VD: Nguyễn Văn A"
                className="input w-full"
                autoFocus
              />
            </FormField>
            <FormField label="Số điện thoại (tùy chọn)">
              <input
                type="tel"
                value={form.newPersonPhone}
                onChange={e => setForm(f => ({ ...f, newPersonPhone: e.target.value }))}
                placeholder="VD: 0912 345 678"
                className="input w-full"
              />
            </FormField>
          </div>
        )}

        {/* Amount */}
        <FormField label="Số tiền" required error={errors.amount}>
          <VNDInput
            value={form.amount}
            onChange={v => setForm(f => ({ ...f, amount: v }))}
            className="input w-full"
          />
        </FormField>

        {/* Notes */}
        <FormField label="Ghi chú">
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="VD: Ăn cơm hôm nay, mình trả trước"
            className="input w-full resize-none"
            rows={2}
          />
        </FormField>

        {/* Wallet Disbursement Option (F08) */}
        <div className="rounded-card border border-ink-100 bg-ink-50/50 p-3 dark:border-ink-800 dark:bg-ink-800/50">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink-700 dark:text-inkDark-300">
            <input
              type="checkbox"
              checked={form.disburseFromWallet}
              onChange={e => {
                const checked = e.target.checked;
                setForm(f => ({
                  ...f,
                  disburseFromWallet: checked,
                  disburse_account_id: checked && !f.disburse_account_id && accounts[0] ? accounts[0].id : f.disburse_account_id,
                }));
                setErrors(prev => ({ ...prev, account: undefined }));
              }}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              {form.type === 'lend'
                ? 'Trừ tiền ngay từ tài khoản (xuất tiền cho vay)'
                : 'Cộng tiền ngay vào tài khoản (nhận tiền đi vay)'}
            </span>
          </label>
          <p className="mt-1 text-xs text-ink-500 dark:text-inkDark-400 pl-6">
            Bỏ chọn nếu đây là khoản nợ cũ hoặc theo dõi ngoài, không ảnh hưởng số dư ví hiện tại.
          </p>

          {form.disburseFromWallet && (
            <div className="mt-3 pl-6">
              <FormField
                label={form.type === 'lend' ? 'Tài khoản xuất tiền' : 'Tài khoản nhận tiền'}
                required
                error={errors.account}
              >
                <select
                  value={form.disburse_account_id}
                  onChange={e => {
                    setForm(f => ({ ...f, disburse_account_id: e.target.value }));
                    setErrors(prev => ({ ...prev, account: undefined }));
                  }}
                  className="input w-full"
                >
                  {accounts.length === 0 && <option value="">— Chưa có tài khoản —</option>}
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.institution_name ? `(${a.institution_name})` : ''}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
