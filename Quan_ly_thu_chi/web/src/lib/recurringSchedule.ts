import type { RecurringFrequency } from './types';

/**
 * Trả về số ngày trong một tháng cụ thể (theo năm và tháng 0-indexed).
 * Xử lý chính xác năm nhuận (tháng 2 có 28 hoặc 29 ngày).
 */
export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Tính toán ngày xảy ra tiếp theo cho chu kỳ tháng/quý/năm với target day_of_month cố định.
 * Nguyên tắc: Luôn giữ target day_of_month gốc (ví dụ 31).
 * Khi gặp tháng thiếu ngày (tháng 2 có 28/29 ngày, tháng 4 có 30 ngày), kẹp về ngày cuối tháng đó.
 * Sang tháng tiếp theo có đủ 31 ngày, tự động khôi phục về ngày 31.
 */
export function getNextMonthlyOccurrenceDate(
  year: number,
  monthIndex: number,
  targetDay: number,
): Date {
  const maxDays = getDaysInMonth(year, monthIndex);
  const actualDay = Math.min(targetDay, maxDays);
  return new Date(Date.UTC(year, monthIndex, actualDay));
}

export interface RecurringScheduleInput {
  frequency: RecurringFrequency;
  start_date: string; // YYYY-MM-DD
  day_of_month?: number | null;
  day_of_week?: number | null;
  end_date?: string | null;
}

/**
 * Tính toán danh sách `count` kỳ tiếp theo của một quy tắc định kỳ.
 * Dùng để preview trong UI (AC-007-3) và đối soát lịch.
 */
export function computeNextOccurrences(
  input: RecurringScheduleInput,
  count = 3,
  fromDateStr?: string,
): string[] {
  if (count <= 0) return [];

  // Parse start_date
  const [sYear, sMonth, sDay] = input.start_date.split('-').map(Number) as [number, number, number];
  if (!sYear || !sMonth || !sDay) return [];

  const targetDay = input.day_of_month && input.day_of_month >= 1 && input.day_of_month <= 31
    ? input.day_of_month
    : sDay;

  const endDate = input.end_date ? new Date(input.end_date + 'T23:59:59Z') : null;
  const fromDate = fromDateStr ? new Date(fromDateStr + 'T00:00:00Z') : new Date(input.start_date + 'T00:00:00Z');

  const occurrences: string[] = [];
  const freq = input.frequency;

  if (freq === 'daily') {
    let curr = new Date(Date.UTC(sYear, sMonth - 1, sDay));
    while (curr < fromDate) {
      curr = new Date(curr.getTime() + 86400000);
    }
    while (occurrences.length < count) {
      if (endDate && curr > endDate) break;
      occurrences.push(curr.toISOString().slice(0, 10));
      curr = new Date(curr.getTime() + 86400000);
    }
  } else if (freq === 'weekly' || freq === 'biweekly') {
    const stepDays = freq === 'weekly' ? 7 : 14;
    let curr = new Date(Date.UTC(sYear, sMonth - 1, sDay));
    while (curr < fromDate) {
      curr = new Date(curr.getTime() + stepDays * 86400000);
    }
    while (occurrences.length < count) {
      if (endDate && curr > endDate) break;
      occurrences.push(curr.toISOString().slice(0, 10));
      curr = new Date(curr.getTime() + stepDays * 86400000);
    }
  } else {
    // monthly, quarterly, yearly
    const stepMonths = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12;
    let currYear = sYear;
    let currMonthIndex = sMonth - 1;

    // Nếu targetDay < sDay ban đầu, chu kỳ đầu tiên rơi vào tháng kế tiếp
    if (targetDay < sDay && (!fromDateStr || fromDate <= new Date(input.start_date + 'T00:00:00Z'))) {
      currMonthIndex += stepMonths;
      while (currMonthIndex >= 12) {
        currMonthIndex -= 12;
        currYear += 1;
      }
    }

    while (occurrences.length < count) {
      const occDate = getNextMonthlyOccurrenceDate(currYear, currMonthIndex, targetDay);

      if (occDate >= fromDate) {
        if (endDate && occDate > endDate) break;
        occurrences.push(occDate.toISOString().slice(0, 10));
      }

      currMonthIndex += stepMonths;
      while (currMonthIndex >= 12) {
        currMonthIndex -= 12;
        currYear += 1;
      }

      // Giới hạn an toàn chống lặp vô hạn
      if (currYear > sYear + 50) break;
    }
  }

  return occurrences;
}

/**
 * Tính `next_occurrence` (ISO timestamptz) khi tạo hoặc sửa quy tắc.
 */
export function calculateInitialNextOccurrence(
  input: RecurringScheduleInput,
): string {
  const occurrences = computeNextOccurrences(input, 1);
  if (occurrences.length > 0) {
    return new Date(occurrences[0]! + 'T00:00:00Z').toISOString();
  }
  return new Date(input.start_date + 'T00:00:00Z').toISOString();
}

/**
 * Tính kỳ kế tiếp kể từ một mốc ngày, dùng khi resume để không tự ghi bù
 * toàn bộ các kỳ đã bỏ lỡ trong thời gian pause.
 */
export function calculateNextOccurrenceAfter(
  input: RecurringScheduleInput,
  after = new Date(),
): string {
  const afterDate = new Date(after.getTime() + 24 * 60 * 60 * 1000);
  const fromDate = afterDate.toISOString().slice(0, 10);
  const occurrences = computeNextOccurrences(input, 1, fromDate);
  return occurrences.length > 0
    ? new Date(occurrences[0]! + 'T00:00:00Z').toISOString()
    : afterDate.toISOString();
}
