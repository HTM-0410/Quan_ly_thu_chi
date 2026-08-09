import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Edit3,
  FileText,
  Loader2,
  RefreshCcw,
  Store,
  X,
} from 'lucide-react';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';
import { useToast } from '../Toast';
import {
  type BillWithItems,
  getBillWithItems,
  deleteBill,
} from '../../lib/api';
import { formatVND } from '../../lib/format';

interface BillDetailModalProps {
  open: boolean;
  /** Transaction cần xem bill. */
  transactionId: string | null;
  /** Tổng tiền GD (VND × 100) — để hiện diff vs tổng bill. */
  transactionAmountMinor: number;
  /** Callback khi đóng modal. */
  onClose: () => void;
  /** Callback khi user bấm "Sửa" — mở BillOcrModal. */
  onEdit?: (billWithItems: BillWithItems) => void;
  /** Callback khi xóa bill — parent reload data. */
  onDeleted?: () => void;
}

/**
 * Modal read-only hiển thị bill + line items của 1 giao dịch.
 * Mở từ danh sách GD (nút Info) — không cần vào Sửa GD.
 * - Có nút "Sửa" → mở BillOcrModal mode update.
 * - Có nút "Xoá" → delete bill (parent reload).
 */
export function BillDetailModal({
  open,
  transactionId,
  transactionAmountMinor,
  onClose,
  onEdit,
  onDeleted,
}: BillDetailModalProps) {
  const toast = useToast();
  const [bill, setBill] = useState<BillWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch bill khi mở modal.
  useEffect(() => {
    if (!open || !transactionId) {
      setBill(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBillWithItems(transactionId)
      .then(data => {
        if (cancelled) return;
        if (!data) {
          setError('Giao dịch này chưa có bill.');
        } else {
          setBill(data);
        }
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  async function handleDelete() {
    if (!bill) return;
    if (!window.confirm('Xoá bill này? Giao dịch gốc vẫn được giữ nguyên.')) return;
    setDeleting(true);
    try {
      await deleteBill(bill.bill.id);
      toast.push('success', 'Đã xoá bill');
      onDeleted?.();
      onClose();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const channelLabel = (() => {
    if (!bill) return '';
    if (bill.bill.channel_type === 'online') {
      return `Online${bill.bill.online_marketplace ? ` · ${bill.bill.online_marketplace}` : ''}`;
    }
    return 'Offline';
  })();

  const sumItems = bill?.items.reduce((s, it) => s + it.line_total_minor, 0) ?? 0;
  const declaredTotal = bill?.bill.declared_total_minor ?? sumItems;
  const diffVsTx = transactionAmountMinor > 0
    ? Math.abs(declaredTotal - transactionAmountMinor)
    : 0;
  const diffColor = diffVsTx > 10000
    ? 'text-err-600 dark:text-err-500'
    : 'text-ok-600 dark:text-ok-500';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={bill?.bill.store_name ? `Bill · ${bill.bill.store_name}` : 'Bill mua sắm'}
      description={
        bill
          ? `Kênh ${channelLabel} · ${bill.items.length} sản phẩm`
          : 'Đang tải thông tin bill'
      }
      size="lg"
      footer={null}
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500">
          <Loader2 size={16} className="animate-spin" />
          Đang tải bill…
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-10 text-sm">
          <AlertTriangle size={28} className="text-ink-400" strokeWidth={1.8} />
          <p className="text-ink-500">{error}</p>
          <button type="button" className="btn-ghost" onClick={onClose}>
            <X size={14} />
            Đóng
          </button>
        </div>
      )}

      {!loading && bill && (
        <div className="space-y-4">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-ink-200 bg-surface-sunken px-3 py-2 text-xs dark:border-ink-800 dark:bg-surface-dark-sunken">
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-2xs font-medium',
                bill.bill.channel_type === 'online'
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'border-ink-300 bg-white text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-inkDark-300',
              )}
            >
              {bill.bill.channel_type === 'online' ? '🛒 Online' : '🏬 Offline'}
            </span>
            {bill.bill.online_marketplace && (
              <span className="text-ink-600 dark:text-inkDark-500">
                {bill.bill.online_marketplace}
                {bill.bill.online_marketplace_other ? ` · ${bill.bill.online_marketplace_other}` : ''}
              </span>
            )}
            {bill.bill.store_name && (
              <span className="inline-flex items-center gap-1 text-ink-600 dark:text-inkDark-500">
                <Store size={11} strokeWidth={2} />
                {bill.bill.store_name}
              </span>
            )}
          </div>

          {/* Line items */}
          {bill.items.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-300 px-3 py-6 text-center text-xs text-ink-500 dark:border-ink-700 dark:text-inkDark-500">
              <FileText size={20} className="mx-auto mb-1 opacity-60" strokeWidth={1.6} />
              Bill chưa có sản phẩm nào.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-ink-200 dark:border-ink-800">
              <table className="w-full text-xs">
                <thead className="bg-surface-sunken text-2xs uppercase tracking-wider text-ink-500 dark:bg-surface-dark-sunken dark:text-inkDark-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
                    <th className="px-2 py-2 text-right font-medium">SL</th>
                    <th className="px-2 py-2 text-right font-medium">Đơn giá</th>
                    <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {bill.items.map(item => (
                    <tr key={item.id} className="text-ink-800 dark:text-inkDark-200">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.product_name}</div>
                        {item.note && (
                          <div className="text-2xs text-ink-500 dark:text-inkDark-500">
                            {item.note}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatVND(item.unit_price_minor)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatVND(item.line_total_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tổng */}
          <div className="flex items-center justify-between rounded-card border border-ink-200 bg-surface-sunken px-3 py-2 text-xs dark:border-ink-800 dark:bg-surface-dark-sunken">
            <span className="text-ink-600 dark:text-inkDark-500">
              Tổng bill khai báo
              <span className={clsx('ml-2 text-2xs', diffColor)}>
                {diffVsTx > 10000
                  ? `(lệch ${formatVND(diffVsTx)} vs giao dịch)`
                  : `(khớp giao dịch)`}
              </span>
            </span>
            <span className="text-base font-semibold tabular-nums text-ink-900 dark:text-inkDark-100">
              {formatVND(declaredTotal)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-200 pt-3 dark:border-ink-800">
            {onEdit && (
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-1.5"
                onClick={() => {
                  if (bill) onEdit(bill);
                }}
              >
                <Edit3 size={14} strokeWidth={2} />
                Sửa
              </button>
            )}
            <button
              type="button"
              className="btn-ghost text-err-600 hover:bg-err-50 dark:text-err-500 dark:hover:bg-err-700/15 inline-flex items-center gap-1.5"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Spinner size="sm" />}
              <RefreshCcw size={14} strokeWidth={2} />
              Xoá bill
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
