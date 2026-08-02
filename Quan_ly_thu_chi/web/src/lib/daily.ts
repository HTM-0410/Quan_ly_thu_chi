import type { Transaction } from './types';

/**
 * Format số tiền minor (VND, amount_minor / 100 = VND) thành dạng compact, dễ đọc trong không gian nhỏ (ô heatmap).
 * - 0          → "0"
 * - 1.000 ₫    → "1k"
 * - 1.500.000  → "1.5tr"
 * - 23.000.000 → "23tr"
 * - 1.200.000.000 → "1.2tỷ"
 */
export function compactVNDMinor(minor: number): string {
  if (!Number.isFinite(minor) || minor <= 0) return '0';
  const vnd = minor / 100; // VND major
  if (vnd < 1_000_000) {
    const k = vnd / 1000;
    if (k < 1) return '<1k';
    return `${Math.round(k)}k`;
  }
  if (vnd < 1_000_000_000) {
    const tr = vnd / 1_000_000;
    const rounded = Math.round(tr * 10) / 10;
    return `${rounded}tr`;
  }
  const ty = vnd / 1_000_000_000;
  const roundedTy = Math.round(ty * 10) / 10;
  return `${roundedTy}tỷ`;
}

export interface DailyExpense {
  /** Ngày local (YYYY-MM-DD). */
  date: string;
  /** Tổng chi tiêu ngày đó (minor). */
  amount_minor: number;
  /** Số giao dịch. */
  count: number;
}

/**
 * Nhóm transactions theo ngày local (theo timezone trình duyệt),
 * chỉ tính expense (type = 'expense', status = 'posted').
 * Trả về Map<date, DailyExpense> đã sort theo date asc.
 */
export function groupByDay(transactions: Transaction[]): Map<string, DailyExpense> {
  const map = new Map<string, DailyExpense>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.status === 'voided') continue;
    const d = new Date(t.occurred_at);
    const key = localDateKey(d);
    const existing = map.get(key);
    if (existing) {
      existing.amount_minor += t.amount_minor;
      existing.count += 1;
    } else {
      map.set(key, { date: key, amount_minor: t.amount_minor, count: 1 });
    }
  }
  return map;
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Trả về cấu trúc calendar grid cho 1 tháng: mỗi tuần là 1 row 7 cột (T2-CN).
 * Bao gồm cả các ngày trước/sau tháng (placeholder) để grid đầy đủ.
 */
export interface CalendarCell {
  date: string | null; // null = placeholder (không thuộc tháng)
  day: number;
  amount_minor: number;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

export function buildMonthGrid(
  year: number,
  monthIndex: number, // 0-11
  expenses: Map<string, DailyExpense>,
): CalendarCell[][] {
  // weekday của ngày 1: CN=0, T2=1, ...; convert sang T2=0
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date();
  const todayKey = localDateKey(today);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;

  const cells: CalendarCell[] = [];
  // Placeholder đầu tháng
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: null, day: 0, amount_minor: 0, count: 0, isToday: false, isFuture: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d);
    const key = localDateKey(dt);
    const data = expenses.get(key);
    const isFuture = isCurrentMonth && key > todayKey;
    cells.push({
      date: key,
      day: d,
      amount_minor: data?.amount_minor ?? 0,
      count: data?.count ?? 0,
      isToday: key === todayKey,
      isFuture,
    });
  }
  // Chia thành rows 7 cột. Nếu tuần cuối không đủ 7 cell thì pad null.
  const rows: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    while (row.length < 7) row.push({ date: null, day: 0, amount_minor: 0, count: 0, isToday: false, isFuture: false });
    rows.push(row);
  }
  return rows;
}

/** Top N ngày chi nhiều nhất (chỉ trong tháng đang xét). */
export function topSpendDays(
  expenses: Map<string, DailyExpense>,
  limit = 5,
): DailyExpense[] {
  return Array.from(expenses.values())
    .sort((a, b) => b.amount_minor - a.amount_minor)
    .slice(0, limit);
}

export interface MonthStats {
  total_minor: number;
  average_per_day: number;
  max_day: DailyExpense | null;
  active_days: number;
}

/**
 * Tính các chỉ số tổng hợp cho 1 tháng.
 * `daysInMonth` dùng để tính trung bình (chia cho số ngày đã qua nếu là tháng hiện tại).
 */
export function computeMonthStats(
  expenses: Map<string, DailyExpense>,
  year: number,
  monthIndex: number,
): MonthStats {
  const total = Array.from(expenses.values()).reduce((sum, d) => sum + d.amount_minor, 0);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const divisor = isCurrentMonth ? today.getDate() : daysInMonth;

  const all = Array.from(expenses.values()).sort((a, b) => b.amount_minor - a.amount_minor);
  return {
    total_minor: total,
    average_per_day: divisor > 0 ? Math.round(total / divisor) : 0,
    max_day: all[0] && all[0].amount_minor > 0 ? all[0] : null,
    active_days: expenses.size,
  };
}

/**
 * Index transactions theo ngày local: Map<date, Transaction[]>.
 * Dùng cho modal DayDetail để lookup nhanh không cần fetch lại.
 */
export function indexByDay(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.status === 'voided') continue;
    const d = new Date(t.occurred_at);
    const key = localDateKey(d);
    const arr = map.get(key);
    if (arr) arr.push(t);
    else map.set(key, [t]);
  }
  // Sort mỗi ngày theo thời gian tăng dần
  for (const arr of map.values()) {
    arr.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  }
  return map;
}