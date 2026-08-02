import { KeyRound } from 'lucide-react';

interface ReceiptImportFallbackProps {
  reason: 'missing_key' | 'other';
  message?: string;
}

/**
 * UI khi OCR không khả dụng (thiếu API key hoặc lỗi cấu hình).
 * Hướng dẫn user cách tự thêm key vào .env.local.
 */
export function ReceiptImportFallback({ reason, message }: ReceiptImportFallbackProps) {
  return (
    <div className="rounded-card border border-warn-100 bg-warn-50 px-4 py-4 text-sm dark:border-warn-500/40 dark:bg-warn-500/10">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn-100 text-warn-600 dark:bg-warn-500/20 dark:text-warn-500">
          <KeyRound size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="font-semibold text-ink-900 dark:text-inkDark-900">
            {reason === 'missing_key'
              ? 'Chưa cấu hình Gemini API key'
              : 'OCR tạm thời không khả dụng'}
          </div>
          <div className="text-ink-700 dark:text-inkDark-700">
            {reason === 'missing_key'
              ? 'Tính năng này dùng Google Gemini để đọc ảnh giao dịch. Bạn cần thêm API key vào file .env.local rồi restart dev server.'
              : (message ?? 'Đã có lỗi xảy ra khi kết nối AI.')}
          </div>
          <ol className="ml-4 list-decimal space-y-1 text-ink-700 dark:text-inkDark-700">
            <li>
              Vào{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-600 underline underline-offset-2 dark:text-brand-400"
              >
                aistudio.google.com/app/apikey
              </a>{' '}
              và tạo API key (miễn phí).
            </li>
            <li>
              Mở file{' '}
              <code className="rounded bg-ink-100 px-1 py-0.5 text-2xs dark:bg-ink-800">
                web/.env.local
              </code>
              , thêm dòng:
              <pre className="mt-1 overflow-x-auto rounded bg-ink-900 px-2 py-1.5 font-mono text-2xs text-white">
                VITE_GEMINI_API_KEY=your-key-here{'\n'}
                VITE_OCR_MODEL=gemini-3.5-flash-lite
              </pre>
            </li>
            <li>
              Restart dev server (<code className="font-mono text-2xs">npm run dev</code>).
            </li>
          </ol>
          <p className="text-2xs text-ink-500 dark:text-inkDark-500">
            API key sẽ được bundle vào file JS khi build. Nếu deploy lên hosting public,
            hãy giới hạn key theo HTTP referrer trong Google Cloud Console.
          </p>
        </div>
      </div>
    </div>
  );
}