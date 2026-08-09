import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  FileSearch,
  Loader2,
  Save,
} from 'lucide-react';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';
import { useToast } from '../Toast';
import { ReceiptDropzone, type StagedImage } from '../ocr/ReceiptDropzone';
import { ReceiptImportFallback } from '../ocr/ReceiptImportFallback';
import {
  BillLineItemTable,
} from './BillLineItemTable';
import { BillChannelPicker } from './BillChannelPicker';
import {
  type BillChannel,
  type BillItemInput,
  type BillWithItems,
  type OnlineMarketplace,
  createBillWithItems,
  updateBillWithItems,
  deleteBill,
  getBillWithItems,
} from '../../lib/api';
import { parseBillFromImage, BillOcrParseError } from '../../lib/billOcr';
import { MissingOcrConfigError } from '../../lib/config';
import { formatVNDInput, parseVNDInput, formatVND } from '../../lib/format';

type Step = 'upload' | 'processing' | 'preview';

interface BillOcrModalProps {
  open: boolean;
  onClose: () => void;
  /** Transaction cần gắn bill. */
  transactionId: string;
  /** Tổng tiền GD (VND × 100) — dùng để validate tổng bill ±10.000đ. */
  transactionAmountMinor: number;
  /** Bill đã có (mode sửa). null = tạo mới. */
  existingBill: BillWithItems | null;
  /** Callback sau khi lưu bill thành công (create hoặc update). */
  onSaved: (billWithItems: BillWithItems) => void;
  /** Callback sau khi xoá bill. */
  onDeleted?: () => void;
}

