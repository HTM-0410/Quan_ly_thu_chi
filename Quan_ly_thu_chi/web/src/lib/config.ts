// =============================================================
// Runtime config — đọc từ import.meta.env (Vite, tiền tố VITE_)
//
// Trong development: nếu env thiếu → fallback giá trị demo (chỉ dev)
//   + console.warn + banner trong app để user biết cần tạo .env.local.
//
// Trong production (VITE_APP_ENV=production + build output):
//   BẮT BUỘC set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
//   Thiếu → fail-fast (throw Error) trước khi app render,
//   ErrorBoundary sẽ hiển thị hướng dẫn cấu hình.
// =============================================================

const DEFAULT_SUPABASE_URL = 'https://kldtrthnslpdhqrwlglg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZHRydGhuc2xwZGhxcndsZ2xnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNTQ5MjMsImV4cCI6MjEwMDkzMDkyM30.oqI13DrYiLXjl0W9cdDIgYlB9-9UUih0tXfYTN94TKc';

const RAW_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const RAW_SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

// Fail-fast chỉ khi user tường minh đánh dấu VITE_APP_ENV=production.
// Không dựa vào import.meta.env.PROD (Vite set tự động, không đáng tin).
const RAW_APP_ENV = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim();
export const APP_ENV: string = RAW_APP_ENV ?? 'development';

const IS_PROD = APP_ENV === 'production';
/** Exported để module khác (ocr.ts) kiểm tra env mà không import.meta.env trực tiếp. */
export { IS_PROD };

if (IS_PROD && (!RAW_SUPABASE_URL || !RAW_SUPABASE_ANON_KEY)) {
  throw new Error(
    '[config] Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY cho môi trường production. ' +
      'Cấu hình biến này trong web/.env.production hoặc môi trường CI trước khi build. ' +
      'Xem README.md → "Deploy lên production".',
  );
}

export const SUPABASE_URL: string = RAW_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string = RAW_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const APP_NAME = 'Quản lý thu chi';
export const LOCALE: string = (import.meta.env.VITE_LOCALE as string | undefined) ?? 'vi-VN';
export const CURRENCY: string = (import.meta.env.VITE_CURRENCY as string | undefined) ?? 'VND';

// =============================================================
// OCR (LLM Vision) config — Gemini 3.5 Flash Lite
// API key KHÔNG commit, đọc từ .env.local. Nếu thiếu → OCR bị disable
// nhưng app vẫn chạy (ReceiptImportModal sẽ hiện hướng dẫn cấu hình).
// =============================================================

const RAW_GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
const RAW_OCR_MODEL = (import.meta.env.VITE_OCR_MODEL as string | undefined)?.trim();

export const GEMINI_API_KEY: string = RAW_GEMINI_API_KEY ?? '';
export const OCR_MODEL: string = RAW_OCR_MODEL || 'gemini-3.1-flash-lite';
export const OCR_ENABLED: boolean = GEMINI_API_KEY.length > 0;

/** Helper throw khi gọi OCR mà thiếu key. UI catch để hiện fallback. */
export class MissingOcrConfigError extends Error {
  constructor() {
    super('Thiếu VITE_GEMINI_API_KEY trong .env.local — xem hướng dẫn trong modal.');
    this.name = 'MissingOcrConfigError';
  }
}

// =============================================================
// Debug log trạng thái OCR khi app khởi động.
// Chỉ in độ dài key + prefix 8 ký tự đầu (KHÔNG in key thật ra console)
// để tránh lộ nếu share log file / screenshot.
// Vite sẽ tự loại bỏ console.log trong production build.
// =============================================================
if (!IS_PROD) {
  const keyLength = GEMINI_API_KEY.length;
  const keyPrefix = keyLength >= 8 ? `${GEMINI_API_KEY.slice(0, 8)}…` : '(rỗng)';
  // eslint-disable-next-line no-console
  console.log(
    `[ocr] ${OCR_ENABLED ? '✅ ENABLED' : '❌ DISABLED'} · model=${OCR_MODEL} · key.length=${keyLength} · key.prefix=${keyPrefix}`,
  );
}

/** True nếu đang dùng giá trị fallback (chưa cấu hình env). */
export const IS_USING_FALLBACK: boolean =
  !RAW_SUPABASE_URL || !RAW_SUPABASE_ANON_KEY;

if (IS_USING_FALLBACK && !IS_PROD) {
  console.warn(
    '[config] Đang dùng fallback SUPABASE_URL/ANON_KEY. Để dùng cấu hình riêng: ' +
      'cp web/.env.example web/.env.local rồi sửa giá trị và restart dev server.',
  );
}