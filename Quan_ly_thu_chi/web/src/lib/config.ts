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

const DEFAULT_SUPABASE_URL = 'https://qphevhmaczuazsvhbwfb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_zCpxzBaOyuP0AbobSKlwAg_-xbS9Ao_';

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
// OCR (LLM Vision) config.
// Provider secret chỉ tồn tại ở Worker; client chỉ biết endpoint proxy.
// =============================================================

// OCR luôn đi qua same-origin Worker proxy và yêu cầu session hiện tại.
export const OCR_ENABLED: boolean = true;

/** Helper throw khi proxy chưa sẵn sàng hoặc người dùng chưa đăng nhập. */
export class MissingOcrConfigError extends Error {
  constructor(message = 'OCR proxy chưa được cấu hình hoặc phiên đăng nhập đã hết hạn.') {
    super(message);
    this.name = 'MissingOcrConfigError';
  }
}

// =============================================================

/** True nếu đang dùng giá trị fallback (chưa cấu hình env). */
export const IS_USING_FALLBACK: boolean =
  !RAW_SUPABASE_URL || !RAW_SUPABASE_ANON_KEY;

if (IS_USING_FALLBACK && !IS_PROD) {
  console.warn(
    '[config] Đang dùng fallback SUPABASE_URL/ANON_KEY. Để dùng cấu hình riêng: ' +
      'cp web/.env.example web/.env.local rồi sửa giá trị và restart dev server.',
  );
}
