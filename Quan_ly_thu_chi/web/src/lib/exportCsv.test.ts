import { describe, it, expect, vi } from 'vitest';
import { sanitizeCsvCell, generateTransactionsCsv } from './exportCsv';
import type { Transaction } from './types';

describe('exportCsv (F25: UTF-8 BOM, Formula Injection, Safe Delimiters)', () => {
  describe('sanitizeCsvCell', () => {
    it('returns empty string for null and undefined', () => {
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });

    it('formats numbers without modification', () => {
      expect(sanitizeCsvCell(12345)).toBe('12345');
      expect(sanitizeCsvCell(0)).toBe('0');
    });

    it('escapes cells containing commas, quotes, or newlines with double quotes', () => {
      expect(sanitizeCsvCell('Cà phê, trà đá')).toBe('"Cà phê, trà đá"');
      expect(sanitizeCsvCell('Mua "bánh mì"')).toBe('"Mua ""bánh mì"""');
      expect(sanitizeCsvCell('Dòng 1\nDòng 2')).toBe('"Dòng 1\nDòng 2"');
    });

    it('prevents formula injection by prepending single quote for =, +, -, @, \\t, \\r', () => {
      // Excel/Calc will execute formula if starting with =, +, -, @
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell('+cmd|/C calc')).toBe("'+cmd|/C calc");
      expect(sanitizeCsvCell('-1+1')).toBe("'-1+1");
      expect(sanitizeCsvCell('@SUM(1)')).toBe("'@SUM(1)");
    });

    it('properly quotes formula injection cells that also have commas or quotes', () => {
      const dangerous = '=HYPERLINK("http://evil.com","Click me")';
      const sanitized = sanitizeCsvCell(dangerous);
      // Starts with ' followed by =HYPERLINK... and wrapped in quotes due to comma
      expect(sanitized).toBe('"\'=HYPERLINK(""http://evil.com"",""Click me"")"');
    });
  });

  describe('generateTransactionsCsv', () => {
    const mockTransactions: Transaction[] = [
      {
        id: 'tx-1',
        user_id: 'u1',
        account_id: 'acc-1',
        category_id: 'cat-1',
        global_category_id: null,
        type: 'expense',
        amount_minor: 50000,
        occurred_at: '2026-09-01T10:00:00Z',
        payee: 'Highlands Coffee',
        note: 'Gặp gỡ đối tác',
        status: 'posted',
        source: 'manual',
        from_account_id: null,
        to_account_id: null,
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
        version: 1,
      },
      {
        id: 'tx-2',
        user_id: 'u1',
        account_id: null,
        category_id: null,
        global_category_id: null,
        type: 'transfer',
        amount_minor: 1000000,
        occurred_at: '2026-09-02T15:30:00Z',
        payee: null,
        note: '=1+1 dangerous note',
        status: 'posted',
        source: 'manual',
        from_account_id: 'acc-1',
        to_account_id: 'acc-2',
        created_at: '2026-09-02T15:30:00Z',
        updated_at: '2026-09-02T15:30:00Z',
        version: 1,
      },
    ] as unknown as Transaction[];

    const ctx = {
      accountMap: new Map([
        ['acc-1', 'Ví Tiền Mặt'],
        ['acc-2', 'Tài khoản Vietcombank'],
      ]),
      categoryMap: new Map([['cat-1', 'Ăn uống']]),
    };

    it('generates CSV with UTF-8 BOM prefix', () => {
      const csv = generateTransactionsCsv(mockTransactions, ctx);
      expect(csv.startsWith('\uFEFF')).toBe(true);
    });

    it('contains header and mapped transaction rows', () => {
      const csv = generateTransactionsCsv(mockTransactions, ctx);
      expect(csv).toContain('Mã giao dịch,Thời gian,Loại giao dịch,Số tiền (VND),Tài khoản,Danh mục,Đối tác / Người nhận,Ghi chú,Trạng thái');
      expect(csv).toContain('Ví Tiền Mặt');
      expect(csv).toContain('Ăn uống');
      expect(csv).toContain('Highlands Coffee');
      expect(csv).toContain('Ví Tiền Mặt → Tài khoản Vietcombank');
    });

    it('escapes dangerous notes starting with formula characters in rows', () => {
      const csv = generateTransactionsCsv(mockTransactions, ctx);
      // '=1+1 dangerous note' should be escaped as ''=1+1 dangerous note'
      expect(csv).toContain("'=1+1 dangerous note");
    });
  });
});
