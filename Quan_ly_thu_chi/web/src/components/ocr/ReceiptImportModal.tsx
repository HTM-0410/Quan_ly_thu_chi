import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Clock,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';
import { BillOcrModal } from '../bill/BillOcrModal';
import { ReceiptDropzone, type StagedImage } from './ReceiptDropzone';
import { ReceiptPreviewTable, type PreviewRow } from './ReceiptPreviewTable';
import { ReceiptImportFallback } from './ReceiptImportFallback';
import { useToast } from '../Toast';
import {
  parseReceiptFromImage,
  mapOcrToUserRefs,
  sanityCheckTransaction,
  type ParseReceiptOptions,
  type OcrProgressStage,
} from '../../lib/ocr';
import { MissingOcrConfigError } from '../../lib/config';
import { getPeople, getBillWithItems, type BillWithItems } from '../../lib/api';
import {
  createOcrRowAtomic,
  toOcrCategoryFields,
  type OcrAtomicBill,
  type OcrAtomicDebt,
  type OcrAtomicSplit,
} from '../../lib/ocrAtomic';
// force-refresh: 2026-08-02T22:52
import { toLocalDateTimeInput, fromLocalDateTimeInput, formatVND } from '../../lib/format';
import type { Category, FinancialAccount, Person } from '../../lib/types';

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
  onDebtsCreated?: () => void;
  accounts: FinancialAccount[];
  categories: Category[];
}

