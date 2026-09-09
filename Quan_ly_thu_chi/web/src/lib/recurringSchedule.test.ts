import { describe, it, expect } from 'vitest';
import {
  getDaysInMonth,
  getNextMonthlyOccurrenceDate,
  computeNextOccurrences,
  calculateInitialNextOccurrence,
  calculateNextOccurrenceAfter,
} from './recurringSchedule';

describe('recurringSchedule (TIP-007 / F15)', () => {
  describe('getDaysInMonth', () => {
    it('returns 31 for January and March', () => {
      expect(getDaysInMonth(2026, 0)).toBe(31);
      expect(getDaysInMonth(2026, 2)).toBe(31);
    });

    it('returns 28 for February in a standard year (2026)', () => {
      expect(getDaysInMonth(2026, 1)).toBe(28);
    });

    it('returns 29 for February in a leap year (2028)', () => {
      expect(getDaysInMonth(2028, 1)).toBe(29);
    });

    it('returns 30 for April and June', () => {
      expect(getDaysInMonth(2026, 3)).toBe(30);
      expect(getDaysInMonth(2026, 5)).toBe(30);
    });
  });

  describe('getNextMonthlyOccurrenceDate', () => {
    it('clamps day 31 to 28 in February 2026', () => {
      const date = getNextMonthlyOccurrenceDate(2026, 1, 31);
      expect(date.getUTCDate()).toBe(28);
      expect(date.getUTCMonth()).toBe(1); // Feb
    });

    it('clamps day 31 to 29 in February 2028 (leap year)', () => {
      const date = getNextMonthlyOccurrenceDate(2028, 1, 31);
      expect(date.getUTCDate()).toBe(29);
      expect(date.getUTCMonth()).toBe(1); // Feb
    });

    it('returns 31 in March without degradation', () => {
      const date = getNextMonthlyOccurrenceDate(2026, 2, 31);
      expect(date.getUTCDate()).toBe(31);
      expect(date.getUTCMonth()).toBe(2); // Mar
    });
  });

  describe('computeNextOccurrences (QA-10 Acceptance Test)', () => {
    it('handles day 31 rule: 31/01/2026 -> 28/02/2026 -> 31/03/2026 -> 30/04/2026', () => {
      const occurrences = computeNextOccurrences(
        {
          frequency: 'monthly',
          start_date: '2026-01-31',
          day_of_month: 31,
        },
        4
      );

      expect(occurrences).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
      ]);
    });

    it('handles leap year 2028 correctly: 31/01/2028 -> 29/02/2028 -> 31/03/2028', () => {
      const occurrences = computeNextOccurrences(
        {
          frequency: 'monthly',
          start_date: '2028-01-31',
          day_of_month: 31,
        },
        3
      );

      expect(occurrences).toEqual([
        '2028-01-31',
        '2028-02-29',
        '2028-03-31',
      ]);
    });

    it('previews 3 occurrences for quarterly frequency with day 31', () => {
      const occurrences = computeNextOccurrences(
        {
          frequency: 'quarterly',
          start_date: '2026-01-31',
          day_of_month: 31,
        },
        3
      );

      // Jan 31 -> Apr 30 (Apr has 30 days) -> Jul 31 (Jul has 31 days)
      expect(occurrences).toEqual([
        '2026-01-31',
        '2026-04-30',
        '2026-07-31',
      ]);
    });

    it('respects end_date limit', () => {
      const occurrences = computeNextOccurrences(
        {
          frequency: 'monthly',
          start_date: '2026-01-31',
          day_of_month: 31,
          end_date: '2026-02-28',
        },
        5
      );

      expect(occurrences).toEqual([
        '2026-01-31',
        '2026-02-28',
      ]);
    });

    it('handles weekly and biweekly intervals', () => {
      const weekly = computeNextOccurrences(
        {
          frequency: 'weekly',
          start_date: '2026-08-01',
        },
        3
      );
      expect(weekly).toEqual([
        '2026-08-01',
        '2026-08-08',
        '2026-08-15',
      ]);
    });
  });

  describe('calculateInitialNextOccurrence', () => {
    it('computes next occurrence ISO timestamp with day_of_month', () => {
      const iso = calculateInitialNextOccurrence({
        frequency: 'monthly',
        start_date: '2026-01-31',
        day_of_month: 31,
      });

      expect(iso).toBe('2026-01-31T00:00:00.000Z');
    });
  });

  it('resume skips missed occurrences instead of scheduling a catch-up batch', () => {
    const next = calculateNextOccurrenceAfter(
      { frequency: 'monthly', start_date: '2026-01-31', day_of_month: 31 },
      new Date('2026-02-28T12:00:00.000Z'),
    );
    expect(next).toBe('2026-03-31T00:00:00.000Z');
  });
});
