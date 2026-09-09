import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { ManualTransactionModal } from './TransactionsPage';

const createManualTransaction = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({
  createManualTransaction,
  updateTransaction: vi.fn(),
  getBillWithItems: vi.fn(),
  createTransfer: vi.fn(),
  addDebtPayment: vi.fn(),
  listAccounts: vi.fn(),
  listCategories: vi.fn(),
  listTransactions: vi.fn(),
  listTransactionsPaginated: vi.fn(),
  getTransactionAccountId: vi.fn(),
  voidTransaction: vi.fn(),
  getBillSummariesForTransactions: vi.fn(),
}));

vi.mock('../lib/financialOperations', () => ({
  createPayingForOperation: vi.fn(),
}));

const account = {
  id: 'acc-1',
  user_id: 'user-1',
  name: 'Ví tiền mặt',
  type: 'cash' as const,
  currency: 'VND',
  opening_balance_minor: 0,
  opening_balance_at: '2026-09-01T00:00:00Z',
  credit_limit_minor: null,
  institution_name: null,
  masked_account_number: null,
  color: '#111111',
  icon: 'wallet',
  is_archived: false,
  include_in_net_worth: true,
  reported_balance_minor: null,
  reported_balance_at: null,
  version: 1,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

function renderModal() {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ManualTransactionModal
        accounts={[account]}
        categories={[]}
        onClose={onClose}
        onSaved={onSaved}
        bill={null}
        setBill={vi.fn()}
        billModalOpen={false}
        setBillModalOpen={vi.fn()}
      />
    </ToastProvider>,
  );
  return { onSaved, onClose };
}

beforeEach(() => {
  createManualTransaction.mockReset();
});

describe('ManualTransactionModal operation identity', () => {
  it('passes one stable client_generated_id across an unknown-result resubmit', async () => {
    createManualTransaction
      .mockRejectedValueOnce(new Error('request timed out after commit'))
      .mockResolvedValueOnce('tx-1');
    const { onSaved } = renderModal();

    const amount = screen.getByPlaceholderText('Nhập số tiền');
    fireEvent.input(amount, { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(createManualTransaction).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();

    // The modal remains open, and a second click represents reconciliation of
    // the same operation rather than a new transaction.
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(createManualTransaction).toHaveBeenCalledTimes(2));
    expect(createManualTransaction.mock.calls[0][0].client_generated_id).toBeTruthy();
    expect(createManualTransaction.mock.calls[1][0].client_generated_id).toBe(
      createManualTransaction.mock.calls[0][0].client_generated_id,
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
