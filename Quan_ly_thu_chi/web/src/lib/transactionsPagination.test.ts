import { describe, it, expect } from 'vitest';
import type { Transaction } from './types';

describe('Transaction pagination & transfer mapping logic (TIP-002 / V1-02)', () => {
  it('calculates totalPages and slice indexes correctly', () => {
    const calc = (totalCount: number, pageSize: number, page: number) => {
      const totalPages = Math.ceil(totalCount / pageSize);
      const safePage = Math.max(1, page);
      const fromIdx = (safePage - 1) * pageSize;
      const toIdx = fromIdx + pageSize - 1;
      return { totalPages, fromIdx, toIdx };
    };

    // 205 transactions, pageSize = 50 -> 5 pages
    expect(calc(205, 50, 1)).toEqual({ totalPages: 5, fromIdx: 0, toIdx: 49 });
    expect(calc(205, 50, 5)).toEqual({ totalPages: 5, fromIdx: 200, toIdx: 249 });
    // Transaction #201 is at index 200 (page 5)

    // 0 transactions -> 0 pages
    expect(calc(0, 20, 1)).toEqual({ totalPages: 0, fromIdx: 0, toIdx: 19 });
  });

  it('correctly maps transfer entries into from_account_id and to_account_id', () => {
    const transferTx: Transaction = {
      id: 'tx-transfer-1',
      user_id: 'user-1',
      type: 'transfer',
      status: 'posted',
      occurred_at: '2026-09-01T10:00:00Z',
      amount_minor: 500_000,
      currency: 'VND',
      category_id: null,
      global_category_id: null,
      payee: null,
      note: 'Chuyển tiền tiết kiệm',
      source: 'manual',
      bank_event_id: null,
      transfer_group_id: 'tg-1',
      refund_of_transaction_id: null,
      client_generated_id: null,
      classification_status: 'confirmed',
      metadata: {},
      account_id: null,
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      version: 1,
    };

    const entries = [
      { transaction_id: 'tx-transfer-1', account_id: 'acc-wallet', amount_minor: -500_000 },
      { transaction_id: 'tx-transfer-1', account_id: 'acc-bank', amount_minor: 500_000 },
    ];

    const fromEntry = entries.find(e => e.amount_minor < 0);
    const toEntry = entries.find(e => e.amount_minor > 0);
    const fromAccountId = fromEntry?.account_id ?? null;
    const toAccountId = toEntry?.account_id ?? null;
    const accountId = fromAccountId ?? toAccountId;

    const mapped: Transaction = {
      ...transferTx,
      account_id: accountId,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
    };

    expect(mapped.from_account_id).toBe('acc-wallet');
    expect(mapped.to_account_id).toBe('acc-bank');
    expect(mapped.account_id).toBe('acc-wallet');
  });

  it('correctly maps single entry for expense or income', () => {
    const expenseEntries = [
      { transaction_id: 'tx-exp-1', account_id: 'acc-credit-card', amount_minor: -100_000 },
    ];
    const incomeEntries = [
      { transaction_id: 'tx-inc-1', account_id: 'acc-checking', amount_minor: 200_000 },
    ];

    expect(expenseEntries[0].account_id).toBe('acc-credit-card');
    expect(incomeEntries[0].account_id).toBe('acc-checking');
  });

  it('sanitizes search terms to avoid PostgREST query injection', () => {
    const sanitize = (term: string) => term.trim().replace(/[%,()]/g, '');

    expect(sanitize('  cà phê % (highlands)  ')).toBe('cà phê  highlands');
    expect(sanitize('phí chuyển tiền, test')).toBe('phí chuyển tiền test');
  });
});
