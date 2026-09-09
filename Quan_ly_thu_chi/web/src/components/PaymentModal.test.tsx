/**
 * UI tests cho PaymentModal (validation + flow ghi nhận thanh toán).
 * Mock API layer — không cần DB thật.
 *
 * Convention trong codebase:
 *  - debt.original_amount / remaining_amount lưu trong DB ở MINOR units (×100).
 *  - VNDInput: digits raw = VND major; onChange trả MINOR (×100).
 *  - formatVND(minor) = minor/100 → hiển thị major.
 *
 *  Test data:
 *  - baseDebt.remaining_amount = 60_000_000 minor → display "600.000 ₫"
 *  - setAmountInput('500000') → 50_000_000 minor (500k VND) < 60M → hợp lệ
 *  - setAmountInput('70000000') → 7_000_000_000 minor (70M VND) > 60M → vượt
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from './Toast';
import { PaymentModal } from './PaymentModal';
import type { Debt } from '../lib/domain';

const mockAccounts = [
  {
    id: 'acc-1',
    user_id: 'user-1',
    name: 'Tiền mặt',
    type: 'cash' as const,
    currency: 'VND',
    opening_balance_minor: 0,
    color: '#10b981',
    icon: 'wallet',
    institution_name: null,
    include_in_net_worth: true,
    is_archived: false,
    version: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

vi.mock('../lib/api', () => ({
  settleDebtPayment: vi.fn(),
  deleteDebt: vi.fn(),
  listAccounts: vi.fn(),
}));

import * as api from '../lib/api';

const baseDebt: Debt = {
  id: 'debt-1',
  user_id: 'user-1',
  person_id: 'person-1',
  type: 'lend',
  counterparty_name: 'Nguyễn Văn A',
  original_amount: 100_000_000,
  remaining_amount: 60_000_000,
  status: 'active',
  notes: 'cho vay mua xe',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function renderModal(debt: Debt = baseDebt) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <ToastProvider>
      <PaymentModal
        open
        onClose={onClose}
        onSuccess={onSuccess}
        debt={debt}
        personName={debt.counterparty_name}
      />
    </ToastProvider>,
  );
  return { ...utils, onClose, onSuccess };
}

function setAmountInput(value: string) {
  const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
  fireEvent.input(input, { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listAccounts).mockResolvedValue(mockAccounts as any);
});

describe('PaymentModal', () => {
  it('Render: hiển thị tổng nợ, còn nợ, mode toggle', () => {
    renderModal();
    expect(screen.getByText(/Tổng nợ/i)).toBeInTheDocument();
    expect(screen.getByText(/Còn nợ/i)).toBeInTheDocument();
    expect(screen.getByText(/Trả hết/i)).toBeInTheDocument();
    expect(screen.getByText(/Trả một phần/i)).toBeInTheDocument();
  });

  it('Default mode = partial, amount input enabled', () => {
    renderModal();
    const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    expect(input).not.toBeDisabled();
  });

  it('Click "Trả hết" auto-fill amount = remaining (formatted), disable input', () => {
    renderModal();
    fireEvent.click(screen.getByText(/Trả hết/));
    const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    // 60_000_000 minor → 600.000 VND → "600.000"
    expect(input.value).toBe('600.000');
    expect(input).toBeDisabled();
  });

  it('Validation: amount rỗng → submit hiển thị error', async () => {
    const { onSuccess } = renderModal();
    setAmountInput('');
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => {
      expect(screen.getByText(/lớn hơn 0/i)).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(api.settleDebtPayment).not.toHaveBeenCalled();
  });

  it('Validation: amount > remaining → submit hiển thị error', async () => {
    const { onSuccess } = renderModal();
    // '70000000' → 7_000_000_000 minor (70M VND) > 60_000_000 minor (600k VND)
    setAmountInput('70000000');
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => {
      expect(screen.getByText(/vượt quá số nợ còn lại/i)).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(api.settleDebtPayment).not.toHaveBeenCalled();
  });

  it('Submit "Trả một phần" hợp lệ → settleDebtPayment + onSuccess', async () => {
    const { onSuccess } = renderModal();
    vi.mocked(api.settleDebtPayment).mockResolvedValue({
      success: true,
      payment_id: 'p1',
      transaction_id: 'tx-1',
      remaining_amount: 10_000_000,
      status: 'active',
    });

    // Chờ load accounts hoàn tất
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('acc-1'));

    // '500000' → 50_000_000 minor (500k VND) < 60M → hợp lệ
    setAmountInput('500000');
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => {
      expect(api.settleDebtPayment).toHaveBeenCalledWith(expect.objectContaining({
        debt_id: baseDebt.id,
        account_id: 'acc-1',
        amount: 50_000_000,
        payment_date: expect.any(String),
        note: expect.stringContaining('cho vay'),
        idempotency_key: expect.any(String),
      }));
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('Submit "Trả hết" → settleDebtPayment với amount = remaining', async () => {
    const { onSuccess } = renderModal();
    vi.mocked(api.settleDebtPayment).mockResolvedValue({
      success: true,
      payment_id: 'p2',
      transaction_id: 'tx-2',
      remaining_amount: 0,
      status: 'paid',
    });

    // Chờ load accounts hoàn tất
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('acc-1'));

    fireEvent.click(screen.getByText(/Trả hết/));
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => {
      expect(api.settleDebtPayment).toHaveBeenCalledWith(expect.objectContaining({
        debt_id: baseDebt.id,
        account_id: 'acc-1',
        amount: baseDebt.remaining_amount,
        payment_date: expect.any(String),
        note: expect.stringContaining('cho vay'),
        idempotency_key: expect.any(String),
      }));
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('API lỗi → toast error hiển thị, modal không đóng', async () => {
    const { onSuccess } = renderModal();
    vi.mocked(api.settleDebtPayment).mockRejectedValue(new Error('RPC failed'));

    // Chờ load accounts hoàn tất
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('acc-1'));

    setAmountInput('50000');
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => {
      expect(screen.getByText(/RPC failed/)).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('Đóng modal qua nút Đóng → reset state khi mở lại', async () => {
    const { rerender } = renderModal();
    fireEvent.click(screen.getByText(/Trả hết/));
    await new Promise(r => setTimeout(r, 0));

    // Click nút đóng (aria-label="Đóng")
    fireEvent.click(screen.getByLabelText('Đóng'));
    await new Promise(r => setTimeout(r, 0));

    // Re-render với open=true
    rerender(
      <ToastProvider>
        <PaymentModal
          open
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          debt={baseDebt}
          personName={baseDebt.counterparty_name}
        />
      </ToastProvider>,
    );

    const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    expect(input).not.toBeDisabled();
  });
});
