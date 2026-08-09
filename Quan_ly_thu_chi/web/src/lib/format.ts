// ============================================================
// Error handling
// ============================================================

interface SupabaseError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

/**
 * Unwrap various error types into a human-readable string.
 * Handles Error, Supabase PostgrestError, string, and unknown objects.
 */
export function unwrapError(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  const err = e as SupabaseError;
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  if (err.details) parts.push(err.details);
  if (err.hint) parts.push(err.hint);
  if (err.code && !parts.some(p => p.includes(err.code!))) parts.push(err.code);
  return parts.length > 0 ? parts.join(' | ') : String(e);
}

// ============================================================
// Currency formatting
// ============================================================

export function formatVND(minor: number, currency = 'VND'): string {
  const major = (minor ?? 0) / 100;
  const formatted = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(major);
  if (currency === 'VND') return `${formatted} ₫`;
  return `${formatted} ${currency}`;
}

export function parseVNDInput(input: string): number {
  const cleaned = input.replace(/[^\d-]/g, '');
  const major = Number(cleaned || '0');
  return Math.round(major * 100);
}

/** Format số tiền (major units, VND) với dấu chấm phân cách hàng nghìn theo locale vi-VN. */
export function formatVNDInput(major: number | string): string {
  const n = typeof major === 'string' ? Number(major.replace(/[^\d-]/g, '')) : major;
  if (!Number.isFinite(n)) return '';
  // Không dùng Intl khi n===0 để hiển thị "0" thay vì "-0" trên một số trình duyệt
  if (n === 0) return '0';
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(n);
}

/** Lấy chuỗi chỉ chứa chữ số từ input. */
export function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, '');
}

/**
 * Trả về offset (phút) của `timezone` tại thời điểm UTC `atUtc`.
 * Ví dụ: tzOffsetMinutes('Asia/Ho_Chi_Minh', new Date('2026-08-03T00:00:00Z')) = -420
 * (UTC+7 nghĩa là local = UTC + 7h, nên offset từ UTC về local là -420 phút).
 */
export function tzOffsetMinutes(timezone: string, atUtc: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(atUtc);
    const get = (type: string): number => {
      const v = parts.find(p => p.type === type)?.value;
      if (v === undefined) return 0;
      return Number(v);
    };
    const year = get('year');
    const month = get('month');
    const day = get('day');
    // Hour "24" có thể xuất hiện ở biên DST — chuẩn hoá về 0.
    const hour = get('hour') % 24;
    const minute = get('minute');
    const second = get('second');
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return (asUtc - atUtc.getTime()) / 60_000;
  } catch {
    return 0;
  }
}

/**
 * Convert ngày local (theo `timezone` IANA) sang `Date` UTC tương ứng.
 * Dùng để build query boundary chính xác cho RPC dùng TIMESTAMPTZ.
 * Ví dụ: localToUtc(2026, 7, 1, 0, 0, 'Asia/Ho_Chi_Minh')
 *  → 2026-07-01 00:00:00 local = 2026-06-30 17:00:00 UTC.
 */
export function localToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Lần 1: coi input như UTC để xác định offset mà timezone áp dụng.
  const approx = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  const offsetMin = tzOffsetMinutes(timezone, approx);
  // Trừ offset để ra UTC thật.
  return new Date(approx.getTime() - offsetMin * 60_000);
}

/**
 * Trả về [start, end) của 1 tháng local theo `timezone` IANA, dưới dạng Date UTC.
 * `end` là midnight local của tháng kế tiếp (exclusive).
 */
export function monthRangeInTz(
  year: number,
  monthIndex: number,
  timezone: string,
): { start: Date; end: Date } {
  const start = localToUtc(year, monthIndex, 1, 0, 0, timezone);
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const end = localToUtc(nextYear, nextMonth, 1, 0, 0, timezone);
  return { start, end };
}

/** Format YYYY-MM-DD theo local date components (không qua UTC). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    console.warn('[fmt] toLocalDateTimeInput: invalid date input', iso);
    return '';
  }
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  // eslint-disable-next-line no-console
  console.debug('[fmt] toLocalDateTimeInput', { input: iso, parsedUTC: d.toISOString(), offsetMin: off, output: local.toISOString().slice(0, 16) });
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(local: string): string {
  if (!local) return new Date().toISOString();
  return new Date(local).toISOString();
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}