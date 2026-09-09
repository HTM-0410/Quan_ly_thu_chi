// =============================================================
// Bill OCR result schema — validate JSON Gemini trả về cho bill siêu thị.
// Khác với ocrSchema.ts (extract transactions): bill OCR extract danh sách
// line items (product_name, quantity, unit_price, line_total).
// =============================================================

import { z } from 'zod';

export const BILL_SCHEMA_VERSION = 1 as const;

/** Một dòng sản phẩm trong bill. */
export const BillItemSchema = z.object({
  name: z.string().min(1, 'Tên sản phẩm trống'),
  quantity: z
    .preprocess(
      (raw) => {
        const n = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 1;
      },
      z.number().positive('Số lượng phải > 0'),
    )
    .default(1),
  // VND × 100 (minor unit). Tuân thủ nghiêm ngặt hợp đồng F13: không tự đoán nhân 100 theo ngưỡng.
  unit_price: z.preprocess(
    (raw) => {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0) return n;
      return Math.round(n);
    },
    z
      .number()
      .int('Đơn giá phải là số nguyên (VND × 100)')
      .nonnegative('Đơn giá không được âm'),
  ),
  // line_total = quantity × unit_price (minor unit).
  line_total: z.preprocess(
    (raw) => {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0) return n;
      return Math.round(n);
    },
    z
      .number()
      .int('Tổng dòng phải là số nguyên (VND × 100)')
      .nonnegative('Tổng dòng không được âm'),
  ),
  note: z.string().nullable().optional(),
});

export const BillParseResultSchema = z.object({
  store_name: z.string().nullable().optional(),
  purchased_at: z.string().nullable().optional(),
  items: z.array(BillItemSchema).max(200, 'Tối đa 200 dòng / bill'),
  // Tổng bill (VND × 100). Optional vì AI đôi khi không đọc được.
  total: z.preprocess(
    (raw) => {
      if (raw === null || raw === undefined) return null;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.round(n);
    },
    z.number().int().nonnegative().nullable(),
  ),
  image_quality: z.enum(['good', 'blurry', 'partial']).default('good'),
  notes: z.string().nullable().optional(),
});

export type BillItemParsed = z.infer<typeof BillItemSchema>;
export type BillParseResult = z.infer<typeof BillParseResultSchema>;

/**
 * Custom error cho parse failure — UI bắt riêng để hiện message thân thiện.
 */
export class BillOcrParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'BillOcrParseError';
  }
}

/** Wrapper: validate + throw BillOcrParseError kèm message tiếng Việt. */
export function validateBillParseResult(raw: unknown): BillParseResult {
  try {
    return BillParseResultSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      const path = first?.path?.join('.') ?? '';
      throw new BillOcrParseError(
        `Phản hồi AI không hợp lệ${path ? ` (${path})` : ''}: ${first?.message ?? 'unknown'}`,
        err,
      );
    }
    throw new BillOcrParseError('Không đọc được phản hồi AI cho bill', err);
  }
}

/**
 * Build `response_schema` cho Gemini `generationConfig`. Chỉ liệt kê field BẮT BUỘC.
 * Field optional sẽ được parse lỏng từ text (cùng lý do với ocrSchema.ts).
 */
export const BILL_GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number', description: 'Số lượng (số thập phân cho phép).' },
          unit_price: {
            type: 'integer',
            description: 'VND × 100. LUÔN DƯƠNG — lấy trị tuyệt đối.',
          },
          line_total: {
            type: 'integer',
            description: 'VND × 100. Tổng tiền dòng này (= quantity × unit_price).',
          },
        },
        required: ['name', 'unit_price', 'line_total'],
      },
    },
    total: {
      type: 'integer',
      description: 'VND × 100. Tổng cuối cùng của bill. LUÔN DƯƠNG.',
    },
  },
  required: ['items', 'total'],
} as const;

/**
 * Sanity check cho từng line item.
 *
 * Trả về level:
 * - 'ok': khớp
 * - 'warning': line_total lệch quantity × unit_price (sai số > 5%)
 * - 'error': amount = 0 hoặc thiếu tên
 */
export type BillItemSanity =
  | { level: 'ok' }
  | { level: 'warning'; reason: string }
  | { level: 'error'; reason: string };

export function sanityCheckBillItem(item: BillItemParsed): BillItemSanity {
  if (!item.name || item.name.trim().length === 0) {
    return { level: 'error', reason: 'Tên sản phẩm trống' };
  }
  if (item.unit_price < 0 || item.line_total < 0) {
    return { level: 'error', reason: 'Số tiền âm' };
  }
  if (item.unit_price === 0 && item.line_total === 0) {
    return { level: 'warning', reason: 'Số tiền = 0, cần nhập tay' };
  }
  // Check arithmetic: line_total ≈ quantity × unit_price
  if (item.quantity > 0 && item.unit_price > 0) {
    const expected = item.quantity * item.unit_price;
    const diff = Math.abs(expected - item.line_total);
    const tolerance = Math.max(expected * 0.05, 1000); // 5% hoặc 10₫ (1.000 minor)
    if (diff > tolerance) {
      return {
        level: 'warning',
        reason: `Tổng dòng ${(item.line_total / 100).toLocaleString('vi-VN')}₫ lệch phép tính (SL × ĐG = ${(expected / 100).toLocaleString('vi-VN')}₫)`,
      };
    }
  }
  return { level: 'ok' };
}

/**
 * Sanity check tổng bill.
 *
 * Tolerance ±10.000đ = 1.000.000 minor.
 */
export function sanityCheckBillTotal(
  items: BillItemParsed[],
  declaredTotal: number | null,
): { level: 'ok' | 'warning'; reason?: string; computed: number } {
  const computed = items.reduce((sum, it) => sum + it.line_total, 0);
  if (declaredTotal === null || declaredTotal === undefined) {
    return { level: 'ok', computed };
  }
  const diff = Math.abs(declaredTotal - computed);
  const TOLERANCE_MINOR = 1_000_000; // 10.000đ
  if (diff > TOLERANCE_MINOR) {
    return {
      level: 'warning',
      reason: `Tổng bill (${(declaredTotal / 100).toLocaleString('vi-VN')}₫) lệch tổng dòng (${(computed / 100).toLocaleString('vi-VN')}₫) ${(diff / 100).toLocaleString('vi-VN')}₫`,
      computed,
    };
  }
  return { level: 'ok', computed };
}
