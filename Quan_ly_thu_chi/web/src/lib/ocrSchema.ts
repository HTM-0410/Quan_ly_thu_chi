// =============================================================
// OCR result schema — validate JSON Gemini trả về.
// Centralize toàn bộ shape ở đây để:
//   - Cùng schema dùng cho Zod (TS runtime) + Gemini response_schema (API)
//   - Single source of truth cho mapping sang Transaction
// =============================================================

import { z } from 'zod';

export const OCR_SCHEMA_VERSION = 1 as const;
export const MAX_OCR_AMOUNT_MINOR = 10_000_000_000_000;

/** Một giao dịch trích xuất từ ảnh. */
export const OcrTransactionSchema = z.object({
  // ISO local (YYYY-MM-DDTHH:mm:ss) hoặc ISO có offset. Cũng chấp nhận date-only.
  occurred_at: z.string().min(10, 'Thiếu ngày giao dịch'),
  type: z.enum(['income', 'expense']),
  // VND nhân 100 (minor). Bắt buộc dương.
  // Preprocess:
  //   - AI thỉnh thoảng trả VND thẳng (vd 130000 thay vì 13000000) → auto ×100.
  //   - AI đôi khi không đọc được số tiền → trả 0; vẫn chấp nhận (nonnegative),
  //     sanity check sẽ hạ xuống warning, modal cho phép user nhập tay.
  amount_minor: z.preprocess(
    (raw) => {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0) return n;
      // Nếu < 100_000 và >= 1_000 → AI chưa nhân 100.
      if (n < 100_000 && n >= 1_000) return Math.round(n * 100);
      return n;
    },
    z
      .number()
      .int('Số tiền phải là số nguyên (VND multiplied by 100 — minor unit)')
      .positive('Số tiền phải lớn hơn 0')
      .max(MAX_OCR_AMOUNT_MINOR, 'Số tiền quá lớn'),
  ),
  currency: z.literal('VND').default('VND'),
  payee: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  suggested_category: z.string().nullable().optional(),
  account_hint: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  /**
   * Số dư tài khoản SAU giao dịch (VND × 100, optional). Nếu model trích được,
   * app sẽ tự check arithmetic (balance_before + amount_minor × sign = balance_after)
   * và cảnh báo khi không khớp — là fallback khi model đọc sai dấu.
   */
  balance_after_minor: z.number().int().nonnegative().optional(),
});

export const OcrResultSchema = z.object({
  transactions: z.array(OcrTransactionSchema).max(50, 'Tối đa 50 giao dịch / ảnh'),
  image_quality: z.enum(['good', 'blurry', 'partial']).default('good'),
  notes: z.string().nullable().optional(),
});

export type OcrTransaction = z.infer<typeof OcrTransactionSchema>;
export type OcrResult = z.infer<typeof OcrResultSchema>;

/**
 * Kết quả kiểm tra chéo 1 transaction.
 * - ok: không phát hiện bất thường
 * - warning: có dấu hiệu đáng ngờ — UI nên cảnh báo nhưng vẫn cho import
 * - error: chắc chắn sai (vd amount = 0) — UI nên chặn import
 */
export type SanityCheckResult =
  | { level: 'ok'; reason?: never }
  | { level: 'warning'; reason: string; suggestion?: Partial<OcrTransaction> }
  | { level: 'error'; reason: string };

/**
 * Kiểm tra chéo logic của 1 giao dịch OCR.
 *
 * Bắt 2 loại lỗi thường gặp:
 *   1. balance_after_minor < amount_minor → gợi ý model đọc sai dấu.
 *   2. type/số dư không khớp nhau (expense mà số dư tăng, income mà số dư giảm).
 *
 * Không throw — trả warning/error để UI xử lý mềm (không block cả batch).
 */
