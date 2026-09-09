import { formatDateTime, formatVND } from './format';
import { TRANSACTION_TYPE_LABEL } from './labels';
import type { Transaction } from './types';

/**
 * Làm sạch ô dữ liệu CSV và phòng chống tấn công Formula Injection (CSV Injection).
 * Các ô text bắt đầu bằng =, +, -, @, \t, \r sẽ được thêm tiền tố dấu nháy đơn '
 * để spreadsheet (Excel, Google Sheets, LibreOffice) không tự động thực thi công thức hoặc lệnh shell.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value == null) return '';

  if (typeof value === 'number') {
    return String(value);
  }

  let str = String(value);

  // Chống Formula Injection cho chuỗi văn bản
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Nếu chuỗi chứa dấu phẩy, nháy kép hoặc xuống dòng thì cần bọc trong cặp nháy kép
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export interface CsvContext {
  accountMap: ReadonlyMap<string, string>;
  categoryMap: ReadonlyMap<string, string>;
}

/**
 * Sinh chuỗi CSV có UTF-8 BOM (\uFEFF) cho danh sách giao dịch.
 */
export function generateTransactionsCsv(
  transactions: Transaction[],
  ctx: CsvContext,
): string {
  const headers = [
    'Mã giao dịch',
    'Thời gian',
    'Loại giao dịch',
    'Số tiền (VND)',
    'Tài khoản',
    'Danh mục',
    'Đối tác / Người nhận',
    'Ghi chú',
    'Trạng thái',
  ];

  const rows: string[] = [];
  rows.push(headers.map(sanitizeCsvCell).join(','));

  for (const t of transactions) {
    let accName = '—';
    if (t.type === 'transfer') {
      const from = ctx.accountMap.get(t.from_account_id ?? '') ?? '—';
      const to = ctx.accountMap.get(t.to_account_id ?? '') ?? '—';
      accName = `${from} → ${to}`;
    } else if (t.account_id) {
      accName = ctx.accountMap.get(t.account_id) ?? '—';
    }

    const catName = t.category_id ? (ctx.categoryMap.get(t.category_id) ?? 'Chưa phân loại') : 'Chưa phân loại';
    const typeName = TRANSACTION_TYPE_LABEL[t.type] ?? t.type;
    const statusName = t.status === 'voided' ? 'Đã hủy' : 'Hoàn tất';

    const row = [
      t.id,
      formatDateTime(t.occurred_at),
      typeName,
      formatVND(t.amount_minor),
      accName,
      catName,
      t.payee ?? '',
      t.note ?? '',
      statusName,
    ];

    rows.push(row.map(sanitizeCsvCell).join(','));
  }

  // Bắt buộc UTF-8 BOM để Excel hiển thị đúng tiếng Việt không bị lỗi font (Mojibake)
  return `\uFEFF${rows.join('\r\n')}`;
}

/**
 * Tải file CSV xuống trình duyệt người dùng một cách an toàn.
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