export function BillOcrModal({
  open,
  onClose,
  transactionId,
  transactionAmountMinor,
  existingBill,
  onSaved,
  onDeleted,
}: BillOcrModalProps) {
  const toast = useToast();
  // Luôn bắt đầu ở bước "Chụp ảnh" khi mở modal — dù là tạo mới hay sửa bill.
  // (Trước đây edit → vào thẳng bước 3 "Xem & sửa", gây khó chịu vì user
  // luôn muốn cập nhật từ ảnh mới để AI xử lý lại.)
  const [step, setStep] = useState<Step>('upload');
  const [image, setImage] = useState<StagedImage | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<'missing_key' | 'other' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [items, setItems] = useState<BillItemInput[]>(() =>
    existingBill
      ? existingBill.items.map(it => ({
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price_minor: it.unit_price_minor,
          line_total_minor: it.line_total_minor,
          note: it.note,
        }))
      : [],
  );
  const [channel, setChannel] = useState<BillChannel>(existingBill?.bill.channel_type ?? 'offline');
  const [marketplace, setMarketplace] = useState<OnlineMarketplace | null>(
    existingBill?.bill.online_marketplace ?? null,
  );
  const [marketplaceOther, setMarketplaceOther] = useState(
    existingBill?.bill.online_marketplace_other ?? '',
  );
  const [storeName, setStoreName] = useState(existingBill?.bill.store_name ?? '');
  const [declaredTotal, setDeclaredTotal] = useState<number | null>(
    existingBill?.bill.declared_total_minor ?? null,
  );

  // Reset khi mở/đóng
  useEffect(() => {
    if (!open) {
      // Cleanup object URL nếu còn
      if (image) URL.revokeObjectURL(image.previewUrl);
      // Luôn reset về bước "Chụp ảnh" khi đóng — lần mở sau sẽ bắt đầu lại từ đầu.
      setStep('upload');
      setImage(null);
      setParseError(null);
      setFallbackReason(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Khi chuyển sang preview, tự fill declaredTotal từ sum nếu chưa có
  useEffect(() => {
    if (step === 'preview' && declaredTotal === null && items.length > 0) {
      const sum = items.reduce((s, it) => s + it.line_total_minor, 0);
      setDeclaredTotal(sum);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startProcessing() {
    if (!image) return;
    setStep('processing');
    setParseError(null);
    setFallbackReason(null);

    try {
      const result = await parseBillFromImage(image.file);

      // Build items từ AI; nếu line_total = 0 thì tính lại = quantity × unit_price
      const newItems: BillItemInput[] = result.items.map(it => ({
        product_name: it.name,
        quantity: it.quantity,
        unit_price_minor: it.unit_price,
        line_total_minor:
          it.line_total > 0
            ? it.line_total
            : Math.round(it.quantity * it.unit_price),
        note: it.note ?? null,
      }));
      setItems(newItems);

      // Pre-fill store name nếu AI đọc được và user chưa có bill
      if (!existingBill && result.store_name && channel === 'offline') {
        setStoreName(result.store_name);
      }
      // Set declared total = sum(items) hoặc AI total (nếu gần)
      if (result.total !== null) {
        setDeclaredTotal(result.total);
      } else {
        const sum = newItems.reduce((s, it) => s + it.line_total_minor, 0);
        setDeclaredTotal(sum);
      }

      // Quality warnings
      if (result.image_quality !== 'good') {
        toast.push(
          'info',
          result.image_quality === 'blurry'
            ? 'Ảnh bị mờ — kiểm tra kết quả trước khi lưu'
            : 'Ảnh chỉ thấy một phần — kiểm tra kết quả trước khi lưu',
        );
      }
      if (result.notes) {
        toast.push('info', result.notes);
      }
      if (newItems.length === 0) {
        toast.push('warn', 'AI không tìm thấy sản phẩm nào — nhập tay hoặc thử ảnh khác');
      }

      setStep('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof MissingOcrConfigError) {
        setFallbackReason('missing_key');
      } else {
        setParseError(msg);
      }
      if (err instanceof MissingOcrConfigError) {
        // Ở lại upload step để user thấy fallback
        setStep('upload');
      } else {
        // Lỗi khác → quay lại upload, user có thể nhập tay
        setStep('upload');
        toast.push('error', `Lỗi đọc bill: ${msg}`);
      }
    }
  }

  function buildPayload(): {
    channel_type: BillChannel;
    online_marketplace: OnlineMarketplace | null;
    online_marketplace_other: string | null;
    store_name: string | null;
    declared_total_minor: number;
    items: BillItemInput[];
  } {
    const sumItems = items.reduce((s, it) => s + it.line_total_minor, 0);
    return {
      channel_type: channel,
      online_marketplace: channel === 'online' ? marketplace : null,
      online_marketplace_other:
        channel === 'online' && marketplace === 'other' ? marketplaceOther.trim() || null : null,
      store_name: channel === 'offline' ? storeName.trim() || null : null,
      declared_total_minor: declaredTotal ?? sumItems,
      items,
    };
  }

  function validate(): string | null {
    if (items.length === 0) return 'Cần ít nhất 1 sản phẩm trong bill';
    const emptyName = items.find(it => !it.product_name.trim());
    if (emptyName) return 'Tên sản phẩm không được trống';
    if (channel === 'online') {
      if (!marketplace) return 'Vui lòng chọn sàn thương mại';
      if (marketplace === 'other' && !marketplaceOther.trim()) {
        return 'Vui lòng nhập tên sàn khác';
      }
    } else {
      if (!storeName.trim()) return 'Vui lòng nhập tên cửa hàng';
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      toast.push('error', err);
      return;
    }
    const payload = buildPayload();
    setSubmitting(true);
    try {
      if (existingBill) {
        await updateBillWithItems(existingBill.bill.id, payload);
        onSaved({
          bill: { ...existingBill.bill, ...payload, item_count: items.length },
          items: existingBill.items.length === items.length
            ? existingBill.items
            : await fetchItemsFromDb(existingBill.bill.transaction_id),
        });
        toast.push('success', 'Đã cập nhật bill');
      } else {
        try {
          await createBillWithItems({ transaction_id: transactionId, ...payload });
        } catch (createErr) {
          // Bill đã tồn tại (race condition hoặc fetch ban đầu fail) → fallback sang update.
          const msg = createErr instanceof Error ? createErr.message : String(createErr);
          const existing = await getBillWithItems(transactionId);
          if (existing) {
            await updateBillWithItems(existing.bill.id, payload);
            onSaved({
              bill: { ...existing.bill, ...payload, item_count: items.length },
              items: payload.items.length > 0
                ? await fetchItemsFromDb(transactionId)
                : existing.items,
            });
            toast.push('success', 'Đã cập nhật bill (đã có sẵn)');
          } else {
            throw new Error(`${msg} (không tìm thấy bill để update)`);
          }
          return;
        }
        // Re-fetch to get DB-generated ids
        const fresh = await fetchBillFromDb(transactionId);
        if (fresh) onSaved(fresh);
        toast.push('success', 'Đã lưu bill');
      }
      onClose();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existingBill) return;
    if (!window.confirm('Xoá bill này? Giao dịch gốc vẫn được giữ nguyên.')) return;
    setDeleting(true);
    try {
      await deleteBill(existingBill.bill.id);
      toast.push('success', 'Đã xoá bill');
      onDeleted?.();
      onClose();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const computedTotal = useMemo(
    () => items.reduce((s, it) => s + it.line_total_minor, 0),
    [items],
  );

  const diffVsTx = declaredTotal !== null ? Math.abs(declaredTotal - transactionAmountMinor) : 0;
  const showTxMismatchWarning = declaredTotal !== null && diffVsTx > 10_000;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (submitting || deleting) return;
        onClose();
      }}
      title={existingBill ? 'Sửa bill mua sắm' : 'Chụp bill mua sắm'}
      description={
        existingBill
          ? 'Cập nhật danh sách sản phẩm và kênh mua hàng.'
          : 'Dùng AI đọc bill siêu thị / hoá đơn online và tách thành danh sách sản phẩm.'
      }
      size="xl"
    >
      <Stepper step={step} hasExistingBill={!!existingBill} />

      <div className="mt-5 space-y-4">
        {step === 'upload' && (
          <>
            <ReceiptDropzone
              images={image ? [image] : []}
              onChange={imgs => setImage(imgs[0] ?? null)}
              maxImages={1}
            />
            {fallbackReason && (
              <ReceiptImportFallback reason={fallbackReason} />
            )}
            {parseError && !fallbackReason && (
              <div className="rounded-card border border-err-200 bg-err-50/60 px-3 py-2 text-xs text-err-700 dark:border-err-500/30 dark:bg-err-500/10 dark:text-err-500">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Lần đọc trước lỗi: {parseError}</span>
                </div>
              </div>
            )}
            <div className="rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-2xs text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
              Hoặc nhập tay: bấm <strong>AI đọc</strong> bỏ trống ảnh cũng được (sẽ báo lỗi và chuyển sang nhập tay).
            </div>
          </>
        )}

        {step === 'processing' && (
          <ProcessingView image={image} />
        )}

        {step === 'preview' && (
          <>
            <BillLineItemTable
              items={items}
              onChange={setItems}
              declaredTotalMinor={declaredTotal}
            />
            <BillChannelPicker
              channel={channel}
              onChannelChange={setChannel}
              marketplace={marketplace}
              onMarketplaceChange={setMarketplace}
              marketplaceOther={marketplaceOther}
              onMarketplaceOtherChange={setMarketplaceOther}
              storeName={storeName}
              onStoreNameChange={setStoreName}
            />
            <div className="grid gap-3 rounded-card border border-ink-200 bg-surface-sunken p-3 dark:border-ink-800 dark:bg-surface-dark-sunken sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-600 dark:text-inkDark-500">
                  Tổng bill (VND)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input mt-1 w-full tabular-nums"
                  value={
                    declaredTotal === null
                      ? formatVNDInput((computedTotal / 100).toString())
                      : formatVNDInput((declaredTotal / 100).toString())
                  }
                  onChange={e => setDeclaredTotal(Math.max(0, parseVNDInput(e.target.value)))}
                  aria-label="Tổng bill"
                />
                <div className="mt-1 text-2xs text-ink-500 dark:text-inkDark-500">
                  Tổng dòng: {formatVND(computedTotal)}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-ink-600 dark:text-inkDark-500">
                  Tổng giao dịch gốc
                </span>
                <div className="mt-1 rounded-card border border-ink-200 bg-surface px-3 py-2 text-sm font-semibold tabular-nums dark:border-ink-700 dark:bg-surface-dark">
                  {formatVND(transactionAmountMinor)}
                </div>
                {showTxMismatchWarning && (
                  <div className="mt-1 text-2xs text-warn-700 dark:text-warn-400">
                    ⚠️ Lệch GD gốc {(diffVsTx / 100).toLocaleString('vi-VN')}₫ (cho phép ±10.000₫).
                    Số dư vẫn ghi nhận theo GD gốc.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-ink-100 bg-surface-sunken px-5 py-3.5 dark:border-ink-800 dark:bg-surface-dark-sunken">
        <div className="flex flex-wrap gap-2">
          {step !== 'upload' && (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5"
              onClick={() => setStep('upload')}
              disabled={submitting}
            >
              <ArrowLeft size={14} /> Quay lại
            </button>
          )}
          {existingBill && step === 'preview' && (
            <button
              type="button"
              className="btn-ghost text-err-600 hover:bg-err-50 dark:text-err-500 dark:hover:bg-err-700/15"
              onClick={handleDelete}
              disabled={submitting || deleting}
            >
              {deleting && <Spinner size="sm" />}
              {deleting ? 'Đang xoá…' : 'Xoá bill'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting || deleting}
          >
            Huỷ
          </button>
          {step === 'upload' && (
            <>
              {existingBill && (
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1.5"
                  onClick={() => setStep('preview')}
                  disabled={submitting}
                >
                  <ArrowLeft size={14} className="rotate-180" /> Bỏ qua, sửa nhanh
                </button>
              )}
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5"
                onClick={startProcessing}
                disabled={!image || fallbackReason === 'missing_key'}
              >
                <FileSearch size={14} /> Phân tích bill
              </button>
            </>
          )}
          {step === 'processing' && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('upload')}
            >
              Huỷ
            </button>
          )}
          {step === 'preview' && (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={handleSave}
              disabled={submitting || deleting}
            >
              {submitting ? (
                <Spinner size="sm" />
              ) : (
                <Save size={14} />
              )}
              {submitting ? 'Đang lưu…' : existingBill ? 'Cập nhật bill' : 'Lưu bill'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stepper({ step, hasExistingBill }: { step: Step; hasExistingBill: boolean }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Chụp ảnh' },
    { id: 'processing', label: 'AI đọc' },
    { id: 'preview', label: 'Xem & sửa' },
  ];
  const currentIdx = steps.findIndex(s => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-2xs font-medium text-ink-500 dark:text-inkDark-500">
      {steps.map((s, idx) => {
        const showNum = !hasExistingBill || idx > 0 || step !== 'preview';
        return (
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
              {showNum ? idx + 1 : '✓'}
            </span>
            <span className={clsx(idx === currentIdx && 'font-semibold text-ink-900 dark:text-inkDark-900')}>
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-6 bg-ink-200 dark:bg-ink-700" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ProcessingView({ image }: { image: StagedImage | null }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700 dark:text-inkDark-700">
        Đang gửi ảnh tới AI để trích xuất danh sách sản phẩm…
      </p>
      {image && (
        <div className="relative mx-auto aspect-square w-40 overflow-hidden rounded-card border border-ink-200 bg-surface-sunken dark:border-ink-700">
          <img src={image.previewUrl} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <Loader2 className="animate-spin text-white" size={20} strokeWidth={2} />
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: re-fetch bill sau khi save (để lấy DB-generated ids và timestamps)
async function fetchBillFromDb(transactionId: string): Promise<BillWithItems | null> {
  const { getBillWithItems } = await import('../../lib/api');
  return getBillWithItems(transactionId);
}

async function fetchItemsFromDb(transactionId: string): Promise<import('../../lib/api').BillItem[]> {
  const fresh = await fetchBillFromDb(transactionId);
  return fresh?.items ?? [];
}

// Tránh TS warning nếu BillOcrParseError không được dùng trực tiếp
void BillOcrParseError;
void Camera;
