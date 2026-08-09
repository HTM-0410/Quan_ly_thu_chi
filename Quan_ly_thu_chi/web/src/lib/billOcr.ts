// =============================================================
// Bill OCR client — Gemini Vision cho bill siêu thị / hoá đơn.
// Tương tự ocr.ts nhưng schema khác (line items + total).
// Implementation self-contained để không vướng coupling với ocr.ts.
// =============================================================

import {
  GEMINI_API_KEY,
  OCR_MODEL,
  IS_PROD,
  MissingOcrConfigError,
} from './config';
import {
  BILL_GEMINI_RESPONSE_SCHEMA,
  validateBillParseResult,
  BillOcrParseError,
  type BillParseResult,
} from './billOcrSchema';

export { BillOcrParseError } from './billOcrSchema';
export {
  sanityCheckBillItem,
  sanityCheckBillTotal,
  type BillItemSanity,
} from './billOcrSchema';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** HTTP error do Gemini trả — UI có thể dùng status để retry/backoff. */
export class BillOcrHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`Gemini API ${status}: ${truncate(bodyText, 200)}`);
    this.name = 'BillOcrHttpError';
  }
}

async function callGeminiWithRetry(args: {
  url: string;
  body: unknown;
  maxRetries: number;
}): Promise<unknown> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= args.maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(args.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args.body),
      });
    } catch (networkErr) {
      lastErr = networkErr;
      if (attempt < args.maxRetries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new BillOcrParseError(
        'Không kết nối được Gemini (mất mạng hoặc bị chặn CORS). Thử lại sau.',
        networkErr,
      );
    }

    if (res.ok) {
      if (!IS_PROD) {
        // eslint-disable-next-line no-console
        console.log(`[billOcr] ✅ Gemini OK (model=${OCR_MODEL}, attempt=${attempt + 1})`);
      }
      return await res.json();
    }

    const text = await safeText(res);

    if (!IS_PROD) {
      // eslint-disable-next-line no-console
      console.error(`[billOcr] ❌ Gemini HTTP ${res.status}: ${truncate(text, 500)}`);
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = new BillOcrHttpError(res.status, text);
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const wait = retryAfter ?? 1000 * 2 ** attempt;
      if (attempt < args.maxRetries) {
        await sleep(Math.min(wait, 10_000));
        continue;
      }
    }
    throw new BillOcrHttpError(res.status, text);
  }

  throw lastErr instanceof Error
    ? lastErr
    : new BillOcrParseError('Hết lượt thử lại');
}

/**
 * Nén ảnh xuống tối đa `maxDim` ở chiều dài nhất, encode base64 + giữ MIME gốc.
 */
async function fileToCompressedBase64(
  file: File,
  maxDim = 1600,
): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.readAsDataURL(file);
  });

  const { mime, base64 } = splitDataUrl(dataUrl);
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) {
    throw new BillOcrParseError(`Định dạng ảnh không hỗ trợ: ${mime}. Dùng JPEG/PNG/WebP.`);
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new BillOcrParseError('Ảnh quá lớn (>8MB). Vui lòng nén hoặc chọn ảnh khác.');
  }

  const img = await loadImage(dataUrl);
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { base64, mime };
  }
  ctx.drawImage(img, 0, 0, w, h);
  const outMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
  const outDataUrl = canvas.toDataURL(outMime, outMime === 'image/jpeg' ? 0.85 : undefined);
  const split = splitDataUrl(outDataUrl);
  return { base64: split.base64, mime: outMime };
}

function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new BillOcrParseError('File ảnh không hợp lệ');
  return { mime: m[1]!, base64: m[2]! };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new BillOcrParseError('Không giải mã được ảnh (file hỏng?)'));
    img.src = src;
  });
}

