import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Camera, FileSearch, Loader2, X } from 'lucide-react';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';
import { ReceiptDropzone, type StagedImage } from './ReceiptDropzone';
import { ReceiptPreviewTable, type PreviewRow } from './ReceiptPreviewTable';
import { ReceiptImportFallback } from './ReceiptImportFallback';
import { useToast } from '../Toast';
import {
  parseReceiptFromImage,
  mapOcrToUserRefs,
  sanityCheckTransaction,
  type ParseReceiptOptions,
} from '../../lib/ocr';
import { MissingOcrConfigError } from '../../lib/config';
import { importOcrTransactions } from '../../lib/api';
// force-refresh: 2026-08-02T22:52
import { toLocalDateTimeInput, fromLocalDateTimeInput } from '../../lib/format';
import type { Category, FinancialAccount } from '../../lib/types';

type Step = 'upload' | 'processing' | 'preview';

interface ImageJob {
  image: StagedImage;
  status: 'pending' | 'processing' | 'done' | 'error';
  rows: PreviewRow[];
  error?: string;
}

interface ReceiptImportModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: FinancialAccount[];
  categories: Category[];
}

export function ReceiptImportModal({
  open,
  onClose,
  onSaved,
  accounts,
  categories,
}: ReceiptImportModalProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [importing, setImporting] = useState(false);
  const [parseController, setParseController] = useState<{ aborted: boolean } | null>(null);
  const [fallbackReason, setFallbackReason] = useState<'missing_key' | 'other' | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | undefined>(undefined);

  // Reset state khi modal đóng/mở.
  useEffect(() => {
    if (!open) {
      setStep('upload');
      setJobs([]);
      setImporting(false);
      setFallbackReason(null);
      setFallbackMessage(undefined);
      setParseController(prev => {
        if (prev) prev.aborted = true;
        return null;
      });
    }
  }, [open]);

  const categoriesByName = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach(c => m.set(c.name, c.id));
    return m;
  }, [categories]);

  const accountsByHint = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach(a => {
      m.set(a.name, a.id);
      if (a.institution_name) m.set(a.institution_name, a.id);
      if (a.masked_account_number) m.set(a.masked_account_number, a.id);
    });
    return m;
  }, [accounts]);

  // Fallback account khi AI không ra account_hint (hoặc hint không khớp):
  // ưu tiên tài khoản ngân hàng (type='bank'), nếu không có thì lấy account đầu tiên.
  const fallbackBankAccountId = useMemo(() => {
    const bank = accounts.find(a => a.type === 'bank');
    return bank?.id ?? accounts[0]?.id ?? undefined;
  }, [accounts]);

  function setImages(images: StagedImage[]) {
    setJobs(images.map(img => ({ image: img, status: 'pending', rows: [] })));
  }

  function getRows(): PreviewRow[] {
    return jobs.flatMap(j => j.rows);
  }

  function setRows(rows: PreviewRow[]) {
    // Phân bổ lại rows theo image_id (giữ order job).
    setJobs(prev => {
      const remaining = [...rows];
      return prev.map(job => {
        const mine = remaining.filter(r => r.image_id === job.image.id);
        return { ...job, rows: mine };
      });
    });
  }

  async function startProcessing() {
    if (jobs.length === 0) return;
    // eslint-disable-next-line no-console
    console.log('[ocr] startProcessing — moving to step=processing');
    setStep('processing');
    setFallbackReason(null);
    setFallbackMessage(undefined);

    // Parse tuần tự để tránh rate-limit Gemini free tier (10 RPM).
    const PARSE_TIMEOUT_MS = 90_000; // 90s / ảnh — Gemini free có thể chậm cuối ngày.
    const controller = { aborted: false };
    setParseController(controller);

    for (let i = 0; i < jobs.length; i++) {
      if (controller.aborted) break;
      const job = jobs[i]!;
      setJobs(prev =>
        prev.map((j, idx) => (idx === i ? { ...j, status: 'processing' } : j)),
      );
      const startedAt = Date.now();
      try {
        const opts: ParseReceiptOptions = {
          categories: categories.map(c => c.name),
          accounts: accounts.map(a => a.name),
        };
        // Timeout bảo vệ: nếu AI > 90s, bỏ qua ảnh này để khỏi treo cả batch.
        const result = await Promise.race([
          parseReceiptFromImage(job.image.file, opts),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`AI mất hơn ${PARSE_TIMEOUT_MS / 1000}s — bỏ qua ảnh này`)),
              PARSE_TIMEOUT_MS,
            ),
          ),
        ]);
        // eslint-disable-next-line no-console
        console.log(
          `[ocr] ✓ parsed "${job.image.file.name}" in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, ${result.transactions.length} tx`,
        );
        // Tính balance_running để cross-check arithmetic cho từng transaction.
        let runningBalance: number | undefined = undefined;
        const rows: PreviewRow[] = result.transactions.map(t => {
          const mapped = mapOcrToUserRefs(t, {
            categoriesByName,
            accountsByHint,
          }, fallbackBankAccountId);
          const sanity = sanityCheckTransaction(t, runningBalance);
          let type = t.type;
          let sanity_warning: string | null = null;
          let sanity_error: string | null = null;
          let selected: boolean;
          if (sanity.level === 'error') {
            sanity_error = sanity.reason;
            selected = false; // không cho import
          } else if (sanity.level === 'warning') {
            sanity_warning = sanity.reason;
            // Auto-fix nếu có suggestion (vd flip type) — user vẫn có thể sửa.
            if (sanity.suggestion?.type) {
              type = sanity.suggestion.type;
              sanity_warning = `${sanity.reason} → đã tự sửa loại.`;
            }
            selected = false; // để user xác nhận
          } else {
            selected = t.confidence >= 0.7 && !!mapped.suggested_account_id;
          }
          // Cập nhật running balance cho row kế tiếp.
          if (t.balance_after_minor !== undefined) {
            runningBalance = t.balance_after_minor;
          } else if (sanity.level === 'ok') {
            // Approximate running balance nếu không có balance_after.
            runningBalance =
              (runningBalance ?? 0) + (type === 'income' ? t.amount_minor : -t.amount_minor);
          }
          return {
            id: crypto.randomUUID(),
            image_id: job.image.id,
            selected,
            type,
            amount_minor: t.amount_minor,
            occurred_at_local: toLocalDateTimeInput(t.occurred_at),
            payee: (t.payee ?? '').slice(0, 200),
            note: (t.note ?? '').slice(0, 500),
            account_id: mapped.suggested_account_id ?? '',
            category_id: mapped.suggested_category_id ?? '',
            confidence: t.confidence,
            account_hint: t.account_hint ?? null,
            suggested_category: t.suggested_category ?? null,
            sanity_warning,
            sanity_error,
          };
        });
        setJobs(prev =>
          prev.map((j, idx) =>
            idx === i
              ? { ...j, status: 'done', rows }
              : j,
          ),
        );
        const errCount = rows.filter(r => r.sanity_error).length;
        const warnCount = rows.filter(r => r.sanity_warning).length;
        if (errCount > 0) {
          toast.push('error', `Ảnh "${job.image.file.name}": ${errCount} dòng lỗi — kiểm tra trước khi lưu`);
        }
        if (warnCount > 0) {
          toast.push('info', `Ảnh "${job.image.file.name}": ${warnCount} dòng cảnh báo (có thể đã tự sửa)`);
        }
        if (result.image_quality !== 'good') {
          toast.push(
            'info',
            result.image_quality === 'blurry'
              ? `Ảnh "${job.image.file.name}" bị mờ — kiểm tra kết quả trước khi lưu`
              : `Ảnh "${job.image.file.name}" chỉ thấy một phần`,
          );
        }
        if (result.notes) {
          toast.push('info', result.notes);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setJobs(prev =>
          prev.map((j, idx) =>
            idx === i
              ? { ...j, status: 'error', error: msg }
              : j,
          ),
        );
        if (e instanceof MissingOcrConfigError) {
          setFallbackReason('missing_key');
          setFallbackMessage(undefined);
          break; // dừng toàn bộ batch — thiếu API key
        }
        // Lỗi 1 ảnh không chặn các ảnh sau.
        // eslint-disable-next-line no-console
        console.error(`[ocr] ✗ failed "${job.image.file.name}":`, e);
        toast.push('error', `Lỗi ảnh "${job.image.file.name}": ${msg}`);
      }
      // Delay nhỏ giữa các request để không vượt rate-limit free tier.
      if (i < jobs.length - 1 && !controller.aborted) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    setParseController(null);
    // eslint-disable-next-line no-console
    console.log('[ocr] loop finished — moving to step=preview, jobs=', jobs.length);
    setStep('preview');
  }

  async function commitImport() {
    const rows = getRows().filter(
      r => r.selected && r.account_id && r.amount_minor > 0,
    );
    if (rows.length === 0) {
      toast.push('error', 'Chọn ít nhất 1 giao dịch hợp lệ (đã có tài khoản & số tiền > 0)');
      return;
    }
    setImporting(true);
    try {
      const results = await importOcrTransactions(
        rows.map(r => ({
          account_id: r.account_id,
          type: r.type,
          amount_minor: r.amount_minor,
          occurred_at: fromLocalDateTimeInput(r.occurred_at_local),
          category_id: r.category_id || null,
          payee: r.payee.trim() || null,
          note: r.note.trim() || null,
        })),
      );
      const success = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);
      if (success > 0) {
        toast.push('success', `Đã import ${success} giao dịch`);
      }
      if (failed.length > 0) {
        const msg = failed[0]?.error ?? 'unknown';
        const display = typeof msg === 'string' ? msg : JSON.stringify(msg);
        toast.push('error', `${failed.length} giao dịch lỗi: ${display}`);
      }
      if (success > 0) {
        onSaved();
        onClose();
      }
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  const rows = useMemo(() => getRows(), [jobs]);
  const selectedCount = rows.filter(r => r.selected).length;
  const validCount = rows.filter(r => r.selected && r.account_id && r.amount_minor > 0).length;
  const totalAmount = rows
    .filter(r => r.selected && r.account_id && r.amount_minor > 0)
    .reduce((s, r) => s + r.amount_minor, 0);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (importing) return;
        onClose();
      }}
      title="Import giao dịch từ ảnh"
      description="Dùng AI đọc ảnh sao kê / SMS / biên lai và tách thành giao dịch."
      size="xl"
    >
      <Stepper step={step} />

      <div className="mt-5 space-y-4">
        {step === 'upload' && (
          <>
            <ReceiptDropzone images={jobs.map(j => j.image)} onChange={setImages} />
            {fallbackReason && (
              <ReceiptImportFallback reason={fallbackReason} message={fallbackMessage} />
            )}
          </>
        )}

        {step === 'processing' && (
          <ProcessingView jobs={jobs} />
        )}

        {step === 'preview' && (
          <>
            {fallbackReason && (
              <ReceiptImportFallback reason={fallbackReason} message={fallbackMessage} />
            )}
            <ReceiptPreviewTable
              rows={rows}
              onChange={setRows}
              accounts={accounts}
              categories={categories}
            />
            <Summary
              selectedCount={selectedCount}
              validCount={validCount}
              totalAmount={totalAmount}
            />
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-surface-sunken px-5 py-3.5 dark:border-ink-800 dark:bg-surface-dark-sunken">
        {step === 'upload' && (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Huỷ
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              onClick={startProcessing}
              disabled={jobs.length === 0 || fallbackReason === 'missing_key'}
            >
              <FileSearch size={14} strokeWidth={2} />
              Phân tích {jobs.length} ảnh
            </button>
          </>
        )}
        {step === 'processing' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setStep('upload')}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Quay lại
          </button>
        )}
        {step === 'preview' && (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('upload')}
              disabled={importing}
            >
              <ArrowLeft size={14} strokeWidth={2} /> Làm lại
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              onClick={commitImport}
              disabled={importing || validCount === 0}
            >
              {importing && <Spinner size="sm" />}
              <Camera size={14} strokeWidth={2} />
              {importing ? 'Đang lưu…' : `Import ${validCount} giao dịch`}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Chọn ảnh' },
    { id: 'processing', label: 'AI đọc' },
    { id: 'preview', label: 'Xem & sửa' },
  ];
  const currentIdx = steps.findIndex(s => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-2xs font-medium text-ink-500 dark:text-inkDark-500">
      {steps.map((s, idx) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={clsx(
              'grid h-6 w-6 place-items-center rounded-pill border text-2xs',
              idx < currentIdx
                ? 'border-ok-500 bg-ok-500 text-white'
                : idx === currentIdx
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'border-ink-200 bg-surface-sunken dark:border-ink-700 dark:bg-surface-dark-sunken',
            )}
          >
            {idx + 1}
          </span>
          <span
            className={clsx(
              idx === currentIdx && 'font-semibold text-ink-900 dark:text-inkDark-900',
            )}
          >
            {s.label}
          </span>
          {idx < steps.length - 1 && (
            <span aria-hidden className="mx-1 h-px w-6 bg-ink-200 dark:bg-ink-700" />
          )}
        </li>
      ))}
    </ol>
  );
}

