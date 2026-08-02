import { useMemo } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check } from 'lucide-react';
import type { Category, FinancialAccount } from '../../lib/types';
import { TRANSACTION_TYPE_LABEL } from '../../lib/labels';
import { parseVNDInput, formatVNDInput } from '../../lib/format';

export interface PreviewRow {
  /** Stable key — uuid sinh ra từ crypto.randomUUID() khi row được tạo. */
  id: string;
  image_id: string;
  selected: boolean;
  type: 'income' | 'expense';
  amount_minor: number;
  /** ISO local datetime string (YYYY-MM-DDTHH:mm:ss). */
  occurred_at_local: string;
  payee: string;
  note: string;
  account_id: string;
  category_id: string;
  confidence: number;
  /** Raw gợi ý từ AI — giữ để user tham khảo. */
  account_hint?: string | null;
  suggested_category?: string | null;
  /** Cảnh báo từ sanityCheckTransaction — UI hiển thị màu vàng. */
  sanity_warning?: string | null;
  /** Lỗi nghiêm trọng (vd amount = 0) — UI tô đỏ + bỏ chọn. */
  sanity_error?: string | null;
}

interface ReceiptPreviewTableProps {
  rows: PreviewRow[];
  onChange: (rows: PreviewRow[]) => void;
  accounts: FinancialAccount[];
  categories: Category[];
}