function safeText(res: Response): Promise<string> {
  return res.text().catch(() => '');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export interface ParseBillOptions {
  /** Override model (mặc định = OCR_MODEL từ config). */
  model?: string;
  /** Số retry tối đa khi 429/5xx. Mặc định 3. */
  maxRetries?: number;
}

const BILL_SYSTEM_PROMPT = `Bạn là trợ lý trích xuất danh sách sản phẩm từ ảnh bill siêu thị / hoá đơn mua sắm Việt Nam.

Nhiệm vụ:
- Đọc ảnh bill/hoá đơn người dùng gửi.
- Trích xuất từng dòng sản phẩm trong bill + tổng tiền cuối cùng.
- Trả về JSON đúng schema (xem response_schema). KHÔNG trả text ngoài JSON.

Quy tắc (BẮT BUỘC):
1. "items": mỗi sản phẩm = 1 dòng.
   - "name": tên sản phẩm (viết đầy đủ, có đơn vị nếu trên bill vd "Sữa tươi 1L", "Bánh mì sandwich").
   - "quantity": số lượng (số thập phân cho phép vd 0.5 kg, 1.2 lít).
   - "unit_price": đơn giá VND × 100. LUÔN DƯƠNG — lấy trị tuyệt đối.
   - "line_total": thành tiền dòng VND × 100. LUÔN DƯƠNG.
   - "note": mô tả ngắn nếu có (vd "giảm giá 20%"). null nếu không có.
2. "total": tổng cuối cùng cần thanh toán (VND × 100). LUÔN DƯƠNG. Bằng tổng các line_total ± phí/giảm giá cuối bill.
   - Ví dụ: bill có giảm giá 10.000₫ thì total = sum(line_total) - 10000 × 100.
   - Nếu bill ghi "Tổng cộng" / "Thanh toán" → dùng số đó.
   - Nếu không thấy → trả null.
3. Số tiền LUÔN DƯƠNG. BỎ dấu chấm (.) và phẩy (,) phân cách hàng nghìn trước khi nhân 100.
   - Ví dụ: "35.000₫" → 3500000, "1.500.000 VND" → 150000000.
4. "store_name": tên cửa hàng / siêu thị nếu đọc được. null nếu không rõ.
5. "purchased_at": ISO "YYYY-MM-DD HH:mm" hoặc null. Không có thông tin ngày → null.
6. "image_quality": "good" / "blurry" / "partial".
7. "notes": ghi chú cho user (vd "5 dòng bị che"). null nếu không có.

Ví dụ:
---
Ảnh bill Co.opmart:
CO.OPMART
02/08/2026 14:30
Sữa tươi 1L       x 2   70.000
Bánh mì sandwich   x 1   25.000
Nước ngọt Pepsi    x 3   45.000
Tổng cộng:                  140.000₫
---
→ {"items":[
  {"name":"Sữa tươi 1L","quantity":2,"unit_price":35000,"line_total":70000,"note":null},
  {"name":"Bánh mì sandwich","quantity":1,"unit_price":25000,"line_total":25000,"note":null},
  {"name":"Nước ngọt Pepsi","quantity":3,"unit_price":15000,"line_total":45000,"note":null}
],"total":14000000,"store_name":"Co.opmart","purchased_at":"2026-08-02 14:30","image_quality":"good","notes":null}

Ảnh bill Shopee online (không có tên cửa hàng offline):
---
Đơn hàng #123456
Sạc dự phòng 20000mAh  x 1  350.000₫
Ốp iPhone 15 Pro       x 2  120.000₫
Phí vận chuyển: 25.000₫
Tổng thanh toán: 615.000₫
---
→ {"items":[
  {"name":"Sạc dự phòng 20000mAh","quantity":1,"unit_price":350000,"line_total":350000,"note":null},
  {"name":"Ốp iPhone 15 Pro","quantity":2,"unit_price":60000,"line_total":120000,"note":null},
  {"name":"Phí vận chuyển","quantity":1,"unit_price":25000,"line_total":25000,"note":"Phí ship"}
],"total":61500000,"store_name":null,"purchased_at":null,"image_quality":"good","notes":null}

Nếu ảnh không phải bill (ảnh chụp người, cảnh vật, ...) → {"items":[],"total":null,"store_name":null,"purchased_at":null,"image_quality":"good","notes":"Không phát hiện sản phẩm trong ảnh"}`;

/**
 * Parse 1 ảnh bill → trả về BillParseResult đã validate.
 * Throw MissingOcrConfigError khi thiếu API key.
 */
export async function parseBillFromImage(
  file: File,
  opts: ParseBillOptions = {},
): Promise<BillParseResult> {
  if (!GEMINI_API_KEY) throw new MissingOcrConfigError();

  const { base64, mime } = await fileToCompressedBase64(file);
  const model = opts.model ?? OCR_MODEL;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: BILL_SYSTEM_PROMPT },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: BILL_GEMINI_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  };

  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const json = await callGeminiWithRetry({
    url,
    body: requestBody,
    maxRetries: opts.maxRetries ?? 3,
  });

  const parsed = unwrapGeminiJson(json);
  const validated = validateBillParseResult(parsed);

  if (!IS_PROD) {
    // eslint-disable-next-line no-console
    console.log(
      `[billOcr] 📦 parsed ${validated.items.length} items, total=${validated.total}`,
    );
  }

  return validated;
}

function unwrapGeminiJson(json: unknown): unknown {
  if (!json || typeof json !== 'object') {
    throw new BillOcrParseError('Response Gemini không hợp lệ (không phải object)');
  }
  const candidates = (json as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new BillOcrParseError('Response Gemini không có candidates');
  }
  const first = candidates[0] as {
    content?: { parts?: Array<{ text?: string }> };
  };
  const parts = first?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new BillOcrParseError('Response Gemini rỗng parts');
  }
  const text = parts[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new BillOcrParseError('Response Gemini không có text');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new BillOcrParseError('Response Gemini không phải JSON hợp lệ', err);
  }
}
