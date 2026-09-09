// =============================================================
// OCR client — browser chỉ gọi same-origin Worker proxy.
// Không giữ provider secret, không gọi provider trực tiếp.
// =============================================================

import {
  MissingOcrConfigError,
} from './config';
import { supabase } from './supabase';
import { OCR_SYSTEM_PROMPT } from './ocrPrompt';
import {
  GEMINI_RESPONSE_SCHEMA,
  validateOcrResult,
  normalizeOcrOccurredAt,
  sanityCheckTransaction,
  OcrParseError,
  type OcrResult,
  type OcrTransaction,
} from './ocrSchema';

export { sanityCheckTransaction } from './ocrSchema';

/** HTTP error do OCR proxy trả — UI có thể dùng status để retry/backoff. */
export class OcrHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`OCR proxy ${status}: ${truncate(bodyText, 200)}`);
    this.name = 'OcrHttpError';
  }
}

/** Client gọi Gemini với retry tối đa `maxRetries` lần khi 429/5xx. */
async function callGeminiWithRetry(args: {
  url: string;
  body: unknown;
  maxRetries: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  let lastErr: unknown = null;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new MissingOcrConfigError('Bạn cần đăng nhập trước khi dùng OCR.');
  }

  for (let attempt = 0; attempt <= args.maxRetries; attempt++) {
    if (args.signal?.aborted) {
      throw new DOMException('Thao tác OCR đã bị huỷ.', 'AbortError');
    }

    let res: Response;
    const t0 = Date.now();
    try {
      // eslint-disable-next-line no-console
      console.log(`[ocr] Gửi request tới ${args.url} (lần ${attempt + 1}/${args.maxRetries + 1})...`);
      res = await fetch(args.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(args.body),
        signal: args.signal,
      });
      // eslint-disable-next-line no-console
      console.log(`[ocr] Phản hồi từ ${args.url}: status ${res.status} sau ${Date.now() - t0}ms`);
    } catch (networkErr: any) {
      if (networkErr?.name === 'AbortError' || args.signal?.aborted) {
        throw networkErr;
      }
      lastErr = networkErr;
      // eslint-disable-next-line no-console
      console.warn(`[ocr] Lỗi kết nối tới ${args.url}:`, networkErr);
      // Network failures → retry với backoff
      if (attempt < args.maxRetries && !args.signal?.aborted) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new OcrParseError(
        'Không kết nối được OCR proxy. Thử lại sau.',
        networkErr,
      );
    }

    if (res.ok) {
      return await res.json();
    }

    const text = await safeText(res);
    // eslint-disable-next-line no-console
    console.warn(`[ocr] Proxy trả status ${res.status}:`, text.slice(0, 200));

    if (res.status === 429 || res.status >= 500) {
      lastErr = new OcrHttpError(res.status, text);
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const wait = retryAfter ?? 1000 * 2 ** attempt;
      if (attempt < args.maxRetries && !args.signal?.aborted) {
        await sleep(Math.min(wait, 10_000));
        continue;
      }
    }
    throw new OcrHttpError(res.status, text);
  }

  throw lastErr instanceof Error ? lastErr : new OcrParseError('Hết lượt thử lại');
}

/**
 * Nén ảnh xuống tối đa `maxDim` ở chiều dài nhất, encode base64 định dạng JPEG chất lượng 0.82.
 * Luôn phủ nền trắng để tránh ảnh PNG trong suốt bị đen khi chuyển sang JPEG.
 * Giảm input token và payload chuyển mạng xuống 10-20 lần (~100-150KB), giúp AI phản hồi cực nhanh.
 */
async function fileToCompressedBase64(
  file: File,
  maxDim = 1200,
): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.readAsDataURL(file);
  });

  const { mime, base64 } = splitDataUrl(dataUrl);
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(mime) && !mime.startsWith('image/')) {
    throw new OcrParseError(`Định dạng ảnh không hỗ trợ: ${mime}. Dùng JPEG/PNG/WebP/HEIC.`);
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new OcrParseError('Ảnh quá lớn (>15MB). Vui lòng nén hoặc chọn ảnh khác.');
  }

  // Resize qua canvas
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
    // Fallback nếu không có canvas
    return { base64, mime };
  }

  // Phủ nền trắng để tránh PNG nền trong suốt bị đen
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // Xuất JPEG 0.82 tối ưu cho OCR
  const outMime = 'image/jpeg';
  const outDataUrl = canvas.toDataURL(outMime, 0.82);
  const split = splitDataUrl(outDataUrl);
  return { base64: split.base64, mime: outMime };
}

function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new OcrParseError('File ảnh không hợp lệ');
  return { mime: m[1]!, base64: m[2]! };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new OcrParseError('Không giải mã được ảnh (file hỏng?)'));
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

export type OcrProgressStage = 'compressing' | 'uploading' | 'analyzing';

export interface ParseReceiptOptions {
  /** Custom categories/accounts để inject vào prompt (optional). */
  categories?: string[];
  accounts?: string[];
  /** Giữ tương thích API; model thực tế do Worker allowlist quyết định. */
  model?: string;
  /** Số retry tối đa khi 429/5xx. Mặc định 2. */
  maxRetries?: number;
  /** Signal cho phép huỷ request ngay lập tức khi user bấm Huỷ */
  signal?: AbortSignal;
  /** Callback thông báo tiến độ từng giai đoạn */
  onProgress?: (stage: OcrProgressStage) => void;
}

