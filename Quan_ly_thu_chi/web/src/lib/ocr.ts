// =============================================================
// OCR client — gọi Gemini REST API trực tiếp từ browser.
// Không qua proxy/server. API key được bundle vào JS (trade-off đã chấp nhận).
// =============================================================

import {
  GEMINI_API_KEY,
  OCR_MODEL,
  IS_PROD,
  MissingOcrConfigError,
} from './config';
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

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** HTTP error do Gemini trả — UI có thể dùng status để retry/backoff. */
export class OcrHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`Gemini API ${status}: ${truncate(bodyText, 200)}`);
    this.name = 'OcrHttpError';
  }
}

/** Client gọi Gemini với retry tối đa `maxRetries` lần khi 429/5xx. */
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
      // Network failures → retry với backoff
      if (attempt < args.maxRetries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new OcrParseError(
        'Không kết nối được Gemini (mất mạng hoặc bị chặn CORS). Thử lại sau.',
        networkErr,
      );
    }

    if (res.ok) {
      if (!IS_PROD) {
        // eslint-disable-next-line no-console
        console.log(`[ocr] ✅ Gemini OK (model=${OCR_MODEL}, attempt=${attempt + 1})`);
      }
      return await res.json();
    }

    const text = await safeText(res);

    if (!IS_PROD) {
      // eslint-disable-next-line no-console
      console.error(`[ocr] ❌ Gemini HTTP ${res.status}: ${truncate(text, 500)}`);
    }

    if (res.status === 429 || res.status >= 500) {
      if (!IS_PROD) {
        // eslint-disable-next-line no-console
        console.warn(`[ocr] ⚠️ HTTP ${res.status} (attempt=${attempt + 1}/${args.maxRetries + 1}): ${truncate(text, 120)}`);
      }
      lastErr = new OcrHttpError(res.status, text);
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const wait = retryAfter ?? 1000 * 2 ** attempt;
      if (attempt < args.maxRetries) {
        await sleep(Math.min(wait, 10_000));
        continue;
      }
    }
    throw new OcrHttpError(res.status, text);
  }

  throw lastErr instanceof Error ? lastErr : new OcrParseError('Hết lượt thử lại');
}

/**
 * Nén ảnh xuống tối đa `maxDim` ở chiều dài nhất, encode base64 + giữ MIME gốc.
 * Dùng canvas để giảm input token khi gửi Gemini.
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
    throw new OcrParseError(`Định dạng ảnh không hỗ trợ: ${mime}. Dùng JPEG/PNG/WebP.`);
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new OcrParseError('Ảnh quá lớn (>8MB). Vui lòng nén hoặc chọn ảnh khác.');
  }

  // Resize qua canvas (chỉ áp dụng cho raster — đã validate MIME ở trên).
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
    // Trình duyệt không có canvas2d — fallback dùng base64 gốc.
    return { base64, mime };
  }
  ctx.drawImage(img, 0, 0, w, h);
  // PNG giữ lossless; JPEG/WebP xuất JPEG quality 0.85 để tiết kiệm token.
  const outMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
  const outDataUrl = canvas.toDataURL(outMime, outMime === 'image/jpeg' ? 0.85 : undefined);
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

export interface ParseReceiptOptions {
  /** Custom categories/accounts để inject vào prompt (optional). */
  categories?: string[];
  accounts?: string[];
  /** Override model (mặc định = OCR_MODEL từ config). */
  model?: string;
  /** Số retry tối đa khi 429/5xx. Mặc định 3. */
  maxRetries?: number;
}

/**
 * Parse 1 ảnh giao dịch → trả về OcrResult đã validate.
 * Throw MissingOcrConfigError khi thiếu API key.
 */
export async function parseReceiptFromImage(
  file: File,
  opts: ParseReceiptOptions = {},
): Promise<OcrResult> {
  if (!GEMINI_API_KEY) throw new MissingOcrConfigError();

  const { base64, mime } = await fileToCompressedBase64(file);
  const model = opts.model ?? OCR_MODEL;

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
      // TopK/TopP để mặc định cho stable output.
    },
    systemInstruction: {
      parts: [{ text: OCR_SYSTEM_PROMPT }],
    },
  };

  // URL override nếu user chọn model khác.
  const customUrl =
    model === OCR_MODEL ? null : `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const json = await callGeminiRaw({
    customUrl,
    body: requestBody,
    maxRetries: opts.maxRetries ?? 3,
  });

  const parsed = unwrapGeminiJson(json);

  if (!IS_PROD) {
    // eslint-disable-next-line no-console
    console.log(
      `[ocr] 📦 parsed JSON (model=${model}):`,
      truncate(JSON.stringify(parsed), 1500),
    );
    // Debug: log từng transaction's amount để xem AI parse đúng VND × 100 chưa.
    // eslint-disable-next-line no-console
    console.log(
      `[ocr] 🔍 amounts (raw vs sanity):`,
      (parsed?.transactions ?? []).map((t: { amount_minor?: number; type?: string; occurred_at?: string }) => ({
        amount_minor: t.amount_minor,
        type: t.type,
        at: t.occurred_at,
      })),
    );
  }

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
}): Promise<unknown> {
  const defaultUrl = `${GEMINI_ENDPOINT}/${OCR_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  return callGeminiWithRetry({
    url: args.customUrl ?? defaultUrl,
    body: args.body,
    maxRetries: args.maxRetries,
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