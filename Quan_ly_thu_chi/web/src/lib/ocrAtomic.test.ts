import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({ supabase: { rpc } }));

import { createOcrRowAtomic, toOcrCategoryFields } from './ocrAtomic';

const input = {
  row_id: '11111111-1111-4111-8111-111111111111',
  splits: [{
    account_id: '22222222-2222-4222-8222-222222222222',
    type: 'expense' as const,
    amount_minor: 100_000,
    occurred_at: '2026-09-08T10:00:00Z',
    category_id: '33333333-3333-4333-8333-333333333333',
    payee: 'Cửa hàng',
    note: '[OCR]',
    client_generated_id: '44444444-4444-4444-8444-444444444444',
  }],
  bill: {
    channel_type: 'offline' as const,
    online_marketplace: null,
    online_marketplace_other: null,
    store_name: 'Cửa hàng',
    declared_total_minor: 100_000,
    items: [],
  },
  debt: {
    person_id: '55555555-5555-4555-8555-555555555555',
    type: 'lend' as const,
    original_amount: 50_000,
    notes: 'split',
  },
};

describe('createOcrRowAtomic', () => {
  beforeEach(() => rpc.mockReset());

  it('sends one complete row payload to the dedicated RPC', async () => {
    rpc.mockResolvedValue({
      data: { transaction_ids: ['tx-1'], bill_id: 'bill-1', debt_id: 'debt-1' },
      error: null,
    });

    await expect(createOcrRowAtomic(input)).resolves.toEqual({
      transaction_ids: ['tx-1'],
      bill_id: 'bill-1',
      debt_id: 'debt-1',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe('create_ocr_transaction_row_atomic');
    expect(rpc.mock.calls[0]![1]).toEqual({
      p_row_id: input.row_id,
      p_splits: [{ ...input.splits[0]!, global_category_id: null }],
      p_bill: input.bill,
      p_debt: input.debt,
    });
  });

  it('retries transient failures with the same row and idempotency payload', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'timeout' } })
      .mockResolvedValueOnce({
        data: { transaction_ids: ['tx-1'], bill_id: 'bill-1', debt_id: 'debt-1' },
        error: null,
      });

    await expect(createOcrRowAtomic(input)).resolves.toMatchObject({ transaction_ids: ['tx-1'] });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]![1]).toEqual(rpc.mock.calls[0]![1]);
  });

  it('rejects an invalid server result instead of treating it as success', async () => {
    rpc.mockResolvedValue({ data: { transaction_ids: [] }, error: null });
    await expect(createOcrRowAtomic(input)).rejects.toThrow('invalid result');
  });

  it('converts global category ids before crossing the RPC boundary', async () => {
    rpc.mockResolvedValue({
      data: { transaction_ids: ['tx-1'], bill_id: null, debt_id: null },
      error: null,
    });

    await createOcrRowAtomic({
      ...input,
      bill: null,
      debt: null,
      splits: [{ ...input.splits[0]!, category_id: 'global:66666666-6666-4666-8666-666666666666' }],
    });

    expect(rpc.mock.calls[0]![1].p_splits[0]).toMatchObject({
      category_id: null,
      global_category_id: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('splits the UI category namespace into the database category columns', () => {
    expect(toOcrCategoryFields('global:66666666-6666-4666-8666-666666666666')).toEqual({
      category_id: null,
      global_category_id: '66666666-6666-4666-8666-666666666666',
    });
    expect(toOcrCategoryFields('33333333-3333-4333-8333-333333333333')).toEqual({
      category_id: '33333333-3333-4333-8333-333333333333',
      global_category_id: null,
    });
  });
});