export function ReceiptPreviewTable({
  rows,
  onChange,
  accounts,
  categories,
}: ReceiptPreviewTableProps) {
  const filteredCatsByType = useMemo(() => {
    const map = new Map<'income' | 'expense', Category[]>();
    map.set('income', categories.filter(c => c.kind === 'income' || c.kind === 'both'));
    map.set('expense', categories.filter(c => c.kind === 'expense' || c.kind === 'both'));
    return map;
  }, [categories]);

  const accountById = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    accounts.forEach(a => map.set(a.id, a));
    return map;
  }, [accounts]);

  const selectedCount = rows.filter(r => r.selected).length;
  const validCount = rows.filter(
    r => r.selected && r.account_id && r.amount_minor > 0,
  ).length;

  function update(id: string, patch: Partial<PreviewRow>) {
    // Nếu user sửa amount_minor thành > 0 thì auto-tick selected (tiện cho case
    // AI trả amount=0, user tự nhập tay). Nếu sửa khác (payee, note...) giữ nguyên.
    const next = rows.map(r => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      const amountTouched = 'amount_minor' in patch;
      if (amountTouched && merged.amount_minor > 0 && !merged.selected) {
        return { ...merged, selected: true };
      }
      return merged;
    });
    onChange(next);
  }

  function selectAll(value: boolean) {
    onChange(rows.map(r => ({ ...r, selected: value })));
  }

  function selectHighConfidence(threshold = 0.7) {
    onChange(
      rows.map(r => ({
        ...r,
        selected: r.confidence >= threshold && r.account_id !== '',
      })),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600 dark:text-inkDark-500">
        <div>
          Đã chọn <strong>{selectedCount}</strong> / {rows.length} giao dịch (
          <strong className="text-ok-700 dark:text-ok-500">{validCount}</strong> hợp lệ)
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn-ghost !text-2xs"
            onClick={() => selectAll(true)}
          >
            Chọn tất cả
          </button>
          <button
            type="button"
            className="btn-ghost !text-2xs"
            onClick={() => selectAll(false)}
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            className="btn-ghost !text-2xs"
            onClick={() => selectHighConfidence()}
          >
            Chỉ chọn ≥ 70%
          </button>
        </div>
      </div>

      {rows.some(r => r.sanity_error || r.sanity_warning) && (
        <ul className="space-y-1.5 rounded-card border border-warn-200 bg-warn-50/60 p-2.5 text-2xs dark:border-warn-500/30 dark:bg-warn-500/10">
          {rows
            .filter(r => r.sanity_error || r.sanity_warning)
            .map(r => (
              <li
                key={r.id}
                className={clsx(
                  'flex items-start gap-1.5',
                  r.sanity_error ? 'text-err-700 dark:text-err-500' : 'text-warn-700 dark:text-warn-400',
                )}
              >
                <AlertTriangle size={11} strokeWidth={2} className="mt-0.5 shrink-0" />
                <span className="flex-1">
                  <strong>{r.payee || r.suggested_category || 'GD'}</strong> ({Math.round(r.amount_minor / 100).toLocaleString('vi-VN')}₫):{' '}
                  {r.sanity_error ?? r.sanity_warning}
                </span>
              </li>
            ))}
        </ul>
      )}

      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {rows.map(r => {
          const valid = r.account_id && r.amount_minor > 0;
          const lowConf = r.confidence < 0.6;
          const amountMajor = Math.round(r.amount_minor / 100);
          return (
            <div
              key={r.id}
              className={clsx(
                'rounded-card border bg-surface px-3 py-2.5 transition-colors dark:bg-surface-dark',
                'border-ink-200 dark:border-ink-700',
                !r.selected && 'opacity-50',
                r.sanity_error && r.selected && 'border-err-300 bg-err-50/60 dark:border-err-700/50 dark:bg-err-700/15',
                !r.sanity_error && r.sanity_warning && r.selected && 'border-warn-300 bg-warn-50/50 dark:border-warn-500/40 dark:bg-warn-500/10',
                !valid && r.selected && !r.sanity_error && 'border-err-300 bg-err-50/30 dark:border-err-700/40 dark:bg-err-700/10',
              )}
            >
              {/* Hàng 1: Checkbox | Loại + Số tiền (nổi bật) | Conf badge */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={`Chọn giao dịch ${r.payee || r.id}`}
                  checked={r.selected}
                  onChange={e => update(r.id, { selected: e.target.checked })}
                  className="h-5 w-5 shrink-0 accent-brand-500"
                />

                <select
                  aria-label="Loại giao dịch"
                  className={clsx(
                    'input !py-1 !text-xs font-medium w-24 shrink-0',
                    r.type === 'income'
                      ? 'text-ok-700 dark:text-ok-500'
                      : 'text-err-700 dark:text-err-500',
                  )}
                  value={r.type}
                  onChange={e =>
                    update(r.id, {
                      type: e.target.value as 'income' | 'expense',
                      category_id: '',
                    })
                  }
                >
                  <option value="expense">{TRANSACTION_TYPE_LABEL.expense}</option>
                  <option value="income">{TRANSACTION_TYPE_LABEL.income}</option>
                </select>

                <div className="flex-1 min-w-0">
                  <div
                    className={clsx(
                      'text-lg font-bold tabular-nums leading-tight truncate',
                      r.type === 'income'
                        ? 'text-ok-700 dark:text-ok-500'
                        : 'text-err-700 dark:text-err-500',
                    )}
                  >
                    {amountMajor > 0
                      ? `${amountMajor.toLocaleString('vi-VN')} ₫`
                      : <span className="text-ink-400 dark:text-inkDark-600 font-normal italic">0 ₫</span>}
                  </div>
                  {r.suggested_category && (
                    <div className="text-2xs text-ink-500 dark:text-inkDark-500 truncate">
                      Gợi ý: {r.suggested_category}
                    </div>
                  )}
                </div>

                <span
                  className={clsx(
                    'inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums',
                    r.confidence >= 0.8
                      ? 'bg-ok-50 text-ok-700 dark:bg-ok-700/15 dark:text-ok-500'
                      : r.confidence >= 0.6
                        ? 'bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-400'
                        : 'bg-err-50 text-err-700 dark:bg-err-700/15 dark:text-err-500',
                  )}
                  title={`Độ tin cậy: ${(r.confidence * 100).toFixed(0)}%`}
                >
                  {lowConf ? (
                    <AlertTriangle size={11} strokeWidth={2.5} />
                  ) : (
                    <Check size={11} strokeWidth={2.5} />
                  )}
                  {Math.round(r.confidence * 100)}%
                </span>
              </div>

              {/* Hàng 2: Thời gian | Số tiền (edit) | Đối tượng | Tài khoản | Danh mục */}
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <label className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    Thời gian
                  </label>
                  <input
                    type="datetime-local"
                    aria-label="Thời gian"
                    className="input !py-1 !text-xs w-full"
                    value={r.occurred_at_local}
                    onChange={e => update(r.id, { occurred_at_local: e.target.value })}
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    Số tiền (VND)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Số tiền VND"
                    className="input !py-1 !text-xs tabular-nums w-full"
                    value={formatVNDInput(amountMajor)}
                    onChange={e =>
                      update(r.id, {
                        amount_minor: Math.max(0, parseVNDInput(e.target.value)),
                      })
                    }
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    Đối tượng
                  </label>
                  <input
                    type="text"
                    aria-label="Đối tượng"
                    className="input !py-1 !text-xs w-full"
                    value={r.payee}
                    onChange={e => update(r.id, { payee: e.target.value })}
                    placeholder={r.suggested_category ?? '—'}
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    Tài khoản <span className="text-err-600">*</span>
                  </label>
                  <select
                    aria-label="Tài khoản"
                    className={clsx(
                      'input !py-1 !text-xs w-full',
                      !r.account_id && '!border-err-500',
                    )}
                    value={r.account_id}
                    onChange={e => update(r.id, { account_id: e.target.value })}
                    required
                  >
                    <option value="">-- Chọn --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {r.account_hint && (
                    <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500 truncate" title={r.account_hint}>
                      Hint: {r.account_hint}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    Danh mục
                  </label>
                  <select
                    aria-label="Danh mục"
                    className="input !py-1 !text-xs w-full"
                    value={r.category_id}
                    onChange={e => update(r.id, { category_id: e.target.value })}
                  >
                    <option value="">--</option>
                    {filteredCatsByType.get(r.type)?.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-card border border-ink-200 bg-surface-sunken px-4 py-8 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-surface-dark-sunken dark:text-inkDark-500">
            Không có giao dịch nào được tách ra từ ảnh.
          </div>
        )}
      </div>
    </div>
  );
}