export function sanityCheckTransaction(
  tx: OcrTransaction,
  prevBalanceMinor?: number,
): SanityCheckResult {
  // Lỗi #1: amount = 0 hoặc rỗng → model không đọc được số tiền.
  // Hạ xuống warning thay vì error để user vẫn nhập tay được.
  // Import button vẫn disabled nếu amount_minor <= 0 (xem ReceiptImportModal filter).
  if (!tx.amount_minor || tx.amount_minor <= 0) {
    return {
      level: 'warning',
      reason: 'Số tiền = 0, model không đọc được số tiền — nhập tay trước khi lưu',
    };
  }

  // Lỗi #2: nếu có balance_after thì check arithmetic.
  if (tx.balance_after_minor !== undefined && prevBalanceMinor !== undefined) {
    const expectedAfter =
      tx.type === 'expense' ? prevBalanceMinor - tx.amount_minor : prevBalanceMinor + tx.amount_minor;
    const diff = Math.abs(expectedAfter - tx.balance_after_minor);
    // Tolerance ±1.000₫ = ±100.000 minor (vì round tiền hiển thị trên app).
    const tolerance = 100_000;
    if (diff > tolerance) {
      // Số dư không khớp → rất có thể type bị ngược.
      const flippedType: 'income' | 'expense' = tx.type === 'expense' ? 'income' : 'expense';
      const expectedAfterFlipped =
        flippedType === 'expense'
          ? prevBalanceMinor - tx.amount_minor
          : prevBalanceMinor + tx.amount_minor;
      if (Math.abs(expectedAfterFlipped - tx.balance_after_minor) <= tolerance) {
        return {
          level: 'warning',
          reason: `Số dư không khớp với loại "${tx.type}" — có thể model đọc sai dấu (nên là "${flippedType}")`,
          suggestion: { type: flippedType, balance_after_minor: tx.balance_after_minor },
        };
      }
      return {
        level: 'warning',
        reason: `Số dư ${tx.balance_after_minor / 100}₫ không khớp với phép tính (sai lệch ${(diff / 100).toLocaleString('vi-VN')}₫)`,
      };
    }
  }

  // Cảnh báo: confidence thấp.
  if (tx.confidence < 0.5) {
    return { level: 'warning', reason: 'AI đoán mò (confidence thấp), nên kiểm tra lại' };
  }

  return { level: 'ok' };
}

/** Custom error cho parse failure — UI bắt riêng để hiện message thân thiện. */
export class OcrParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'OcrParseError';
  }
}

/** Wrapper: validate + throw OcrParseError kèm message tiếng Việt. */
export function validateOcrResult(raw: unknown): OcrResult {
  try {
    return OcrResultSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      const path = first?.path?.join('.') ?? '';
      throw new OcrParseError(
        `Phản hồi AI không hợp lệ${path ? ` (${path})` : ''}: ${first?.message ?? 'unknown'}`,
        err,
      );
    }
    throw new OcrParseError('Không đọc được phản hồi AI', err);
  }
}

/** Build `response_schema` cho Gemini `generationConfig`. Đảm bảo shape khớp Zod.
 * Lưu ý: Chỉ liệt kê field mà Gemini BẮT BUỘC phải trả. Các field optional
 * (balance_after_minor, payee, note, ...) sẽ được parse lỏng từ text.
 * Lý do: Gemini đôi khi reject response_schema phức tạp với 500.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          occurred_at: { type: 'string' },
          type: { type: 'string', enum: ['income', 'expense'] },
          amount_minor: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_OCR_AMOUNT_MINOR,
            description: 'VND × 100. LUÔN DƯƠNG — lấy trị tuyệt đối của số trên ảnh.',
          },
        },
        required: ['occurred_at', 'type', 'amount_minor'],
      },
    },
  },
  required: ['transactions'],
} as const;

/**
 * Chuẩn hoá ISO datetime Gemini có thể trả — đảm bảo luôn là ISO UTC cho DB.
 * Input: "2026-07-29T14:23:00" hoặc "2026-07-29T14:23:00Z" hoặc "2026-07-29T14:23:00+07:00"
 * Output: ISO UTC string "2026-07-29T07:23:00.000Z" (giả định input là local time nếu không có offset).
 */
export function normalizeOcrOccurredAt(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString();

  // Đã có timezone (Z hoặc +hh:mm hoặc -hh:mm) → Date.parse hiểu được
  const hasTz = /[Zz]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed);
  const d = hasTz ? new Date(trimmed) : new Date(trimmed + '+07:00'); // mặc định GMT+7 cho VN
  if (isNaN(d.getTime())) {
    throw new OcrParseError(`Không parse được ngày: "${raw}"`);
  }
  return d.toISOString();
}
