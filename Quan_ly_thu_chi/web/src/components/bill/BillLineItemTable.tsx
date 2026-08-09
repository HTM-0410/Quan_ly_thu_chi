import { Plus, X } from 'lucide-react';
import clsx from 'clsx';
import type { BillItemInput } from '../../lib/api';
import { formatVNDInput, parseVNDInput } from '../../lib/format';
import { sanityCheckBillItem, type BillItemSanity } from '../../lib/billOcr';

interface BillLineItemTableProps {
  items: BillItemInput[];
  onChange: (items: BillItemInput[]) => void;
  /** Hiển thị cảnh báo nếu tổng bill lệch tổng dòng > 10.000đ */
  declaredTotalMinor: number | null;
  /** Readonly mode (chỉ xem). */
  readonly?: boolean;
}

export function BillLineItemTable({
  items,
  onChange,
  declaredTotalMinor,
  readonly = false,
}: BillLineItemTableProps) {
  const computedSum = items.reduce((s, it) => s + it.line_total_minor, 0);
  const diff = declaredTotalMinor !== null ? Math.abs(declaredTotalMinor - computedSum) : 0;
  const showDiffWarning = declaredTotalMinor !== null && diff > 10_000;

  function update(idx: number, patch: Partial<BillItemInput>) {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      // Tự tính lại line_total khi SL hoặc đơn giá đổi (nếu user chưa sửa tay).
      if (patch.quantity !== undefined || patch.unit_price_minor !== undefined) {
        merged.line_total_minor = Math.round(merged.quantity * merged.unit_price_minor);
      }
      return merged;
    });
    onChange(next);
  }

  function addRow() {
    onChange([
      ...items,
      { product_name: '', quantity: 1, unit_price_minor: 0, line_total_minor: 0, note: null },
    ]);
  }

  function removeRow(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function moveRow(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const tmp = next[idx]!;
    next[idx] = next[target]!;
    next[target] = tmp;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {/* === Mobile view: card list (hidden ≥ md) === */}
      <div className="space-y-2 md:hidden">
        {items.map((it, idx) => {
          const sanity: BillItemSanity = sanityCheckBillItem({
            name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price_minor,
            line_total: it.line_total_minor,
            note: it.note ?? null,
          });
          const rowClass =
            sanity.level === 'error'
              ? 'border-err-300 bg-err-50/40 dark:border-err-500/40 dark:bg-err-700/10'
              : sanity.level === 'warning'
                ? 'border-warn-300 bg-warn-50/40 dark:border-warn-500/40 dark:bg-warn-500/10'
                : 'border-ink-200 dark:border-ink-700';
          return (
            <div
              key={idx}
              className={clsx(
                'rounded-card border bg-surface-raised p-2.5 dark:bg-surface-dark-raised',
                rowClass,
              )}
            >
              {/* Row 1: STT + Tên SP + actions */}
              <div className="flex items-start gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-sunken text-2xs font-semibold tabular-nums text-ink-500 dark:bg-surface-dark-sunken dark:text-inkDark-500">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    aria-label={`Tên sản phẩm dòng ${idx + 1}`}
                    className={clsx(
                      'input !py-1.5 !text-sm w-full',
                      !it.product_name.trim() && '!border-err-500',
                    )}
                    value={it.product_name}
                    onChange={e => update(idx, { product_name: e.target.value })}
                    placeholder="Tên sản phẩm"
                    disabled={readonly}
                  />
                  {sanity.level !== 'ok' && (
                    <div
                      className={clsx(
                        'mt-1 text-2xs',
                        sanity.level === 'error'
                          ? 'text-err-600 dark:text-err-500'
                          : 'text-warn-600 dark:text-warn-400',
                      )}
                    >
                      {sanity.reason}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  {!readonly && items.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label={`Lên ${idx + 1}`}
                        className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-surface-s hover:text-ink-700 dark:hover:bg-surface-dark-s dark:hover:text-inkDark-300"
                        onClick={() => moveRow(idx, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`Xuống ${idx + 1}`}
                        className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-surface-s hover:text-ink-700 dark:hover:bg-surface-dark-s dark:hover:text-inkDark-300"
                        onClick={() => moveRow(idx, 1)}
                      >
                        ▼
                      </button>
                    </>
                  )}
                  {!readonly && (
                    <button
                      type="button"
                      aria-label={`Xoá dòng ${idx + 1}`}
                      className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-err-50 hover:text-err-500 dark:hover:bg-err-700/15"
                      onClick={() => removeRow(idx)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              {/* Row 2: SL | Đơn giá | Thành tiền */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-500 dark:text-inkDark-500">
                    SL
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Số lượng dòng ${idx + 1}`}
                    className="input !py-1.5 !text-sm mt-0.5 w-full text-right tabular-nums"
                    value={String(it.quantity)}
                    onChange={e => {
                      const v = Number(e.target.value.replace(',', '.'));
                      update(idx, { quantity: Number.isFinite(v) && v > 0 ? v : 0 });
                    }}
                    disabled={readonly}
                  />
                </label>
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-500 dark:text-inkDark-500">
                    Đơn giá
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Đơn giá dòng ${idx + 1}`}
                    className="input !py-1.5 !text-sm mt-0.5 w-full text-right tabular-nums"
                    value={formatVNDInput((it.unit_price_minor / 100).toString())}
                    onChange={e =>
                      update(idx, {
                        unit_price_minor: Math.max(0, parseVNDInput(e.target.value)),
                      })
                    }
                    disabled={readonly}
                  />
                </label>
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-500 dark:text-inkDark-500">
                    Thành tiền
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Thành tiền dòng ${idx + 1}`}
                    className="input !py-1.5 !text-sm mt-0.5 w-full text-right tabular-nums"
                    value={formatVNDInput((it.line_total_minor / 100).toString())}
                    onChange={e =>
                      update(idx, {
                        line_total_minor: Math.max(0, parseVNDInput(e.target.value)),
                      })
                    }
                    disabled={readonly}
                  />
                </label>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-3 py-6 text-center text-xs text-ink-500 dark:border-ink-700 dark:bg-surface-dark-sunken dark:text-inkDark-500">
            Chưa có sản phẩm nào.
          </div>
        )}
      </div>

      {/* === Desktop view: table (hidden < md) === */}
      <div className="hidden overflow-hidden rounded-card border border-ink-200 dark:border-ink-700 md:block">
        <table className="w-full text-xs">
          <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-ink-500 dark:bg-surface-dark-sunken dark:text-inkDark-500">
            <tr>
              <th className="w-8 px-2 py-1.5 text-center">#</th>
              <th className="px-2 py-1.5 text-left">Tên sản phẩm</th>
              <th className="w-16 px-2 py-1.5 text-right">SL</th>
              <th className="w-28 px-2 py-1.5 text-right">Đơn giá</th>
              <th className="w-28 px-2 py-1.5 text-right">Thành tiền</th>
              {!readonly && <th className="w-10 px-2 py-1.5 text-center"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const sanity: BillItemSanity = sanityCheckBillItem({
                name: it.product_name,
                quantity: it.quantity,
                unit_price: it.unit_price_minor,
                line_total: it.line_total_minor,
                note: it.note ?? null,
              });
              const rowClass =
                sanity.level === 'error'
                  ? 'bg-err-50/40 dark:bg-err-700/10'
                  : sanity.level === 'warning'
                    ? 'bg-warn-50/40 dark:bg-warn-500/10'
                    : '';
              return (
                <tr key={idx} className={clsx('border-t border-ink-100 dark:border-ink-800', rowClass)}>
                  <td className="px-2 py-1.5 text-center tabular-nums text-ink-500 dark:text-inkDark-500">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{idx + 1}</span>
                      {!readonly && items.length > 1 && (
                        <div className="flex flex-col">
                          <button
                            type="button"
                            aria-label={`Lên ${idx + 1}`}
                            className="text-ink-400 hover:text-ink-700 dark:hover:text-inkDark-300"
                            onClick={() => moveRow(idx, -1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label={`Xuống ${idx + 1}`}
                            className="text-ink-400 hover:text-ink-700 dark:hover:text-inkDark-300"
                            onClick={() => moveRow(idx, 1)}
                          >
                            ▼
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      aria-label={`Tên sản phẩm dòng ${idx + 1}`}
                      className={clsx(
                        'input !py-1 !text-xs w-full',
                        !it.product_name.trim() && '!border-err-500',
                      )}
                      value={it.product_name}
                      onChange={e => update(idx, { product_name: e.target.value })}
                      placeholder="Tên SP..."
                      disabled={readonly}
                    />
                    {sanity.level !== 'ok' && (
                      <div
                        className={clsx(
                          'mt-0.5 text-2xs',
                          sanity.level === 'error'
                            ? 'text-err-600 dark:text-err-500'
                            : 'text-warn-600 dark:text-warn-400',
                        )}
                      >
                        {sanity.reason}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Số lượng dòng ${idx + 1}`}
                      className="input !py-1 !text-xs w-full text-right tabular-nums"
                      value={String(it.quantity)}
                      onChange={e => {
                        const v = Number(e.target.value.replace(',', '.'));
                        update(idx, { quantity: Number.isFinite(v) && v > 0 ? v : 0 });
                      }}
                      disabled={readonly}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Đơn giá dòng ${idx + 1}`}
                      className="input !py-1 !text-xs w-full text-right tabular-nums"
                      value={formatVNDInput((it.unit_price_minor / 100).toString())}
                      onChange={e =>
                        update(idx, {
                          unit_price_minor: Math.max(0, parseVNDInput(e.target.value)),
                        })
                      }
                      disabled={readonly}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Thành tiền dòng ${idx + 1}`}
                      className="input !py-1 !text-xs w-full text-right tabular-nums"
                      value={formatVNDInput((it.line_total_minor / 100).toString())}
                      onChange={e =>
                        update(idx, {
                          line_total_minor: Math.max(0, parseVNDInput(e.target.value)),
                        })
                      }
                      disabled={readonly}
                    />
                  </td>
                  {!readonly && (
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        aria-label={`Xoá dòng ${idx + 1}`}
                        className="btn-ghost !p-1 text-ink-400 hover:text-err-500"
                        onClick={() => removeRow(idx)}
                      >
                        <X size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={readonly ? 5 : 6}
                  className="px-3 py-4 text-center text-xs text-ink-500 dark:text-inkDark-500"
                >
                  Chưa có sản phẩm nào.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-200 bg-surface-sunken text-xs font-semibold dark:border-ink-700 dark:bg-surface-dark-sunken">
              <td colSpan={4} className="px-2 py-2 text-right">
                Tổng cộng ({items.length} món):
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-ink-900 dark:text-inkDark-900">
                {formatVNDInput((computedSum / 100).toString())} ₫
              </td>
              {!readonly && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile-only summary footer (desktop có footer trong table) */}
      <div className="flex items-center justify-between rounded-card border border-ink-200 bg-surface-sunken px-3 py-2 text-xs dark:border-ink-700 dark:bg-surface-dark-sunken md:hidden">
        <span className="text-ink-600 dark:text-inkDark-500">
          Tổng cộng ({items.length} món):
        </span>
        <span className="font-semibold tabular-nums text-ink-900 dark:text-inkDark-900">
          {formatVNDInput((computedSum / 100).toString())} ₫
        </span>
      </div>

      {!readonly && (
        <button
          type="button"
          className="btn-ghost !text-2xs inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          onClick={addRow}
        >
          <Plus size={11} strokeWidth={2.5} /> Thêm dòng
        </button>
      )}
      {showDiffWarning && (
        <div className="rounded-card border border-warn-200 bg-warn-50/50 px-3 py-2 text-2xs text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-400">
          ⚠️ Tổng bill khai báo lệch tổng dòng {(diff / 100).toLocaleString('vi-VN')}₫ (cho
          phép ±10.000₫).
        </div>
      )}
    </div>
  );
}
