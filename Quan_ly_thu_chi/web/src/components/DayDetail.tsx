import { useMemo } from 'react';
import { Inbox } from 'lucide-react';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, formatDateTime } from '../lib/format';
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

  const total = expenses?.amount_minor ?? 0;
  const count = expenses?.count ?? 0;
  const avg = count > 0 ? Math.round(total / count) : 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      const key = t.category_id ?? '__none__';
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

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {!date ? (
        <div className="text-sm text-ink-500 dark:text-inkDark-500">Chưa chọn ngày.</div>
      ) : (
        <div className="space-y-5">
          {/* Summary header */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                Tổng chi tiêu
              </div>
<div className="num mt-0.5 text-lg tabular-nums text-err-600 dark:text-err-500">
              {formatVND(total)}
            </div>
            </div>
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                Số giao dịch
              </div>
<div className="num mt-0.5 text-lg tabular-nums text-ink-900 dark:text-inkDark-900">
              {count}
            </div>
            </div>
            <div className="card-flat px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                Trung bình / giao dịch
              </div>
<div className="num mt-0.5 text-lg tabular-nums text-ink-900 dark:text-inkDark-900">
              {formatVND(avg)}
            </div>
            </div>
          </div>

          {/* Per-category breakdown */}
          {byCategory.length > 0 && (
            <div>
              <h4 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500">
                Phân bổ theo danh mục
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
                description="Ngày này không có chi tiêu nào."
                icon={<Inbox size={20} strokeWidth={1.5} />}
              />
            ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-100 dark:divide-inkDark-200 dark:border-inkDark-200">
                {transactions.map(t => {
                  const cat = t.category_id ? catById.get(t.category_id) : null;
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
                        <div className="num font-semibold tabular-nums text-err-600 dark:text-err-500">
                          −{formatVND(t.amount_minor)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
