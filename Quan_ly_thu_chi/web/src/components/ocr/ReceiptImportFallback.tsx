import { KeyRound } from 'lucide-react';

interface ReceiptImportFallbackProps {
  reason: 'missing_key' | 'other';
  message?: string;
}

/**
 * UI khi OCR không khả dụng (proxy chưa sẵn sàng hoặc lỗi cấu hình).
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
              ? 'OCR proxy chưa sẵn sàng'
              : 'OCR tạm thời không khả dụng'}
          </div>
          <div className="text-ink-700 dark:text-inkDark-700">
            {reason === 'missing_key'
              ? 'Tính năng này xử lý ảnh qua OCR proxy có xác thực. Hãy cấu hình Worker và thử lại.'
              : (message ?? 'Đã có lỗi xảy ra khi kết nối AI.')}
          </div>
          <ol className="ml-4 list-decimal space-y-1 text-ink-700 dark:text-inkDark-700">
            <li>
              Cấu hình provider secret ở Worker.
            </li>
            <li>
              Đảm bảo Worker có các biến xác thực Supabase và model được allowlist:
              <pre className="mt-1 overflow-x-auto rounded bg-ink-900 px-2 py-1.5 font-mono text-2xs text-white">
                SUPABASE_URL=...{'\n'}
                SUPABASE_ANON_KEY=...{'\n'}
                OCR_MODEL=gemini-3.5-flash-lite
              </pre>
            </li>
            <li>
            Restart Worker/dev server sau khi cấu hình.
            </li>
          </ol>
          <p className="text-2xs text-ink-500 dark:text-inkDark-500">
            Secret chỉ được lưu ở Worker và không nằm trong bundle trình duyệt.
          </p>
        </div>
      </div>
    </div>
  );
}
