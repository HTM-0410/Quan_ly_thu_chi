import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({
  supabase: { rpc },
}));

import {
  createPayingForOperation,
  type PayingForOperationResult,
} from './financialOperations';

const input = {
  operation_id: '11111111-1111-4111-8111-111111111111',
  account_id: 'acc-1',
  expense_amount_minor: 1_000_000,
  payment_amount_minor: 800_000,
  debt_id: 'debt-1',
  occurred_at: '2026-09-08T04:00:00.000Z',
  category_id: 'global:cat-1',
  payee: 'Cửa hàng',
  note: 'Mua hộ',
};

const result: PayingForOperationResult = {
  success: true,
  operation_id: input.operation_id,
  expense_transaction_id: 'expense-1',
  income_transaction_id: 'income-1',
  payment_id: 'payment-1',
  debt_id: input.debt_id,
  consumer_expense_amount_minor: 200_000,
  remaining_amount: 200_000,
  status: 'active',
};

beforeEach(() => {
  rpc.mockReset();
});

describe('createPayingForOperation', () => {
  it('rejects a reimbursement larger than the purchase before making an RPC call', async () => {
    await expect(
      createPayingForOperation({ ...input, payment_amount_minor: input.expense_amount_minor + 1 }),
    ).rejects.toThrow(/không được vượt quá/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses one atomic RPC and maps global category scope without fallback writes', async () => {
    rpc.mockResolvedValue({ data: result, error: null });

    await expect(createPayingForOperation(input)).resolves.toEqual(result);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'create_paying_for_operation',
      expect.objectContaining({
        p_operation_id: input.operation_id,
        p_category_id: null,
        p_global_category_id: 'cat-1',
        p_expense_amount_minor: input.expense_amount_minor,
        p_payment_amount_minor: input.payment_amount_minor,
      }),
    );
  });

  it('retries a transient error with the same operation id', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'temporary' } })
      .mockResolvedValueOnce({ data: result, error: null });

    await expect(createPayingForOperation(input)).resolves.toEqual(result);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_operation_id).toBe(input.operation_id);
    expect(rpc.mock.calls[1][1].p_operation_id).toBe(input.operation_id);
  });

  it('fails closed when the atomic RPC is unavailable', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    });

    await expect(createPayingForOperation(input)).rejects.toThrow(/nguyên tử/i);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not treat an empty or malformed RPC response as success', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(createPayingForOperation(input)).rejects.toThrow(/không trả về kết quả/i);

    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await expect(createPayingForOperation(input)).rejects.toThrow(/không hợp lệ/i);
  });
});
