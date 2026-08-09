import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { FormField } from './FormField';
import { VNDInput } from './VNDInput';
import { useToast } from './Toast';
import { createDebt, createPerson, getPeople } from '../lib/api';
import { unwrapError } from '../lib/format';
import clsx from 'clsx';
import type { Person, DebtType } from '../lib/types';

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
}

const EMPTY: Form = {
  person_id: '',
  newPersonName: '',
  newPersonPhone: '',
  type: 'lend',
  amount: 0,
  notes: '',
};

export function DebtFormModal({ open, onClose, onSuccess }: Props) {
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<{ person?: string; amount?: string }>({});

  useEffect(() => {
    if (open) {
      getPeople()
        .then(setPeople)
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
      </div>
    </Modal>
  );
}
