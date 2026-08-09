import { useMemo } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check, Plus, Share2, ShoppingBag, Store, X } from 'lucide-react';
import { CategoryPicker } from '../CategoryPicker';
import type { Category, FinancialAccount, Person } from '../../lib/types';
import { TRANSACTION_TYPE_LABEL } from '../../lib/labels';
import { parseVNDInput, formatVNDInput } from '../../lib/format';
import type { BillChannel, OnlineMarketplace } from '../../lib/domain';

export interface TransactionSplit {
  account_id: string;
  amount_minor: number;
}

/** Tên danh mục có gắn bill — user có thể đính kèm bill (hóa đơn mua hàng). */
const BILLABLE_CATEGORY_NAMES = ['Mua sắm', 'Đi chợ/Siêu thị'];

/**
 * True nếu category thuộc nhóm có gắn bill (CHA 'Mua sắm' / 'Đi chợ/Siêu thị'
 * hoặc CON trực tiếp của 1 trong 2 CHA đó).
 * Cần categoryById để resolve CHA khi cat là CON.
 */
function isShoppingCategory(
  cat: { name: string; parent_id?: string | null } | null | undefined,
  categoryById: ReadonlyMap<string, Category>,
): boolean {
  if (!cat) return false;
  const n = cat.name.trim().toLowerCase();
  if (BILLABLE_CATEGORY_NAMES.some(x => x.toLowerCase() === n)) return true;
  if (cat.parent_id) {
    const parent = categoryById.get(cat.parent_id);
    if (parent) {
      const pn = parent.name.trim().toLowerCase();
      return BILLABLE_CATEGORY_NAMES.some(x => x.toLowerCase() === pn);
    }
  }
  return false;
}

const MARKETPLACE_OPTIONS: Array<{ id: OnlineMarketplace; label: string }> = [
  { id: 'shopee', label: 'Shopee' },
  { id: 'lazada', label: 'Lazada' },
  { id: 'tiktok_shop', label: 'TikTok Shop' },
  { id: 'other', label: 'Khác' },
];

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
  category_id: string;
  confidence: number;
  /** Raw gợi ý từ AI — giữ để user tham khảo. */
  account_hint?: string | null;
  suggested_category?: string | null;
  /** Cảnh báo từ sanityCheckTransaction — UI hiển thị màu vàng. */
  sanity_warning?: string | null;
  /** Lỗi nghiêm trọng (vd amount = 0) — UI tô đỏ + bỏ chọn. */
  sanity_error?: string | null;
  /**
   * Tài khoản mặc định (single-account mode hoặc khi splits rỗng).
   * Giữ lại cho backward compat khi rows cũ không có splits.
   */
  account_id: string;
  /**
   * Chia tiền theo tài khoản. Nếu rỗng → dùng `account_id` cho toàn bộ.
   * Tổng amount_minor của splits phải bằng `amount_minor`.
   */
  splits: TransactionSplit[];
  /**
   * Chia sẻ với người khác (tính nợ).
   * Khi bật, sẽ tạo debt 'lend' cho người được chia.
   */
  split_share?: {
    /** ID người được chia (có thể là tên mới) */
    person_id: string;
    person_name: string;
    /** Số tiền chia (minor). Mặc định 50% */
    amount_minor: number;
    /** % chia, mặc định 50 */
    percentage: number;
  } | null;
  /**
   * Bill mua sắm metadata — chỉ hợp lệ khi category = Mua sắm.
   * Sau khi import transaction, sẽ tạo 1 bill tương ứng qua RPC.
   * Items của bill user tự nhập sau (ở trang Sửa GD).
   */
  bill?: {
    /** Bắt buộc phải chọn (online/offline) trước khi import. */
    channel: BillChannel | null;
    /** Chỉ dùng khi channel = 'online'. */
    marketplace: OnlineMarketplace | null;
    /** Tên sàn khi marketplace = 'other'. */
    marketplace_other: string | null;
    /** Chỉ dùng khi channel = 'offline' — tên cửa hàng. */
    store_name: string | null;
    /**
     * Chỉ áp dụng khi channel = 'offline'. Default true.
     * Nếu true → sau import, mở BillOcrModal để user upload ảnh bill ngay.
     * Nếu false → chỉ tạo bill rỗng, user tự vào Sửa GD để xử lý bill sau.
     */
    has_bill: boolean;
  } | null;
}

interface ReceiptPreviewTableProps {
  rows: PreviewRow[];
  onChange: (rows: PreviewRow[]) => void;
  accounts: FinancialAccount[];
  categories: Category[];
  people?: Person[];
}

