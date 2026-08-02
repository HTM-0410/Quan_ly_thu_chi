import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  compactVNDMinor,
  computeMonthStats,
  groupByDay,
  indexByDay,
  localDateKey,
  topSpendDays,
  type DailyExpense,
} from './daily';
import type { Transaction } from './types';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'id-' + Math.random(),
    user_id: 'u',
    type: 'expense',
    status: 'posted',
    occurred_at: '2026-08-15T10:00:00.000Z',
    amount_minor: 100_000,
    currency: 'VND',
    category_id: null,
    payee: null,
    note: null,
    source: 'manual',
    bank_event_id: null,
    transfer_group_id: null,
    refund_of_transaction_id: null,
    client_generated_id: null,
    classification_status: 'unclassified',
    metadata: {},
    account_id: null,
    created_at: '2026-08-15T10:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('localDateKey', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('groupByDay', () => {
  it('sums multiple expenses on same day (local time)', () => {
    // Cùng ngày local 2026-08-15 dù khác giờ UTC
    const txs: Transaction[] = [
      makeTx({ occurred_at: '2026-08-15T01:00:00Z', amount_minor: 50_000 }),
      makeTx({ occurred_at: '2026-08-15T15:00:00Z', amount_minor: 30_000 }),
    ];
    const map = groupByDay(txs);
    expect(map.size).toBe(1);
    const entry = Array.from(map.values())[0]!;
    expect(entry.amount_minor).toBe(80_000);
    expect(entry.count).toBe(2);
  });

  it('skips non-expense and voided transactions', () => {
    const txs: Transaction[] = [
      makeTx({ type: 'income', amount_minor: 999 }),
      makeTx({ status: 'voided', amount_minor: 999 }),
    ];
    expect(groupByDay(txs).size).toBe(0);
  });
});

describe('buildMonthGrid', () => {
  it('builds a 7-column grid with correct day count', () => {
    const expenses = new Map<string, DailyExpense>();
    const grid = buildMonthGrid(2026, 7, expenses); // August 2026
    const allCells = grid.flat();
    const realDays = allCells.filter(c => c.date !== null);
    expect(realDays.length).toBe(31);
    // Tất cả row phải đúng 7 cột
    for (const row of grid) {
      expect(row.length).toBe(7);
    }
  });

  it('marks today correctly', () => {
    const today = new Date();
    const expenses = new Map<string, DailyExpense>();
    const grid = buildMonthGrid(today.getFullYear(), today.getMonth(), expenses);
    const todayCell = grid.flat().find(c => c.isToday);
    expect(todayCell).toBeDefined();
    expect(todayCell!.day).toBe(today.getDate());
  });
});

describe('topSpendDays', () => {
  it('returns top N sorted desc', () => {
    const map = new Map<string, DailyExpense>([
      ['2026-08-01', { date: '2026-08-01', amount_minor: 100, count: 1 }],
      ['2026-08-02', { date: '2026-08-02', amount_minor: 500, count: 1 }],
      ['2026-08-03', { date: '2026-08-03', amount_minor: 300, count: 1 }],
    ]);
    const top = topSpendDays(map, 2);
    expect(top.length).toBe(2);
    expect(top[0].amount_minor).toBe(500);
    expect(top[1].amount_minor).toBe(300);
  });
});

describe('computeMonthStats', () => {
  it('computes totals and average', () => {
    const map = new Map<string, DailyExpense>([
      ['2026-08-01', { date: '2026-08-01', amount_minor: 100_000, count: 1 }],
      ['2026-08-02', { date: '2026-08-02', amount_minor: 200_000, count: 1 }],
    ]);
    const stats = computeMonthStats(map, 2026, 7);
    expect(stats.total_minor).toBe(300_000);
    expect(stats.active_days).toBe(2);
    expect(stats.max_day?.amount_minor).toBe(200_000);
    expect(stats.average_per_day).toBeGreaterThan(0);
  });

  it('returns null max_day when no expenses', () => {
    const stats = computeMonthStats(new Map(), 2026, 7);
    expect(stats.max_day).toBeNull();
    expect(stats.total_minor).toBe(0);
    expect(stats.average_per_day).toBe(0);
  });
});

describe('indexByDay', () => {
  it('returns Map of transactions grouped by local date', () => {
    const txs = [
      makeTx({ id: 'a', occurred_at: '2026-08-15T01:00:00.000Z' }),
      makeTx({ id: 'b', occurred_at: '2026-08-15T08:00:00.000Z' }),
      makeTx({ id: 'c', occurred_at: '2026-08-16T08:00:00.000Z' }),
    ];
    const map = indexByDay(txs);
    expect(map.size).toBe(2);
    const keyAug15 = localDateKey(new Date('2026-08-15T01:00:00.000Z'));
    const keyAug16 = localDateKey(new Date('2026-08-16T08:00:00.000Z'));
    expect(map.get(keyAug15)?.length).toBe(2);
    expect(map.get(keyAug16)?.length).toBe(1);
  });

  it('skips non-expense and voided transactions', () => {
    const txs = [
      makeTx({ type: 'income', id: 'i1' }),
      makeTx({ status: 'voided', id: 'v1' }),
      makeTx({ id: 'ok' }),
    ];
    const map = indexByDay(txs);
    expect(map.size).toBe(1);
    const arr = Array.from(map.values())[0];
    expect(arr[0].id).toBe('ok');
  });

  it('sorts transactions by occurred_at ascending within a day', () => {
    const txs = [
      makeTx({ id: 'late', occurred_at: '2026-08-15T10:00:00.000Z' }),
      makeTx({ id: 'early', occurred_at: '2026-08-15T01:00:00.000Z' }),
      makeTx({ id: 'mid', occurred_at: '2026-08-15T05:00:00.000Z' }),
    ];
    const map = indexByDay(txs);
    const key = localDateKey(new Date('2026-08-15T01:00:00.000Z'));
    const arr = map.get(key)!;
    expect(arr.map(t => t.id)).toEqual(['early', 'mid', 'late']);
  });
});

describe('compactVNDMinor', () => {
  it('returns "0" for zero/negative', () => {
    expect(compactVNDMinor(0)).toBe('0');
    expect(compactVNDMinor(-100)).toBe('0');
  });

  it('formats under 1 million VND as k', () => {
    expect(compactVNDMinor(100_000)).toBe('1k'); // 1.000 ₫
    expect(compactVNDMinor(4_500_000)).toBe('45k'); // 45.000 ₫
    expect(compactVNDMinor(99_900)).toBe('<1k'); // 999 ₫
  });

  it('formats triệu (tr) with 1 decimal', () => {
    expect(compactVNDMinor(150_000_000)).toBe('1.5tr'); // 1.500.000 ₫
    expect(compactVNDMinor(450_000_000)).toBe('4.5tr'); // 4.500.000 ₫
    expect(compactVNDMinor(1_004_500_000)).toBe('10tr'); // 10.045.000 ₫
    expect(compactVNDMinor(2_300_000_000)).toBe('23tr'); // 23 triệu
  });

  it('formats tỷ for ≥1 tỷ', () => {
    expect(compactVNDMinor(120_000_000_000)).toBe('1.2tỷ'); // 1.2 tỷ
    expect(compactVNDMinor(250_000_000_000)).toBe('2.5tỷ');
  });
});