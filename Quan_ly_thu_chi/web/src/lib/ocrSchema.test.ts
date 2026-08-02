import { describe, it, expect } from 'vitest';
import {
  OcrTransactionSchema,
  OcrResultSchema,
  validateOcrResult,
  normalizeOcrOccurredAt,
  OcrParseError,
} from './ocrSchema';

const VALID_TRANSACTION = {
  occurred_at: '2026-07-29T14:23:00',
  type: 'expense' as const,
  amount_minor: 50_000_000,
  currency: 'VND' as const,
  payee: 'NGUYEN VAN A',
  note: 'Test',
  suggested_category: 'Ăn uống',
  account_hint: 'VCB ****1234',
  confidence: 0.85,
};

describe('OcrTransactionSchema', () => {
  it('accepts a valid transaction', () => {
    const parsed = OcrTransactionSchema.parse(VALID_TRANSACTION);
    expect(parsed.amount_minor).toBe(50_000_000);
    expect(parsed.confidence).toBe(0.85);
  });

  it('defaults currency to VND when omitted', () => {
    const parsed = OcrTransactionSchema.parse({ ...VALID_TRANSACTION, currency: undefined });
    expect(parsed.currency).toBe('VND');
  });

  it('defaults confidence to 0.5 when omitted', () => {
    const { confidence: _omit, ...rest } = VALID_TRANSACTION;
    const parsed = OcrTransactionSchema.parse(rest);
    expect(parsed.confidence).toBe(0.5);
  });

  it('rejects negative amount', () => {
    expect(() => OcrTransactionSchema.parse({ ...VALID_TRANSACTION, amount_minor: -1 })).toThrow();
  });

  it('rejects zero amount', () => {
    expect(() => OcrTransactionSchema.parse({ ...VALID_TRANSACTION, amount_minor: 0 })).toThrow();
  });

  it('rejects non-integer amount', () => {
    expect(() => OcrTransactionSchema.parse({ ...VALID_TRANSACTION, amount_minor: 50.5 })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      OcrTransactionSchema.parse({ ...VALID_TRANSACTION, type: 'transfer' }),
    ).toThrow();
  });

  it('rejects confidence outside [0,1]', () => {
    expect(() =>
      OcrTransactionSchema.parse({ ...VALID_TRANSACTION, confidence: 1.5 }),
    ).toThrow();
    expect(() =>
      OcrTransactionSchema.parse({ ...VALID_TRANSACTION, confidence: -0.1 }),
    ).toThrow();
  });

  it('treats payee/note/suggested_category as optional', () => {
    const { payee: _p, note: _n, suggested_category: _c, ...rest } = VALID_TRANSACTION;
    const parsed = OcrTransactionSchema.parse(rest);
    expect(parsed.payee).toBeUndefined();
  });
});

describe('OcrResultSchema', () => {
  it('accepts a valid result with multiple transactions', () => {
    const result = OcrResultSchema.parse({
      transactions: [VALID_TRANSACTION, { ...VALID_TRANSACTION, type: 'income' }],
      image_quality: 'good',
      notes: null,
    });
    expect(result.transactions).toHaveLength(2);
  });

  it('accepts empty transactions array', () => {
    const result = OcrResultSchema.parse({ transactions: [] });
    expect(result.transactions).toEqual([]);
    expect(result.image_quality).toBe('good');
  });

  it('rejects more than 50 transactions', () => {
    const txs = Array.from({ length: 51 }, () => VALID_TRANSACTION);
    expect(() => OcrResultSchema.parse({ transactions: txs })).toThrow();
  });
});

describe('validateOcrResult', () => {
  it('returns parsed result on valid input', () => {
    const result = validateOcrResult({
      transactions: [VALID_TRANSACTION],
      image_quality: 'good',
    });
    expect(result.transactions[0]?.amount_minor).toBe(50_000_000);
  });

  it('throws OcrParseError with Vietnamese message on invalid input', () => {
    expect(() => validateOcrResult({ transactions: [{ type: 'bad' }] })).toThrow(OcrParseError);
    try {
      validateOcrResult({ transactions: [{ type: 'bad' }] });
    } catch (e) {
      expect(e).toBeInstanceOf(OcrParseError);
      expect((e as Error).message).toMatch(/Phản hồi AI không hợp lệ/);
    }
  });

  it('handles non-Error unknown input', () => {
    expect(() => validateOcrResult(null)).toThrow();
  });
});

describe('normalizeOcrOccurredAt', () => {
  it('parses local-time ISO (no offset) as GMT+7', () => {
    // 2026-07-29 14:23 local Vietnam = 07:23 UTC
    const out = normalizeOcrOccurredAt('2026-07-29T14:23:00');
    expect(out).toBe('2026-07-29T07:23:00.000Z');
  });

  it('parses Z-suffixed UTC time as-is', () => {
    const out = normalizeOcrOccurredAt('2026-07-29T14:23:00Z');
    expect(out).toBe('2026-07-29T14:23:00.000Z');
  });

  it('parses offset-suffixed time', () => {
    const out = normalizeOcrOccurredAt('2026-07-29T14:23:00+07:00');
    expect(out).toBe('2026-07-29T07:23:00.000Z');
  });

  it('throws OcrParseError on invalid string', () => {
    expect(() => normalizeOcrOccurredAt('not-a-date')).toThrow(OcrParseError);
  });

  it('returns current ISO for empty input', () => {
    const before = Date.now();
    const out = normalizeOcrOccurredAt('');
    const after = Date.now();
    const ts = new Date(out).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
