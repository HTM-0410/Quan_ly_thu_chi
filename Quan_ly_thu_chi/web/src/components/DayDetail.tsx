import { useEffect, useMemo, useState } from 'react';
import { Info, Inbox } from 'lucide-react';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { CategoryIcon } from './CategoryIcon';
import { BillDetailModal } from './bill/BillDetailModal';
import { formatVND, formatDateTime } from '../lib/format';
import { resolveCategory, categoryKey } from '../lib/categoryResolve';
import { getBillSummariesForTransactions, type BillSummary } from '../lib/api';
import type { Transaction, Category } from '../lib/types';
import type { DailyExpense } from '../lib/daily';

interface Props {
  open: boolean;
  date: string | null;
  expenses: DailyExpense | null;
  transactions: Transaction[];
  categories: Category[];
  onClose: () => void;
}

export function DayDetail({
  open,
  date,
  expenses,
  transactions,
  categories,
  onClose,
}: Props) {
  const catById = useMemo(
    () => new Map<string, Category>(categories.map(c => [c.id, c])),
    [categories],
  );

  // Bill map cho các GD trong ngày.
  const [billMap, setBillMap] = useState<Map<string, BillSummary>>(new Map());
  const [billDetailTx, setBillDetailTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!open || transactions.length === 0) {
      setBillMap(new Map());
      return;
    }
    let cancelled = false;
    const txIds = transactions.map(t => t.id).filter(Boolean);
    getBillSummariesForTransactions(txIds)
      .then(map => {
        if (!cancelled) setBillMap(map);
      })
      .catch(() => {
        if (!cancelled) setBillMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [open, transactions]);

  const title = useMemo(() => {
    if (!date) return 'Chi tiết ngày';
    const d = new Date(date + 'T00:00:00');
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  }, [date]);

  // Tính cả thu & chi từ transactions (vì indexByDay giờ trả cả income).
  const { totalIncome, totalExpense, totalCount, avgExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let expCount = 0;
    for (const t of transactions) {
      if (t.status === 'voided') continue;
      if (t.type === 'income') inc += t.amount_minor;
      else if (t.type === 'expense') {
        exp += t.amount_minor;
        expCount += 1;
      }
    }
    return {
      totalIncome: inc,
      totalExpense: exp,
      totalCount: transactions.filter(t => t.status !== 'voided').length,
      avgExpense: expCount > 0 ? Math.round(exp / expCount) : 0,
    };
  }, [transactions]);

  // Fallback về `expenses` nếu transactions rỗng (back-compat).
  const fallbackExpense = expenses?.amount_minor ?? 0;
  const fallbackIncome = expenses?.income_minor ?? 0;
  const fallbackCount = expenses?.count ?? 0;
  const total = transactions.length > 0 ? totalExpense : fallbackExpense;
  const income = transactions.length > 0 ? totalIncome : fallbackIncome;
  const count = transactions.length > 0 ? totalCount : fallbackCount;
  const avg = transactions.length > 0 ? avgExpense : fallbackCount > 0 ? Math.round(total / fallbackCount) : 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const key = categoryKey(t) ?? '__none__';
      map.set(key, (map.get(key) ?? 0) + t.amount_minor);
    }
    return Array.from(map.entries())
      .map(([catId, amount]) => {
        const cat = catById.get(catId);
        return {
          catId,
          name: cat?.name ?? 'Chưa phân loại',
          color: cat?.color ?? '#9e9e9e',
          icon: cat?.icon ?? 'help',
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, catById]);

  const net = income - total;

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {!date ? (
        <div className="text-sm text-ink-500 dark:text-inkDark-500">Chưa chọn ngày.</div>
      ) : (
        <div className="space-y-5">
          {/* Summary header */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ok-600 dark:text-ok-500">
                Tổng thu nhập
              </div>
              <div className="num mt-0.5 text-lg tabular-nums text-ok-700 dark:text-ok-500">
                +{formatVND(income)}
              </div>
            </div>
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-err-600 dark:text-err-500">
                Tổng chi tiêu
              </div>
              <div className="num mt-0.5 text-lg tabular-nums text-err-600 dark:text-err-500">
                −{formatVND(total)}
              </div>
            </div>
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                Số giao dịch
              </div>
              <div className="num mt-0.5 text-lg tabular-nums text-ink-900 dark:text-inkDark-900">
                {count}
              </div>
              {income > 0 && total > 0 && (
                <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">
                  {transactions.filter(t => t.type === 'income' && t.status !== 'voided').length} thu ·{' '}
                  {transactions.filter(t => t.type === 'expense' && t.status !== 'voided').length} chi
                </div>
              )}
            </div>
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                {net >= 0 ? 'Còn lại' : 'Bội chi'}
              </div>
              <div
                className={`num mt-0.5 text-lg tabular-nums ${net >= 0 ? 'text-ok-700 dark:text-ok-500' : 'text-err-600 dark:text-err-500'}`}
              >
                {net >= 0 ? '+' : '−'}
                {formatVND(Math.abs(net))}
              </div>
              <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">
                Trung bình chi: {formatVND(avg)} / giao dịch
              </div>
            </div>
          </div>

          {/* Per-category breakdown (chỉ chi tiêu) */}
          {byCategory.length > 0 && (
            <div>
              <h4 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                Phân bổ chi tiêu theo danh mục
              </h4>
              <ul className="space-y-1">
                {byCategory.map(c => {
                  const pct = total > 0 ? (c.amount / total) * 100 : 0;
                  return (
                    <li
                      key={c.catId}
                      className="flex items-center gap-2 text-sm text-ink-900 dark:text-inkDark-900"
                    >
                      <CategoryIcon name={c.icon} color={c.color} size="xs" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="w-24 text-right font-medium tabular-nums">
                        {formatVND(c.amount)}
                      </span>
                      <span className="w-12 text-right text-xs text-ink-500 tabular-nums dark:text-inkDark-500">
                        {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Transactions list */}
          <div>
            <h4 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
              Danh sách giao dịch ({count})
            </h4>
            {transactions.length === 0 ? (
              <EmptyState
                title="Không có giao dịch"
                description="Ngày này không có giao dịch nào."
                icon={<Inbox size={20} strokeWidth={1.5} />}
              />
            ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-100 dark:divide-inkDark-200 dark:border-inkDark-200">
                {transactions.map(t => {
                  const cat = resolveCategory(catById, t);
                  const isIncome = t.type === 'income';
                  const isExpense = t.type === 'expense';
                  const sign = isIncome ? '+' : isExpense ? '−' : '';
                  const amountColor = isIncome
                    ? 'text-ok-600 dark:text-ok-500'
                    : isExpense
                      ? 'text-err-600 dark:text-err-500'
                      : 'text-ink-900 dark:text-inkDark-900';
                  return (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-3 px-3 py-2 transition hover:bg-ink-50/50 dark:hover:bg-inkDark-100/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {cat && <CategoryIcon name={cat.icon} color={cat.color} size="xs" />}
                          <span className="truncate text-sm font-medium text-ink-900 dark:text-inkDark-900">
                            {t.payee ?? cat?.name ?? 'Giao dịch'}
                          </span>
                          {isIncome && (
                            <span className="rounded-md bg-ok-50 px-1.5 py-0.5 text-2xs font-semibold text-ok-700 dark:bg-ok-700/15 dark:text-ok-500">
                              Thu
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500 dark:text-inkDark-500">
                          {cat && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 dark:bg-inkDark-100">
                              {cat.name}
                            </span>
                          )}
                          <span>{formatDateTime(t.occurred_at)}</span>
                          {t.note && (
                            <span className="truncate italic" title={t.note}>
                              — {t.note}
                            </span>
                          )}
                          {t.source === 'bank' && (
                            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                              Ngân hàng
                            </span>
                          )}
                          {t.status === 'voided' && (
                            <span className="rounded-md bg-err-50 px-1.5 py-0.5 text-err-700 dark:bg-err-700/15 dark:text-err-500">
                              Đã hủy
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`num font-semibold tabular-nums ${amountColor}`}>
                          {sign}
                          {formatVND(t.amount_minor)}
                        </div>
                        {billMap.has(t.id) && (
                          <button
                            type="button"
                            className="btn-ghost mt-1 inline-flex items-center gap-1 !px-1.5 !py-0.5 !text-2xs text-info-600 hover:!bg-info-50 dark:text-info-400 dark:hover:!bg-info-500/15"
                            onClick={() => setBillDetailTx(t)}
                            title="Xem bill của giao dịch"
                          >
                            <Info size={11} /> Bill
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Bill read-only modal */}
      {billDetailTx && (
        <BillDetailModal
          open={!!billDetailTx}
          transactionId={billDetailTx.id}
          transactionAmountMinor={billDetailTx.amount_minor}
          onClose={() => setBillDetailTx(null)}
          onDeleted={async () => {
            // Refresh bill map
            const txIds = transactions.map(t => t.id).filter(Boolean);
            try {
              const map = await getBillSummariesForTransactions(txIds);
              setBillMap(map);
            } catch {
              // ignore
            }
          }}
        />
      )}
    </Modal>
  );
}