export function ReceiptPreviewTable({
  rows,
  onChange,
  accounts,
  categories,
  people = [],
}: ReceiptPreviewTableProps) {
  const accountById = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    accounts.forEach(a => map.set(a.id, a));
    return map;
  }, [accounts]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(c => map.set(c.id, c));
    return map;
  }, [categories]);

  /** Tổng amount_minor của splits hoặc fallback về account_id */
  function getEffectiveAccountId(row: PreviewRow): string {
    return row.splits.length > 0 ? row.splits[0]!.account_id : row.account_id;
  }

  function getSplitsSum(row: PreviewRow): number {
    return row.splits.reduce((s, split) => s + split.amount_minor, 0);
  }

  function isRowValid(row: PreviewRow): boolean {
    if (row.amount_minor <= 0) return false;
    if (row.splits.length === 0) {
      return !!row.account_id;
    }
    // Có splits → mỗi split phải có account và tổng = amount_minor
    return row.splits.every(s => !!s.account_id) && getSplitsSum(row) === row.amount_minor;
  }

  /**
   * Bill chỉ hợp lệ khi: đã chọn channel + (channel=offline thì có store_name, channel=online thì có marketplace).
   * Đối với marketplace=other thì cần marketplace_other.
   */
  function isBillComplete(row: PreviewRow): boolean {
    if (!row.bill) return true; // không có bill → OK (không phải Mua sắm)
    const b = row.bill;
    if (b.channel === null) return false;
    if (b.channel === 'offline') {
      return !!(b.store_name && b.store_name.trim().length > 0);
    }
    if (b.channel === 'online') {
      if (!b.marketplace) return false;
      if (b.marketplace === 'other') {
        return !!(b.marketplace_other && b.marketplace_other.trim().length > 0);
      }
      return true;
    }
    return false;
  }

  /** Khi user chọn category = Mua sắm, row trở nên invalid cho tới khi chọn channel. */
  function isShoppingBillValid(row: PreviewRow): boolean {
    if (!isShoppingCategory(categoryById.get(row.category_id), categoryById)) return true;
    return isBillComplete(row);
  }

  function toggleSplitShare(rowId: string) {
    onChange(
      rows.map(r => {
        if (r.id !== rowId) return r;
        if (r.split_share) {
          // Turn off
          return { ...r, split_share: null };
        }
        // Turn on - default 50%
        const amount = Math.round(r.amount_minor / 2);
        return {
          ...r,
          split_share: {
            person_id: '',
            person_name: '',
            amount_minor: amount,
            percentage: 50,
          },
        };
      }),
    );
  }

  function updateSplitShare(
    rowId: string,
    patch: Partial<NonNullable<PreviewRow['split_share']>>,
  ) {
    onChange(
      rows.map(r => {
        if (r.id !== rowId || !r.split_share) return r;
        const updated = { ...r.split_share, ...patch };
        // Auto-update percentage when amount changes
        if (patch.amount_minor !== undefined) {
          updated.amount_minor = Math.min(patch.amount_minor, r.amount_minor);
          updated.percentage = Math.round((updated.amount_minor / r.amount_minor) * 100);
        }
        return { ...r, split_share: updated };
      }),
    );
  }

  function setSplitShare50(rowId: string) {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    updateSplitShare(rowId, { percentage: 50, amount_minor: Math.round(row.amount_minor / 2) });
  }

  const selectedCount = rows.filter(r => r.selected).length;
  const validCount = rows.filter(r => r.selected && isRowValid(r) && isShoppingBillValid(r)).length;

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
    // Nếu user đổi category_id → auto-init/clear bill field tương ứng.
    if ('category_id' in patch) {
      const target = next.find(r => r.id === id);
      if (target) {
        const cat = categoryById.get(patch.category_id ?? '');
        if (isShoppingCategory(cat, categoryById) && !target.bill) {
          target.bill = { channel: null, marketplace: null, marketplace_other: null, store_name: null, has_bill: true };
        } else if (!isShoppingCategory(cat, categoryById) && target.bill) {
          target.bill = null;
        }
      }
    }
    onChange(next);
  }

  function updateBill(rowId: string, patch: Partial<NonNullable<PreviewRow['bill']>>) {
    onChange(
      rows.map(r => {
        if (r.id !== rowId) return r;
        const current = r.bill ?? { channel: null, marketplace: null, marketplace_other: null, store_name: null, has_bill: true };
        const nextBill = { ...current, ...patch };
        // Khi chuyển channel, reset field không liên quan.
        if ('channel' in patch) {
          if (patch.channel === 'online') {
            nextBill.store_name = null;
          } else if (patch.channel === 'offline') {
            nextBill.marketplace = null;
            nextBill.marketplace_other = null;
          } else {
            nextBill.marketplace = null;
            nextBill.marketplace_other = null;
            nextBill.store_name = null;
          }
        }
        // Khi đổi marketplace khác 'other' → clear marketplace_other.
        if ('marketplace' in patch && patch.marketplace !== 'other') {
          nextBill.marketplace_other = null;
        }
        return { ...r, bill: nextBill };
      }),
    );
  }

  function addSplit(rowId: string) {
    onChange(
      rows.map(r => {
        if (r.id !== rowId) return r;
        const newSplit: TransactionSplit = { account_id: '', amount_minor: 0 };
        return { ...r, splits: [...r.splits, newSplit] };
      }),
    );
  }

  function removeSplit(rowId: string, splitIndex: number) {
    onChange(
      rows.map(r => {
        if (r.id !== rowId) return r;
        const newSplits = r.splits.filter((_, i) => i !== splitIndex);
        return { ...r, splits: newSplits };
      }),
    );
  }

  function updateSplit(
    rowId: string,
    splitIndex: number,
    patch: Partial<TransactionSplit>,
  ) {
    onChange(
      rows.map(r => {
        if (r.id !== rowId) return r;
        const newSplits = r.splits.map((s, i) =>
          i === splitIndex ? { ...s, ...patch } : s,
        );
        return { ...r, splits: newSplits };
      }),
    );
  }

  function selectAll(value: boolean) {
    onChange(
      rows.map(r => ({
        ...r,
        // Khi tắt chọn → OK. Khi bật chọn → chỉ tick các row thỏa cả row + bill.
        selected: value ? r.selected || (isRowValid(r) && isShoppingBillValid(r)) : false,
      })),
    );
  }

  function selectHighConfidence(threshold = 0.7) {
    onChange(
      rows.map(r => ({
        ...r,
        selected: r.confidence >= threshold && isRowValid(r) && isShoppingBillValid(r),
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
          const valid = isRowValid(r);
          const lowConf = r.confidence < 0.6;
          const amountMajor = Math.round(r.amount_minor / 100);
          const splitsSum = getSplitsSum(r);
          const remaining = r.amount_minor - splitsSum;
          const hasSplits = r.splits.length > 0;
          const effectiveAccountId = getEffectiveAccountId(r);
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
                  {hasSplits ? (
                    <div className="space-y-1">
                      {r.splits.map((split, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <select
                            aria-label={`Tài khoản ${idx + 1}`}
                            className={clsx(
                              'input !py-1 !text-xs flex-1 min-w-0',
                              !split.account_id && '!border-err-500',
                            )}
                            value={split.account_id}
                            onChange={e =>
                              updateSplit(r.id, idx, { account_id: e.target.value })
                            }
                          >
                            <option value="">--</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Số tiền tài khoản ${idx + 1}`}
                            className="input !py-1 !text-xs w-20 tabular-nums"
                            value={formatVNDInput(Math.round(split.amount_minor / 100))}
                            onChange={e =>
                              updateSplit(r.id, idx, {
                                amount_minor: Math.max(0, parseVNDInput(e.target.value)),
                              })
                            }
                          />
                          <button
                            type="button"
                            aria-label="Xoá nguồn tiền"
                            className="btn-ghost !p-1 !text-ink-400 hover:!text-err-500"
                            onClick={() => removeSplit(r.id, idx)}
                          >
                            <X size={12} strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                      {remaining !== 0 && (
                        <div
                          className={clsx(
                            'text-2xs font-medium tabular-nums',
                            remaining > 0
                              ? 'text-warn-600 dark:text-warn-400'
                              : 'text-err-600 dark:text-err-400',
                          )}
                        >
                          {remaining > 0 ? 'Còn lại: ' : 'Thừa: '}
                          {Math.abs(Math.round(remaining / 100)).toLocaleString('vi-VN')} ₫
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn-ghost !text-2xs !p-0 flex items-center gap-0.5 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                        onClick={() => addSplit(r.id)}
                      >
                        <Plus size={10} strokeWidth={2.5} />
                        Thêm nguồn tiền
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="Tài khoản"
                        className={clsx(
                          'input !py-1 !text-xs flex-1 min-w-0',
                          !r.account_id && '!border-err-500',
                        )}
                        value={r.account_id}
                        onChange={e => update(r.id, { account_id: e.target.value })}
                      >
                        <option value="">-- Chọn --</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      {r.account_id && (
                        <button
                          type="button"
                          aria-label="Chia tiền theo nhiều tài khoản"
                          title="Chia tiền theo nhiều tài khoản"
                          className="btn-ghost !p-1 !text-ink-400 hover:!text-brand-500"
                          onClick={() => {
                            // Convert single account to first split
                            addSplit(r.id);
                            // The new split is empty, set the first split to current account_id
                            updateSplit(r.id, 0, {
                              account_id: r.account_id,
                              amount_minor: r.amount_minor,
                            });
                            // Add second empty split for remainder
                            addSplit(r.id);
                          }}
                        >
                          <Plus size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )}
                  {r.account_hint && !hasSplits && (
                    <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500 truncate" title={r.account_hint}>
                      Hint: {r.account_hint}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    Danh mục
                  </label>
                  <CategoryPicker
                    categories={categories}
                    kind={r.type}
                    value={r.category_id}
                    onChange={id => update(r.id, { category_id: id })}
                    label="Danh mục"
                    placeholder="--"
                    clearable
                  />
                </div>

                {/* Chia sẻ - tạo nợ */}
                <div className="lg:col-span-2">
                  <label className="mb-0.5 flex items-center gap-1 block text-2xs font-medium uppercase tracking-wide text-ink-500 dark:text-inkDark-500">
                    <Share2 size={10} />
                    Chia sẻ (tạo nợ)
                  </label>
                  <button
                    type="button"
                    className={clsx(
                      'input !py-1 !text-xs w-full text-left flex items-center gap-2',
                      r.split_share ? 'border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-500/10' : '',
                    )}
                    onClick={() => toggleSplitShare(r.id)}
                  >
                    <span className={clsx(
                      'grid h-4 w-4 shrink-0 place-items-center rounded border text-2xs',
                      r.split_share
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-ink-300 dark:border-ink-600',
                    )}>
                      {r.split_share && <Check size={8} strokeWidth={3} />}
                    </span>
                    <span className={r.split_share ? 'text-brand-700 dark:text-brand-300' : 'text-ink-400'}>
                      {r.split_share ? 'Bật chia sẻ' : 'Chia cho người khác'}
                    </span>
                  </button>

                  {r.split_share && (
                    <div className="mt-1.5 space-y-1.5 rounded-card border border-brand-200 bg-brand-50/50 p-2 dark:border-brand-800 dark:bg-brand-500/10">
                      {/* Person select */}
                      <div className="flex items-center gap-1">
                        <select
                          className={clsx(
                            'input !py-1 !text-xs flex-1 min-w-0',
                            !r.split_share.person_id && r.split_share.person_name ? '' : '',
                            !r.split_share.person_id && !r.split_share.person_name ? '!border-err-500' : '',
                          )}
                          value={r.split_share.person_id}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '__new__') {
                              updateSplitShare(r.id, { person_id: '__new__', person_name: '' });
                            } else {
                              const person = people.find(p => p.id === val);
                              updateSplitShare(r.id, {
                                person_id: val,
                                person_name: person?.name ?? '',
                              });
                            }
                          }}
                        >
                          <option value="">-- Chọn người --</option>
                          {people.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                          <option value="__new__">+ Người mới</option>
                        </select>
                      </div>

                      {/* New person name input */}
                      {r.split_share.person_id === '__new__' && (
                        <input
                          type="text"
                          className="input !py-1 !text-xs w-full"
                          placeholder="Tên người mới"
                          value={r.split_share.person_name}
                          onChange={e => updateSplitShare(r.id, { person_name: e.target.value })}
                        />
                      )}

                      {/* Amount controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={clsx(
                            'btn-ghost !py-1 !text-2xs flex-1',
                            r.split_share.percentage === 50 ? 'border border-brand-400 bg-brand-100 dark:bg-brand-900' : '',
                          )}
                          onClick={() => setSplitShare50(r.id)}
                        >
                          50%
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input !py-1 !text-xs w-20 tabular-nums text-right"
                          value={formatVNDInput(Math.round(r.split_share.amount_minor / 100))}
                          onChange={e => updateSplitShare(r.id, {
                            amount_minor: Math.max(0, parseVNDInput(e.target.value)),
                          })}
                        />
                        <span className="text-2xs text-ink-400 shrink-0">₫</span>
                      </div>
                      <div className="text-2xs text-brand-600 dark:text-brand-400">
                        Nợ: {r.split_share.person_name || '—'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hàng 3: Bill picker — chỉ hiện khi danh mục = Mua sắm / Đi chợ (CHA hoặc CON) */}
              {isShoppingCategory(categoryById.get(r.category_id), categoryById) && (
                <BillInlinePicker
                  bill={r.bill ?? null}
                  onChange={patch => updateBill(r.id, patch)}
                />
              )}
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

// ============================================================
// BillInlinePicker — picker kênh mua hàng inline trong OCR preview row
// Kênh bắt buộc phải chọn trước khi import GD (nếu category = Mua sắm).
// Items của bill user tự nhập sau ở trang Sửa GD.
// ============================================================
interface BillInlinePickerProps {
  bill: NonNullable<PreviewRow['bill']> | null;
  onChange: (patch: Partial<NonNullable<PreviewRow['bill']>>) => void;
}

function BillInlinePicker({ bill, onChange }: BillInlinePickerProps) {
  const safeBill = bill ?? {
    channel: null,
    marketplace: null,
    marketplace_other: null,
    store_name: null,
    has_bill: true,
  };
  const channel = safeBill.channel;

  return (
    <div className="mt-2 rounded-card border border-brand-200 bg-brand-50/40 p-2.5 dark:border-brand-800 dark:bg-brand-500/10">
      <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
        <ShoppingBag size={11} strokeWidth={2} />
        Bill mua sắm — chọn kênh mua hàng
        {channel === null && (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded-pill bg-err-100 px-1.5 py-0.5 text-2xs font-semibold text-err-700 dark:bg-err-700/30 dark:text-err-400">
            Bắt buộc
          </span>
        )}
      </div>

      <div role="radiogroup" className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          role="radio"
          aria-checked={channel === 'online'}
          onClick={() => onChange({ channel: 'online' })}
          className={
            'rounded-card border px-2.5 py-1.5 text-left text-xs transition ' +
            (channel === 'online'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'border-ink-200 bg-surface text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:bg-surface-dark dark:text-inkDark-500 dark:hover:border-ink-600')
          }
        >
          <div className="font-medium">Online</div>
          <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">Sàn TMĐT</div>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={channel === 'offline'}
          onClick={() => onChange({ channel: 'offline' })}
          className={
            'rounded-card border px-2.5 py-1.5 text-left text-xs transition ' +
            (channel === 'offline'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'border-ink-200 bg-surface text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:bg-surface-dark dark:text-inkDark-500 dark:hover:border-ink-600')
          }
        >
          <div className="font-medium">Offline</div>
          <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">Cửa hàng trực tiếp</div>
        </button>
      </div>

      {channel === 'online' && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1 text-2xs font-medium text-ink-600 dark:text-inkDark-500">
            <ShoppingBag size={10} strokeWidth={2} />
            Sàn thương mại
          </div>
          <div className="flex flex-wrap gap-1">
            {MARKETPLACE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ marketplace: opt.id })}
                className={
                  'rounded-pill border px-2 py-0.5 text-2xs font-medium transition ' +
                  (safeBill.marketplace === opt.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:bg-surface-dark dark:text-inkDark-500')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {safeBill.marketplace === 'other' && (
            <input
              type="text"
              className="input !py-1 !text-xs w-full"
              placeholder="Tên sàn khác (VD: Tiki, Sendo...)"
              value={safeBill.marketplace_other ?? ''}
              onChange={e => onChange({ marketplace_other: e.target.value })}
              aria-label="Tên sàn khác"
              autoFocus
            />
          )}
        </div>
      )}

      {channel === 'offline' && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1 text-2xs font-medium text-ink-600 dark:text-inkDark-500">
            <Store size={10} strokeWidth={2} />
            Tên cửa hàng
          </div>
          <input
            type="text"
            className="input !py-1 !text-xs w-full"
            placeholder="VD: Co.opmart, Bách hoá XANH..."
            value={safeBill.store_name ?? ''}
            onChange={e => onChange({ store_name: e.target.value })}
            aria-label="Tên cửa hàng"
          />
          <label className="flex cursor-pointer items-center justify-end gap-1.5 pt-0.5 text-2xs text-ink-600 dark:text-inkDark-500">
            <span>Giao dịch có bill</span>
            <input
              type="checkbox"
              checked={safeBill.has_bill}
              onChange={e => onChange({ has_bill: e.target.checked })}
              className="h-3.5 w-3.5 shrink-0 accent-brand-500"
              aria-label="Giao dịch có bill"
            />
          </label>
        </div>
      )}

      <div className="mt-2 text-2xs text-ink-500 dark:text-inkDark-500">
        Sau khi lưu, danh sách sản phẩm của bill nhập ở trang Sửa giao dịch.
      </div>
    </div>
  );
}