function ProcessingView({ jobs }: { jobs: ImageJob[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700 dark:text-inkDark-700">
        Đang gửi từng ảnh tới AI để trích xuất giao dịch. Tuần tự để tránh vượt giới hạn API.
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {jobs.map(job => (
          <li
            key={job.image.id}
            className="relative aspect-square overflow-hidden rounded-card border border-ink-200 bg-surface-sunken dark:border-ink-700"
          >
            <img
              src={job.image.previewUrl}
              alt=""
              className={clsx(
                'h-full w-full object-cover transition',
                job.status === 'processing' && 'opacity-40',
                job.status === 'done' && 'ring-2 ring-ok-500',
                job.status === 'error' && 'ring-2 ring-err-500',
              )}
            />
            {job.status === 'processing' && (
              <div className="absolute inset-0 grid place-items-center bg-black/30">
                <Loader2 className="animate-spin text-white" size={20} strokeWidth={2} />
              </div>
            )}
            {job.status === 'done' && (
              <div className="absolute bottom-1 right-1 rounded-full bg-ok-500 px-1.5 text-2xs font-semibold text-white">
                {job.rows.length} giao dịch
              </div>
            )}
            {job.status === 'error' && (
              <div className="absolute inset-x-0 bottom-0 bg-err-700/90 px-1.5 py-1 text-2xs text-white">
                Lỗi
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Summary({
  selectedCount,
  validCount,
  totalAmount,
}: {
  selectedCount: number;
  validCount: number;
  totalAmount: number;
}) {
  const vnd = new Intl.NumberFormat('vi-VN').format(Math.round(totalAmount / 100));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-xs text-ink-600 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
      <span>
        Đã chọn <strong className="text-ink-900 dark:text-inkDark-900">{selectedCount}</strong>{' '}
        · hợp lệ <strong className="text-ok-700 dark:text-ok-500">{validCount}</strong>
      </span>
      <span className="font-semibold tabular-nums text-ink-900 dark:text-inkDark-900">
        Tổng: {vnd} ₫
      </span>
    </div>
  );
}