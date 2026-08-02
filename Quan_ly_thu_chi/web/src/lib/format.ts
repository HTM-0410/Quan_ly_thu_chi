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