export function ReceiptImportModal({
  open,
  onClose,
  onSaved,
  onDebtsCreated,
  accounts,
  categories,
}: ReceiptImportModalProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [importing, setImporting] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<'missing_key' | 'other' | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | undefined>(undefined);
  const [people, setPeople] = useState<Person[]>([]);

  // Tiến trình AI đọc trực tiếp
  const [processingStage, setProcessingStage] = useState<OcrProgressStage>('compressing');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<any>(null);

  const stopProcessing = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleCancelProcessing = useCallback(() => {
    stopProcessing();
    setStep('upload');
  }, [stopProcessing]);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  // Cleanup object URLs khi unmount modal
  useEffect(() => {
    return () => {
      stopProcessing();
      jobsRef.current.forEach(j => {
        if (j.image?.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(j.image.previewUrl);
        }
      });
    };
  }, [stopProcessing]);

  // Reset state khi modal đóng/mở.
  useEffect(() => {
    if (!open) {
      stopProcessing();
      setStep('upload');
      setJobs(prev => {
        prev.forEach(j => {
          if (j.image?.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(j.image.previewUrl);
          }
        });
        return [];
      });
      setImporting(false);
      setFallbackReason(null);
      setFallbackMessage(undefined);
      setElapsedSeconds(0);
      setProcessingStage('compressing');
    } else {
      // Load people for debt split feature
      getPeople()
        .then(setPeople)
        .catch(() => setPeople([]));
    }
  }, [open, stopProcessing]);

  // Reset people when closing
  useEffect(() => {
    if (!open) {
      setPeople([]);
    }
  }, [open]);

  /**
   * Bill modal flow: sau khi import xong GD Mua sắm + offline + has_bill=true,
   * mở BillOcrModal cho từng GD để user upload ảnh bill ngay.
   * Lưu hàng đợi (queue) để xử lý tuần tự.
   *
   * Lưu ý: dùng ref `hasPendingBill` (sync) thay vì check billQueue.length
   * ngay sau loop vì setState là async → check state trong cùng tick là sai.
   */
  const [billQueue, setBillQueue] = useState<
    Array<{ transactionId: string; amountMinor: number; existingBill: BillWithItems | null }>
  >([]);
  const [currentBillTx, setCurrentBillTx] = useState<{
    transactionId: string;
    amountMinor: number;
    existingBill: BillWithItems | null;
  } | null>(null);
  const hasPendingBillRef = useRef(false);

  // Khi đóng modal OCR, reset queue.
  useEffect(() => {
    if (!open) {
      setBillQueue([]);
      setCurrentBillTx(null);
      hasPendingBillRef.current = false;
    }
  }, [open]);

  // Khi queue có item và chưa mở modal nào → mở item đầu.
  // Khi queue rỗng + không có current → reset ref (cho lần import sau).
  useEffect(() => {
    if (billQueue.length > 0 && !currentBillTx) {
      const [next, ...rest] = billQueue;
      setCurrentBillTx({
        transactionId: next!.transactionId,
        amountMinor: next!.amountMinor,
        existingBill: next!.existingBill,
      });
      setBillQueue(rest);
    } else if (billQueue.length === 0 && !currentBillTx) {
      hasPendingBillRef.current = false;
    }
  }, [billQueue, currentBillTx]);

  const categoriesByName = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach(c => m.set(c.name, c.id));
    return m;
  }, [categories]);

  const categoryById = useMemo(() => {
    const m = new Map<string, (typeof categories)[number]>();
    categories.forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);

  /** True nếu category thuộc nhóm billable (CHA 'Mua sắm' / 'Đi chợ/Siêu thị' hoặc CON của 1 trong 2). */
  const isShoppingCategoryLocal = useCallback(
    (catId: string | null | undefined): boolean => {
      if (!catId) return false;
      const cat = categoryById.get(catId);
      if (!cat) return false;
      const n = cat.name.trim().toLowerCase();
      if (n === 'mua sắm' || n === 'đi chợ/siêu thị') return true;
      if (cat.parent_id) {
        const parent = categoryById.get(cat.parent_id);
        if (parent) {
          const pn = parent.name.trim().toLowerCase();
          return pn === 'mua sắm' || pn === 'đi chợ/siêu thị';
        }
      }
      return false;
    },
    [categoryById],
  );

  /** Bill chỉ hợp lệ khi channel đã chọn + các field phụ thuộc đầy đủ. */
  const isBillComplete = useCallback(
    (bill: NonNullable<ReturnType<typeof getRows>[number]['bill']>): boolean => {
      if (bill.channel === null) return false;
      if (bill.channel === 'offline') {
        return !!(bill.store_name && bill.store_name.trim().length > 0);
      }
      if (bill.channel === 'online') {
        if (!bill.marketplace) return false;
        if (bill.marketplace === 'other') {
          return !!(bill.marketplace_other && bill.marketplace_other.trim().length > 0);
        }
        return true;
      }
      return false;
    },
    [],
  );

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
    stopProcessing();

    // eslint-disable-next-line no-console
    console.log('[ocr] startProcessing — moving to step=processing');
    const ac = new AbortController();
    abortControllerRef.current = ac;
    setElapsedSeconds(0);
    setProcessingStage('compressing');
    setStep('processing');
    setFallbackReason(null);
    setFallbackMessage(undefined);

    const timer = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    timerRef.current = timer;

    // Parse tuần tự để tránh rate-limit Gemini free tier (10 RPM).
    const PARSE_TIMEOUT_MS = 45_000; // 45s / ảnh

    for (let i = 0; i < jobs.length; i++) {
      if (ac.signal.aborted) break;
      const job = jobs[i]!;
      setJobs(prev =>
        prev.map((j, idx) => (idx === i ? { ...j, status: 'processing', error: undefined } : j)),
      );
      const startedAt = Date.now();
      const jobController = new AbortController();
      const abortJob = () => jobController.abort();
      ac.signal.addEventListener('abort', abortJob, { once: true });
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        jobController.abort();
      }, PARSE_TIMEOUT_MS);
      try {
        const opts: ParseReceiptOptions = {
          categories: categories.map(c => c.name),
          accounts: accounts.map(a => a.name),
          signal: jobController.signal,
          onProgress: st => setProcessingStage(st),
        };
        const result = await parseReceiptFromImage(job.image.file, opts);

        if (ac.signal.aborted) break;

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
            splits: [],
            split_share: null,
            bill: null,
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
      } catch (e: any) {
        if (ac.signal.aborted) break;
        const msg = timedOut
          ? `AI mất hơn ${PARSE_TIMEOUT_MS / 1000}s — hết thời gian chờ`
          : e instanceof Error ? e.message : String(e);
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
        // eslint-disable-next-line no-console
        console.error(`[ocr] ✗ failed "${job.image.file.name}":`, e);
        toast.push('error', `Lỗi ảnh "${job.image.file.name}": ${msg}`);
      } finally {
        clearTimeout(timeoutId);
        ac.signal.removeEventListener('abort', abortJob);
      }
      // Delay nhỏ giữa các request để không vượt rate-limit free tier.
      if (i < jobs.length - 1 && !ac.signal.aborted) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    clearInterval(timer);
    timerRef.current = null;
    abortControllerRef.current = null;

    if (ac.signal.aborted) return;

    // eslint-disable-next-line no-console
    console.log('[ocr] loop finished — checking results...');
    setJobs(currentJobs => {
      const anySuccess = currentJobs.some(j => j.rows.length > 0);
      const anyError = currentJobs.some(j => j.status === 'error');
      // Nếu có ít nhất 1 ảnh parse được hoặc không có lỗi nào -> chuyển preview
      if (anySuccess || !anyError) {
        setStep('preview');
      }
      return currentJobs;
    });
  }

  async function commitImport() {
    // Row is valid if:
    // - splits.length === 0: account_id must be set
    // - splits.length > 0: each split has account_id and sum equals amount_minor
    // - split_share: person_id or person_name must be set
    // - Nếu category = Mua sắm: bill.channel + bill fields phụ thuộc phải đầy đủ.
    function isValid(row: ReturnType<typeof getRows>[number]): boolean {
      if (row.amount_minor <= 0) return false;
      if (row.splits.length === 0 && !row.account_id) return false;
      if (row.splits.length > 0) {
        if (!row.splits.every(s => !!s.account_id)) return false;
        if (row.splits.reduce((s, sp) => s + sp.amount_minor, 0) !== row.amount_minor) return false;
      }
      if (isShoppingCategoryLocal(row.category_id)) {
        if (!row.bill || !isBillComplete(row.bill)) return false;
      }
      return true;
    }

    function isSplitShareValid(share: NonNullable<ReturnType<typeof getRows>[number]['split_share']>): boolean {
      return !!(share.person_id || share.person_name) && share.amount_minor > 0;
    }

    const allRows = getRows().filter(r => r.selected && isValid(r));
    if (allRows.length === 0) {
      toast.push('error', 'Chọn ít nhất 1 giao dịch hợp lệ (đã có tài khoản, số tiền > 0; GD Mua sắm cần chọn kênh mua hàng)');
      return;
    }

    // Validate split_share rows
    const rowsWithSplitShare = allRows.filter(r => r.split_share && isSplitShareValid(r.split_share!));
    for (const row of rowsWithSplitShare) {
      if (!row.split_share) continue;
      if (!row.split_share.person_id && !row.split_share.person_name.trim()) {
        toast.push('error', `Vui lòng nhập tên người chia tiền cho giao dịch "${row.payee || row.suggested_category}"`);
        return;
      }
    }

    setImporting(true);
    try {
      const rowResults = new Map<
        string,
        { ok: boolean; error?: string; txIds?: string[]; billId?: string | null; debtId?: string | null }
      >();
      let billCount = 0;
      let debtCount = 0;

      for (const row of allRows) {
        try {
          const categoryFields = toOcrCategoryFields(row.category_id);
          const base = {
            type: row.type,
            occurred_at: fromLocalDateTimeInput(row.occurred_at_local),
            payee: row.payee.trim() || null,
            note: row.note.trim() || null,
            category_id: categoryFields.category_id,
            global_category_id: categoryFields.global_category_id,
          };

          const rowCid = row.client_generated_id || crypto.randomUUID();
          row.client_generated_id = rowCid;
          const rowHex = rowCid.replace(/-/g, '').padEnd(32, '0');

          const splits: OcrAtomicSplit[] =
            row.splits.length > 0
              ? row.splits.map((split, index) => ({
                  ...base,
                  account_id: split.account_id,
                  amount_minor: split.amount_minor,
                  client_generated_id: `${rowHex.slice(0, 8)}-${rowHex.slice(8, 12)}-${rowHex.slice(12, 16)}-${rowHex.slice(16, 20)}-${String(index).padStart(12, '0')}`,
                }))
              : [
                  {
                    ...base,
                    account_id: row.account_id,
                    amount_minor: row.amount_minor,
                    client_generated_id: rowCid,
                  },
                ];

          let debt: OcrAtomicDebt | null = null;
          const share = row.split_share;
          if (share) {
            debt = {
              person_id: share.person_id && share.person_id !== '__new__' ? share.person_id : null,
              person_name: share.person_id && share.person_id !== '__new__' ? null : share.person_name.trim(),
              type: 'lend',
              original_amount: share.amount_minor,
              notes: `Chia tiền từ giao dịch: ${row.payee || row.suggested_category || 'giao dịch'} ${formatVND(Math.round(row.amount_minor / 100))}`,
            };
          }

          const bill: OcrAtomicBill | null = row.bill
            ? {
                channel_type: row.bill.channel!,
                online_marketplace: row.bill.marketplace,
                online_marketplace_other: row.bill.marketplace_other,
                store_name: row.bill.store_name,
                declared_total_minor: row.amount_minor,
                items: [],
              }
            : null;

          const result = await createOcrRowAtomic({
            row_id: row.id,
            splits,
            bill,
            debt,
          });
          rowResults.set(row.id, {
            ok: true,
            txIds: result.transaction_ids,
            billId: result.bill_id,
            debtId: result.debt_id,
          });

          if (result.bill_id && row.bill) {
            billCount++;
            if (row.bill.channel === 'offline' && row.bill.has_bill) {
              const txId = result.transaction_ids[0]!;
              hasPendingBillRef.current = true;
              getBillWithItems(txId)
                .then(existingBill => {
                  setBillQueue(prev => [...prev, { transactionId: txId, amountMinor: row.amount_minor, existingBill }]);
                })
                .catch(() => {
                  setBillQueue(prev => [...prev, { transactionId: txId, amountMinor: row.amount_minor, existingBill: null }]);
                });
            }
          }
          if (result.debt_id) debtCount++;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          rowResults.set(row.id, { ok: false, error: message });
        }
      }

      if (billCount > 0) toast.push('success', `Đã lưu ${billCount} bill (mua sắm / đi chợ)`);

      if (debtCount > 0) {
        toast.push('success', `Đã lưu ${debtCount} khoản cho vay`);
        onDebtsCreated?.();
        window.dispatchEvent(new CustomEvent('debts-updated'));
      }

      // A row is successful only when its one atomic operation returned.
      const successfulRowIds = new Set<string>();
      const failedRowMap = new Map<string, string>(); // rowId -> error message

      for (const r of allRows) {
        const status = rowResults.get(r.id);
        if (status?.ok) {
          successfulRowIds.add(r.id);
        } else {
          const errMsg = status?.error || 'Lỗi không xác định khi lưu dòng OCR';
          failedRowMap.set(r.id, errMsg);
        }
      }

      const successCount = successfulRowIds.size;
      const failedCount = failedRowMap.size;

      if (successCount > 0) {
        toast.push('success', `Đã lưu thành công ${successCount} giao dịch.`);
        onSaved(); // Cập nhật danh sách giao dịch nền
      }

      if (failedCount > 0) {
        toast.push('error', `${failedCount} dòng gặp lỗi khi lưu. Bạn có thể sửa thông tin và bấm "Thử lại".`);
        // F12 Safe Partial Retry: Giữ lại các dòng lỗi kèm import_error, loại bỏ dòng thành công
        setJobs(prev =>
          prev.map(job => {
            const remainingRows = job.rows
              .filter(r => !successfulRowIds.has(r.id))
              .map(r => {
                if (failedRowMap.has(r.id)) {
                  return {
                    ...r,
                    selected: true,
                    import_error: failedRowMap.get(r.id)!,
                  };
                }
                return r;
              });
            return { ...job, rows: remainingRows };
          }),
        );
        // KHÔNG đóng modal, giữ lại ở bước xem trước để user chỉnh sửa & thử lại
        return;
      }

      // Toàn bộ dòng đã chọn đều thành công
      // Nếu có pending bill trong queue → giữ modal mở để BillOcrModal hiện ra.
      if (!hasPendingBillRef.current) {
        onClose();
      }
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  const rows = useMemo(() => getRows(), [jobs]);

  function isRowValid(row: ReturnType<typeof getRows>[number]): boolean {
    if (row.amount_minor <= 0) return false;
    if (row.splits.length === 0) return !!row.account_id;
    return (
      row.splits.every(s => !!s.account_id) &&
      row.splits.reduce((s, sp) => s + sp.amount_minor, 0) === row.amount_minor
    );
  }

  function isRowBillValid(row: ReturnType<typeof getRows>[number]): boolean {
    if (!isShoppingCategoryLocal(row.category_id)) return true;
    return !!row.bill && isBillComplete(row.bill);
  }

  const selectedCount = rows.filter(r => r.selected).length;
  const validCount = rows.filter(r => r.selected && isRowValid(r) && isRowBillValid(r)).length;
  const totalAmount = rows
    .filter(r => r.selected && isRowValid(r) && isRowBillValid(r))
    .reduce((s, r) => s + r.amount_minor, 0);

  return (
    <>
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
            <div className="rounded-card border border-brand-200 bg-brand-50/50 p-3 text-xs text-brand-900 dark:border-brand-800/40 dark:bg-brand-900/10 dark:text-brand-300">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
                Bảo vệ dữ liệu & quyền riêng tư
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-600 dark:text-inkDark-400">
                Ảnh chỉ được gửi đến Google Gemini để trích xuất thông tin giao dịch khi bạn bấm nút &quot;Phân tích&quot;.
                Hệ thống không lưu trữ ảnh gốc vĩnh viễn trên máy chủ. Bạn luôn có bước xem trước, chỉnh sửa thông tin trước khi quyết định lưu vào sổ.
              </p>
            </div>
            <ReceiptDropzone images={jobs.map(j => j.image)} onChange={setImages} />
            {fallbackReason && (
              <ReceiptImportFallback reason={fallbackReason} message={fallbackMessage} />
            )}
          </>
        )}

        {step === 'processing' && (
          <ProcessingView
            jobs={jobs}
            stage={processingStage}
            elapsedSeconds={elapsedSeconds}
            onRetry={startProcessing}
            onCancel={handleCancelProcessing}
          />
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
              people={people}
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
            className="btn-secondary inline-flex items-center gap-2"
            onClick={handleCancelProcessing}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Huỷ & Quay lại
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
              {importing
                ? 'Đang lưu…'
                : rows.some(r => r.import_error)
                  ? `Thử lại ${validCount} dòng lỗi`
                  : `Import ${validCount} giao dịch`}
            </button>
          </>
        )}
      </div>

      {/* BillOcrModal mở tuần tự cho các GD Mua sắm + offline + has_bill=true.
          Render NGOÀI <Modal> OCR để tránh z-index conflict. */}
      {currentBillTx && (
        <BillOcrModal
          open={true}
          transactionId={currentBillTx.transactionId}
          transactionAmountMinor={currentBillTx.amountMinor}
          existingBill={currentBillTx.existingBill}
          onClose={() => {
            // User đóng modal bill không upload → bỏ qua, mở tiếp (nếu có) hoặc đóng OCR modal.
            setCurrentBillTx(null);
            // Đợi effect chạy (reset ref nếu queue hết) rồi check.
            setTimeout(() => {
              if (!hasPendingBillRef.current) {
                onSaved();
                onClose();
              }
            }, 0);
          }}
          onSaved={() => {
            setCurrentBillTx(null);
            toast.push('success', 'Đã xử lý bill');
            // Effect sẽ tự mở item tiếp theo nếu queue còn.
            // Nếu hết queue → đóng luôn OCR modal.
            // Đợi state propagate rồi check.
            setTimeout(() => {
              if (!hasPendingBillRef.current) {
                onSaved();
                onClose();
              }
            }, 0);
          }}
        />
      )}
        </Modal>
    </>
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

function ProcessingView({
  jobs,
  stage,
  elapsedSeconds,
  onRetry,
  onCancel,
}: {
  jobs: ImageJob[];
  stage: OcrProgressStage;
  elapsedSeconds: number;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const isAnyError = jobs.some(j => j.status === 'error');
  const allErrors = jobs.length > 0 && jobs.every(j => j.status === 'error');
  const isProcessing = jobs.some(j => j.status === 'processing');

  const stageLabel =
    stage === 'compressing'
      ? '1/3 Đang tối ưu hoá & nén ảnh để gửi nhanh…'
      : stage === 'uploading'
        ? '2/3 Đang kết nối và gửi dữ liệu tới Google Gemini AI…'
        : '3/3 AI đang phân tích dữ liệu & trích xuất giao dịch…';

  return (
    <div className="space-y-4">
      {/* Progress banner */}
      <div className="rounded-card border border-brand-200 bg-brand-50/70 p-4 dark:border-brand-800/50 dark:bg-brand-900/15">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isProcessing ? (
              <div className="grid h-8 w-8 place-items-center rounded-pill bg-brand-600 text-white shadow-sm dark:bg-brand-500 shrink-0">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : isAnyError ? (
              <div className="grid h-8 w-8 place-items-center rounded-pill bg-err-600 text-white shadow-sm dark:bg-err-500 shrink-0">
                <AlertCircle size={18} />
              </div>
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-pill bg-ok-600 text-white shadow-sm dark:bg-ok-500 shrink-0">
                <Sparkles size={18} />
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                {isProcessing
                  ? 'Đang nhận diện giao dịch bằng AI'
                  : allErrors
                    ? 'Không thể phân tích ảnh'
                    : 'Hoàn tất phân tích ảnh'}
              </h4>
              <p className="text-xs text-brand-800 dark:text-brand-300 mt-0.5">
                {isProcessing
                  ? stageLabel
                  : isAnyError
                    ? 'Có lỗi xảy ra trong quá trình gọi AI.'
                    : 'Đã trích xuất thông tin thành công.'}
              </p>
            </div>
          </div>

          {/* Live timer badge */}
          <div className="flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-2xs font-medium text-ink-700 shadow-sm dark:bg-surface-dark dark:text-inkDark-600 shrink-0">
            <Clock size={12} className={clsx(isProcessing && 'animate-pulse text-brand-600 dark:text-brand-400')} />
            <span className="tabular-nums font-semibold">{elapsedSeconds}s</span>
            <span className="text-ink-400">/ 45s</span>
          </div>
        </div>

        {/* Dynamic helpful note if taking longer than usual */}
        {elapsedSeconds >= 10 && isProcessing && (
          <div className="mt-3 rounded border border-brand-300/60 bg-white/70 px-2.5 py-1.5 text-2xs text-brand-900 dark:border-brand-700/50 dark:bg-black/20 dark:text-brand-200">
            💡 Ảnh có nhiều giao dịch hoặc máy chủ AI đang xử lý kỹ lưỡng. Vui lòng chờ thêm vài giây…
          </div>
        )}
      </div>

      {/* Grid of image cards */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {jobs.map(job => (
          <li
            key={job.image.id}
            className={clsx(
              'group relative flex flex-col overflow-hidden rounded-card border bg-surface transition-all dark:bg-surface-dark',
              job.status === 'processing' && 'border-brand-500 ring-2 ring-brand-500/20 shadow-sm',
              job.status === 'done' && 'border-ok-500 ring-1 ring-ok-500/30',
              job.status === 'error' && 'border-err-500 ring-1 ring-err-500/30',
              job.status === 'pending' && 'border-ink-200 dark:border-ink-700',
            )}
          >
            <div className="relative aspect-square w-full bg-surface-sunken dark:bg-surface-dark-sunken">
              <img
                src={job.image.previewUrl}
                alt=""
                className={clsx(
                  'h-full w-full object-cover transition',
                  job.status === 'processing' && 'opacity-50 scale-95',
                  job.status === 'error' && 'opacity-60 grayscale',
                )}
              />
              {job.status === 'processing' && (
                <div className="absolute inset-0 grid place-items-center bg-brand-950/25 backdrop-blur-[1px]">
                  <div className="flex flex-col items-center gap-1.5 p-2 text-center text-white">
                    <Loader2 className="animate-spin text-white" size={24} strokeWidth={2.5} />
                    <span className="text-2xs font-semibold drop-shadow">Đang đọc…</span>
                  </div>
                </div>
              )}
              {job.status === 'done' && (
                <div className="absolute bottom-1.5 right-1.5 rounded-pill bg-ok-600 px-2 py-0.5 text-2xs font-bold text-white shadow">
                  ✓ {job.rows.length} GD
                </div>
              )}
            </div>

            {/* Error detail */}
            {job.status === 'error' && (
              <div className="p-2 bg-err-50/90 text-2xs text-err-700 dark:bg-err-950/40 dark:text-err-300 border-t border-err-200 dark:border-err-800">
                <p className="line-clamp-2 font-medium" title={job.error}>
                  {job.error || 'Lỗi không xác định'}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* When failed, show error box and retry/back buttons */}
      {isAnyError && !isProcessing && (
        <div className="rounded-card border border-err-200 bg-err-50/50 p-3 text-xs text-err-700 dark:border-err-800/40 dark:bg-err-900/10 dark:text-err-300 flex flex-wrap items-center justify-between gap-3">
          <span>Không thể trích xuất giao dịch từ ảnh. Bạn có thể thử lại hoặc chọn ảnh khác rõ nét hơn.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 text-xs"
              onClick={onCancel}
            >
              <ArrowLeft size={13} /> Chọn ảnh khác
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5 text-xs"
              onClick={onRetry}
            >
              <RefreshCw size={13} /> Thử lại
            </button>
          </div>
        </div>
      )}
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