/**
 * Parse 1 ảnh giao dịch → trả về OcrResult đã validate.
 * Gemini được gọi qua /api/ocr và session được gửi bằng Bearer JWT.
 */
export async function parseReceiptFromImage(
  file: File,
  opts: ParseReceiptOptions = {},
): Promise<OcrResult> {
  opts.onProgress?.('compressing');
  const t0 = Date.now();
  const { base64, mime } = await fileToCompressedBase64(file);
  // eslint-disable-next-line no-console
  console.log(
    `[ocr] Nén ảnh "${file.name}" xong: ${(file.size / 1024).toFixed(0)}KB -> ${(base64.length / 1024).toFixed(0)}KB base64 trong ${Date.now() - t0}ms`,
  );

  const requestBody = {
    contents: [
      {
        parts: [
          { text: buildUserPrompt(opts.categories, opts.accounts) },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0.1,
      // Giới hạn output để tránh model lặp chữ số ở amount_minor
      // cho đến khi request bị timeout. Flash Lite không nhận thinking_config.
      max_output_tokens: 2_048,
    },
    systemInstruction: {
      parts: [{ text: OCR_SYSTEM_PROMPT }],
    },
  };

  opts.onProgress?.('uploading');
  const json = await callGeminiRaw({
    customUrl: null,
    body: requestBody,
    maxRetries: opts.maxRetries ?? 2,
    signal: opts.signal,
  });

  opts.onProgress?.('analyzing');
  const parsed: OcrResult = unwrapGeminiJson(json) as OcrResult;

  const validated = validateOcrResult(parsed);

  // Normalize ngày về ISO UTC để DB.
  validated.transactions = validated.transactions.map(t => ({
    ...t,
    occurred_at: normalizeOcrOccurredAt(t.occurred_at),
  }));

  return validated;
}

async function callGeminiRaw(args: {
  customUrl: string | null;
  body: unknown;
  maxRetries: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  return callGeminiWithRetry({
    url: args.customUrl ?? '/api/ocr',
    body: args.body,
    maxRetries: args.maxRetries,
    signal: args.signal,
  });
}

function buildUserPrompt(categories?: string[], accounts?: string[]): string {
  const catHint = categories?.length
    ? `\n\nDanh mục hiện có của user (ưu tiên dùng cho suggested_category): ${categories.join(', ')}`
    : '';
  const accHint = accounts?.length
    ? `\n\nTài khoản hiện có của user (ưu tiên dùng cho account_hint nếu khớp): ${accounts.join(', ')}`
    : '';
  return `Phân tích ảnh sau và trả về JSON đúng schema.${catHint}${accHint}`;
}

/** Gemini trả về candidates[0].content.parts[0].text chứa JSON string. */
function unwrapGeminiJson(json: unknown): unknown {
  if (!json || typeof json !== 'object') {
    throw new OcrParseError('Response Gemini không hợp lệ (không phải object)');
  }
  const candidates = (json as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new OcrParseError('Response Gemini không có candidates');
  }
  const first = candidates[0] as {
    content?: { parts?: Array<{ text?: string }> };
  };
  const parts = first?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new OcrParseError('Response Gemini rỗng parts');
  }
  const text = parts[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new OcrParseError('Response Gemini không có text');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new OcrParseError('Response Gemini không phải JSON hợp lệ', err);
  }
}

/**
 * Suggest mapping OcrTransaction → category_id / account_id của user dựa trên tên gợi ý.
 * Trả về mapped OcrTransaction (KHÔNG tự ghi DB — chỉ enrich để UI dùng).
 *
 * Fallback account: nếu AI không trả account_hint (hoặc hint không khớp account nào),
 * chọn tài khoản ngân hàng (type='bank') đầu tiên trong `accounts` — vì hầu hết ảnh
 * sao kê/SMS ngân hàng là nguồn chính của OCR. Nếu không có bank, lấy account đầu tiên.
 */
export function mapOcrToUserRefs(
  tx: OcrTransaction,
  refs: {
    categoriesByName: Map<string, string>;
    accountsByHint: Map<string, string>;
  },
  fallbackAccountId?: string,
): OcrTransaction & { suggested_category_id?: string; suggested_account_id?: string } {
  const result: OcrTransaction & {
    suggested_category_id?: string;
    suggested_account_id?: string;
  } = { ...tx };

  if (tx.suggested_category) {
    const catKey = normalizeKey(tx.suggested_category);
    for (const [name, id] of refs.categoriesByName) {
      if (normalizeKey(name) === catKey || catKey.includes(normalizeKey(name))) {
        result.suggested_category_id = id;
        break;
      }
    }
  }
  if (tx.account_hint) {
    const hintKey = normalizeKey(tx.account_hint);
    for (const [name, id] of refs.accountsByHint) {
      if (normalizeKey(name) === hintKey || hintKey.includes(normalizeKey(name))) {
        result.suggested_account_id = id;
        break;
      }
    }
  }
  // Fallback: nếu AI không ra account_hint (hoặc hint không khớp) → dùng account ngân hàng.
  if (!result.suggested_account_id && fallbackAccountId) {
    result.suggested_account_id = fallbackAccountId;
  }
  return result;
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
