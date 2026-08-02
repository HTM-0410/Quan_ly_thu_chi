import { describe, it, expect } from 'vitest';
import { formatVND, parseVNDInput } from './format';

describe('formatVND', () => {
  it('formats amounts with thousands separators and currency suffix', () => {
    // 123,456,789,00 minor = 123.456.789 VND
    expect(formatVND(123_456_789_00)).toMatch(/123\.456\.789\s?₫/);
  });

  it('formats zero with VND suffix', () => {
    expect(formatVND(0)).toMatch(/0\s?₫/);
  });

  it('formats negative amounts', () => {
    const out = formatVND(-50_000_00);
    expect(out).toContain('50.000');
  });

  it('respects custom currency', () => {
    expect(formatVND(99_99, 'USD')).toMatch(/USD$/);
  });
});

describe('parseVNDInput', () => {
  it('parses plain integer string', () => {
    expect(parseVNDInput('1000')).toBe(1000_00);
  });

  it('strips dot separators', () => {
    expect(parseVNDInput('1.234.567')).toBe(1_234_567_00);
  });

  it('strips comma separators', () => {
    expect(parseVNDInput('1,234,567')).toBe(1_234_567_00);
  });

  it('strips space separators', () => {
    expect(parseVNDInput('1 234 567')).toBe(1_234_567_00);
  });

  it('returns 0 for empty input', () => {
    expect(parseVNDInput('')).toBe(0);
    expect(parseVNDInput('   ')).toBe(0);
  });

  it('returns 0 for invalid input', () => {
    expect(parseVNDInput('abc')).toBe(0);
  });
});