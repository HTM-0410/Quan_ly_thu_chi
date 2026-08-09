import { Camera, Edit3, Receipt, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { formatVND } from '../../lib/format';
import type { BillWithItems } from '../../lib/api';

interface BillBadgeProps {
  bill: BillWithItems | null;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}

/**
 * Badge hiển thị trong form sửa giao dịch khi GD có bill.
 * - Nếu chưa có bill: hiện nút "Chụp bill" (large).
 * - Nếu đã có bill: hiện summary + nút sửa/xoá.
 */
export function BillBadge({
  bill,
  onCreate,
  onEdit,
  onDelete,
  className,
}: BillBadgeProps) {
  if (!bill) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-card border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/15',
          className,
        )}
      >
        <Camera size={14} strokeWidth={2} />
        Chụp bill mua sắm
      </button>
    );
  }

  const channelLabel =
    bill.bill.channel_type === 'online'
      ? bill.bill.online_marketplace === 'other'
        ? bill.bill.online_marketplace_other || 'Online'
        : labelForMarketplace(bill.bill.online_marketplace)
      : bill.bill.store_name || 'Cửa hàng';

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-2 rounded-card border border-brand-200 bg-brand-50/50 px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-500/10',
        className,
      )}
    >
      <Receipt size={16} className="shrink-0 text-brand-600 dark:text-brand-400" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink-900 dark:text-inkDark-900">
          📋 Bill ({bill.items.length} món · {channelLabel})
        </div>
        <div className="mt-0.5 text-xs text-ink-500 dark:text-inkDark-500">
          Tổng bill: {formatVND(bill.bill.declared_total_minor)}
          {bill.bill.declared_total_minor !== sumItems(bill) && (
            <span className="ml-1 text-warn-700 dark:text-warn-400">
              (tổng dòng: {formatVND(sumItems(bill))})
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="btn-ghost inline-flex items-center gap-1 !px-2 !py-1 !text-2xs text-brand-700 hover:!bg-brand-100 dark:text-brand-300 dark:hover:!bg-brand-500/20"
        aria-label="Sửa bill"
      >
        <Edit3 size={11} /> Sửa
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="btn-ghost inline-flex items-center gap-1 !px-2 !py-1 !text-2xs text-err-600 hover:!bg-err-50 dark:text-err-500 dark:hover:!bg-err-700/15"
        aria-label="Xoá bill"
      >
        <Trash2 size={11} /> Xoá
      </button>
    </div>
  );
}

function sumItems(b: BillWithItems): number {
  return b.items.reduce((s, it) => s + it.line_total_minor, 0);
}

function labelForMarketplace(m: string | null): string {
  switch (m) {
    case 'shopee':
      return 'Shopee';
    case 'lazada':
      return 'Lazada';
    case 'tiktok_shop':
      return 'TikTok Shop';
    case 'other':
      return 'Khác';
    default:
      return 'Online';
  }
}
