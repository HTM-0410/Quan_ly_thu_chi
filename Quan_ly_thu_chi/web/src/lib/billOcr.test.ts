import { describe, it, expect } from 'vitest';
import {
  validateBillParseResult,
  sanityCheckBillItem,
  sanityCheckBillTotal,
  BillOcrParseError,
  type BillItemParsed,
} from './billOcrSchema';
import billFixture from '../test/fixtures/bill.json';

describe('validateBillParseResult', () => {
  it('accepts a valid fixture from AI', () => {
    const result = validateBillParseResult(billFixture);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]!.name).toBe('Sữa tươi Vinamilk 1L');
    // fixture giá trị VND (< 100k) → auto ×100 = 3.500.000 minor
    expect(result.items[0]!.unit_price).toBe(3_500_000);
    // total 140.000 < 1.000.000 → auto ×100 = 14.000.000 minor
    expect(result.total).toBe(14_000_000);
    expect(result.store_name).toBe('Co.opmart Nguyễn Kiệm');
    expect(result.image_quality).toBe('good');
  });

  it('auto-multiplies by 100 when AI returns VND as-is (1.000–100.000)', () => {
    const raw = {
      items: [{ name: 'Sản phẩm A', quantity: 1, unit_price: 35000, line_total: 35000 }],
      total: 35000,
    };
    const result = validateBillParseResult(raw);
    expect(result.items[0]!.unit_price).toBe(3_500_000); // ×100
    expect(result.items[0]!.line_total).toBe(3_500_000);
    expect(result.total).toBe(3_500_000);
  });

  it('keeps values >= 100.000 as-is (already ×100)', () => {
    const raw = {
      items: [{ name: 'Sản phẩm B', quantity: 1, unit_price: 35_000_00, line_total: 35_000_00 }],
      total: 35_000_00,
    };
    const result = validateBillParseResult(raw);
    expect(result.items[0]!.unit_price).toBe(35_000_00);
  });

  it('throws BillOcrParseError on missing required fields', () => {
    expect(() =>
      validateBillParseResult({
        items: [{ name: '', quantity: 1, unit_price: 100, line_total: 100 }],
        total: 100,
      }),
    ).toThrow(BillOcrParseError);
  });

  it('accepts null total and image_quality default to good', () => {
    const result = validateBillParseResult({
      items: [{ name: 'X', quantity: 1, unit_price: 100, line_total: 100 }],
      total: null,
    });
    expect(result.total).toBeNull();
    expect(result.image_quality).toBe('good');
  });

  it('rejects more than 200 items', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      name: `Item ${i}`,
      quantity: 1,
      unit_price: 100,
      line_total: 100,
    }));
    expect(() => validateBillParseResult({ items, total: 100 })).toThrow(BillOcrParseError);
  });
});

describe('sanityCheckBillItem', () => {
  const ok: BillItemParsed = { name: 'Sữa', quantity: 2, unit_price: 3_500_000, line_total: 7_000_000, note: null }; // 35k ×2 = 70k (in minor units)
  it('passes when arithmetic matches', () => {
    expect(sanityCheckBillItem(ok).level).toBe('ok');
  });

  it('warns when line_total lệch quantity × unit_price > 5%', () => {
    const wrong: BillItemParsed = { ...ok, line_total: 5_000_000 }; // expected 7.000.000
    const r = sanityCheckBillItem(wrong);
    expect(r.level).toBe('warning');
    if (r.level === 'warning') {
      expect(r.reason).toMatch(/lệch phép tính/);
    }
  });

  it('errors when name is empty', () => {
    const r = sanityCheckBillItem({ ...ok, name: '' });
    expect(r.level).toBe('error');
  });

  it('errors when amount is negative', () => {
    const r = sanityCheckBillItem({ ...ok, unit_price: -1 });
    expect(r.level).toBe('error');
  });

  it('warns when both unit_price and line_total are 0', () => {
    const r = sanityCheckBillItem({ ...ok, unit_price: 0, line_total: 0 });
    expect(r.level).toBe('warning');
  });
});

describe('sanityCheckBillTotal', () => {
  const items: BillItemParsed[] = [
    { name: 'A', quantity: 1, unit_price: 5_000_000, line_total: 5_000_000, note: null },
    { name: 'B', quantity: 2, unit_price: 2_500_000, line_total: 5_000_000, note: null },
  ];

  it('returns ok when sum matches declared', () => {
    const r = sanityCheckBillTotal(items, 10_000_000);
    expect(r.level).toBe('ok');
    expect(r.computed).toBe(10_000_000);
  });

  it('returns ok within ±10.000đ tolerance', () => {
    // Tolerance = 1.000.000 minor (10.000₫). Diff 500.000 minor (5.000₫) → ok
    const r = sanityCheckBillTotal(items, 10_500_000);
    expect(r.level).toBe('ok');
  });

  it('returns ok at exact ±10.000đ boundary', () => {
    // Diff 1.000.000 minor (= 10.000₫) — boundary, condition is > tolerance → ok
    const r = sanityCheckBillTotal(items, 11_000_000);
    expect(r.level).toBe('ok');
  });

  it('warns when diff > 10.000đ (= 1.000.000 minor)', () => {
    const r = sanityCheckBillTotal(items, 20_000_000); // lệch 10.000.000 minor = 100.000₫
    expect(r.level).toBe('warning');
    if (r.level === 'warning') {
      expect(r.reason).toMatch(/lệch/);
    }
  });

  it('handles null declared total (AI không đọc được)', () => {
    const r = sanityCheckBillTotal(items, null);
    expect(r.level).toBe('ok');
    expect(r.computed).toBe(10_000_000);
  });
});
