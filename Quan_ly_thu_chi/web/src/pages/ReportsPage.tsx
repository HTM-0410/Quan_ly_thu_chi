import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { ErrorState, Skeleton } from '../components/EmptyState';
import { MonthHeatmap } from '../components/MonthHeatmap';
import { DayDetail } from '../components/DayDetail';
import { Modal } from '../components/Modal';
import { groupByDay, indexByDay, type DailyExpense } from '../lib/daily';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  getMonthlyHistory,
  getTransactionsSummary,
  listCategories,
  listTransactions,
} from '../lib/api';
import { formatVND, formatDateTime, monthRangeInTz, toLocalDateString } from '../lib/format';
import { resolveCategory, categoryKey } from '../lib/categoryResolve';
import type { Category, Transaction } from '../lib/types';

interface MonthBucket {
  label: string;
  income: number;
  expense: number;
}

/**
 * Parse DATE string "YYYY-MM-DD" từ Postgres (đã là local date theo user tz)
 * và build label "MM/YY". Tránh new Date("YYYY-MM-DD") vì sẽ parse thành
 * UTC midnight → có thể lệch 1 ngày khi user ở UTC+7.
 */
function monthLabelFromDateString(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  // parts[0]=YYYY, parts[1]=MM, parts[2]=DD — dùng parts[0] cho year
  return `${parts[1]}/${parts[0].slice(-2)}`;
}

const COLORS = ['#1E88E5', '#43A047', '#E53935', '#FB8C00', '#8E24AA', '#00897B', '#5E35B1', '#3949AB'];

export function ReportsPage() {
  useDocumentTitle('Báo cáo');
  const { profile } = useAuth();
  // User tz từ profile (set ở Settings), fallback browser tz, cuối cùng UTC.
  const timezone =
    profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [income, setIncome] = useState<number>(0);
  const [expense, setExpense] = useState<number>(0);
  const [history, setHistory] = useState<MonthBucket[]>([]);
  const [byCategory, setByCategory] = useState<
    { name: string; amount: number; color: string; categoryId: string }[]
  >([]);
  // Toàn bộ expense txs trong tháng (cache để hiện trong popup khi click pie).
  const [monthTxs, setMonthTxs] = useState<Transaction[]>([]);
  const [heatmapData, setHeatmapData] = useState<Map<string, DailyExpense>>(new Map());
  const [heatmapTxs, setHeatmapTxs] = useState<Map<string, Transaction[]>>(new Map());
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [heatmapAnchor, setHeatmapAnchor] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Modal: GD thuộc 1 danh mục trong tháng.
  const [catModal, setCatModal] = useState<
    | { name: string; color: string; categoryId: string }
    | null
  >(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // Lấy tháng hiện tại từ browser Date (không phụ thuộc timezone)
      const now = new Date();
      const year = now.getFullYear();
      const monthIndex = now.getMonth();
      const { start: monthStartUtc, end: monthEndUtc } = monthRangeInTz(
        year,
        monthIndex,
        timezone,
      );
      // YYYY-MM-DD trực tiếp từ local date components — tránh shift do toISOString().
      const startDate = toLocalDateString(new Date(year, monthIndex, 1));
      const endDate = toLocalDateString(new Date(year, monthIndex + 1, 0));

      const [historyRows, sum, cats, txs] = await Promise.all([
        getMonthlyHistory(6, timezone),
        getTransactionsSummary({
          start_date: startDate,
          end_date: endDate,
        }),
        listCategories(),
        listTransactions({
          from: monthStartUtc.toISOString(),
          to: monthEndUtc.toISOString(),
          type: 'expense',
          limit: 500,
        }),
      ]);

      setIncome(Number(sum?.total_income ?? 0));
      setExpense(Number(sum?.total_expense ?? 0));
      setHistory(
        historyRows.map((row: {
          period_start: string;
          total_income: number;
          total_expense: number;
        }) => ({
          label: monthLabelFromDateString(row.period_start),
          income: row.total_income,
          expense: row.total_expense,
        })),
      );
      setCategories(cats);
      const catById = new Map<string, Category>(cats.map((c: Category) => [c.id, c]));
      const totals = new Map<string, number>();
      for (const t of txs) {
        const k = categoryKey(t);
        if (!k) continue;
        totals.set(k, (totals.get(k) ?? 0) + t.amount_minor);
      }
      const pie = Array.from(totals.entries())
        .map(([catId, amount]) => {
          const cat = catById.get(catId);
          return {
            name: cat?.name ?? 'Khác',
            categoryId: catId,
            amount,
            color: cat?.color ?? '#757575',
          };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);
      setByCategory(pie);
      setMonthTxs(txs as Transaction[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadHeatmap() {
    const year = heatmapAnchor.getFullYear();
    const monthIndex = heatmapAnchor.getMonth();
    const { start, end } = monthRangeInTz(year, monthIndex, timezone);
    console.log('[DEBUG] loadHeatmap', { year, monthIndex, timezone, from: start.toISOString(), to: end.toISOString() });
    setHeatmapLoading(true);
    try {
      const txs: Transaction[] = await listTransactions({
        from: start.toISOString(),
        to: end.toISOString(),
        limit: 1000,
      });
      console.log('[DEBUG] loadHeatmap got txs', { count: txs.length, first3: txs.slice(0, 3).map(t => ({ id: t.id, type: t.type, occurred_at: t.occurred_at, amount_minor: t.amount_minor })) });
      const grouped = groupByDay(txs, timezone);
      const indexed = indexByDay(txs, timezone);
      console.log('[DEBUG] loadHeatmap grouped', { size: grouped.size, keys: Array.from(grouped.keys()).slice(0, 5) });
      setHeatmapData(grouped);
      setHeatmapTxs(indexed);
    } catch (e) {
      console.error('[DEBUG] loadHeatmap error', e);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setHeatmapLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone]);

  useEffect(() => {
    loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapAnchor, timezone]);

  return (
    <div className="space-y-8">
      <header>
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
          Phân tích thu chi
        </div>
        <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
          Báo cáo
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
          Tổng hợp thu chi theo tháng và theo danh mục.
        </p>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card relative overflow-hidden p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ok-600 dark:text-ok-500">
                Thu nhập tháng này
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-40" />
              ) : (
                <div className="num mt-2 text-[28px] leading-none tracking-tight text-ok-700 dark:text-ok-500">
                  {formatVND(income)}
                </div>
              )}
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-card bg-ok-50 text-ok-600 dark:bg-ok-700/15 dark:text-ok-500">
              <TrendingUp size={18} strokeWidth={1.75} />
            </div>
          </div>
        </div>
        <div className="card relative overflow-hidden p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-err-600 dark:text-err-500">
                Chi tiêu tháng này
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-40" />
              ) : (
                <div className="num mt-2 text-[28px] leading-none tracking-tight text-err-700 dark:text-err-500">
                  {formatVND(expense)}
                </div>
              )}
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-card bg-err-50 text-err-600 dark:bg-err-700/15 dark:text-err-500">
              <TrendingDown size={18} strokeWidth={1.75} />
            </div>
          </div>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3.5 dark:border-ink-800">
          <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
            6 tháng gần nhất
          </h2>
        </div>
        <div className="p-5">
          {loading ? (
            <Skeleton className="h-72" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={v => `${(v / 100000).toFixed(0)}`} />
                  <Tooltip
                    formatter={v => formatVND(Number(v))}
                    labelStyle={{ color: '#0f172a' }}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Thu nhập" fill="#43A047" />
                  <Bar dataKey="expense" name="Chi tiêu" fill="#E53935" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
            Trục Y tính theo đơn vị × 100.000 ₫.
          </p>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3.5 dark:border-ink-800">
          <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
            Chi tiêu tháng này theo danh mục
          </h2>
        </div>
        <div className="p-5">
          {loading ? (
            <Skeleton className="h-72" />
          ) : byCategory.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-10 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
              Chưa có dữ liệu chi tiêu trong tháng này.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={2}
                    onClick={(d) => {
                      const payload = d as unknown as {
                        categoryId?: string;
                        name?: string;
                        color?: string;
                      };
                      if (!payload?.categoryId) return;
                      setCatModal({
                        name: payload.name ?? 'Khác',
                        color: payload.color ?? '#757575',
                        categoryId: payload.categoryId,
                      });
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {byCategory.map((d, i) => (
                      <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => formatVND(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <p className="mt-2 text-2xs text-ink-500 dark:text-inkDark-500">
                Click vào 1 mục để xem danh sách giao dịch thuộc loại đó.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3.5 dark:border-ink-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
              Chi tiêu theo từng ngày
            </h2>
            <div className="flex items-center gap-2">
              {heatmapLoading && (
                <span className="text-2xs uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500" aria-live="polite">
                  Đang tải…
                </span>
              )}
              <p className="text-2xs text-ink-500 dark:text-inkDark-500">
                Ô càng đậm = chi càng nhiều. Click vào ngày để xem chi tiết.
              </p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <MonthHeatmap
            year={heatmapAnchor.getFullYear()}
            monthIndex={heatmapAnchor.getMonth()}
            expenses={heatmapData}
            transactionsByDay={heatmapTxs}
            onChangeMonth={(y, m) => setHeatmapAnchor(new Date(y, m, 1))}
            onDayClick={d => setSelectedDate(d)}
          />
          <DayDetail
            open={selectedDate !== null}
            date={selectedDate}
            expenses={selectedDate ? (heatmapData.get(selectedDate) ?? null) : null}
            transactions={selectedDate ? (heatmapTxs.get(selectedDate) ?? []) : []}
            categories={categories}
            onClose={() => setSelectedDate(null)}
          />
        </div>
      </section>

      {/* Modal: Giao dịch thuộc 1 danh mục trong tháng */}
      <Modal
        open={catModal !== null}
        onClose={() => setCatModal(null)}
        title={catModal ? `Giao dịch — ${catModal.name}` : 'Giao dịch'}
        description={`Các giao dịch thuộc danh mục này trong tháng.`}
      >
        {(() => {
          if (!catModal) return null;
          // Lọc theo category_id / global_category_id. "Khác" = cả 2 đều null/empty.
          const filtered = monthTxs
            .filter(t => categoryKey(t) === catModal.categoryId)
            .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
          const total = filtered.reduce((s, t) => s + t.amount_minor, 0);
          return (
            <div>
              <div className="mb-3 flex items-center justify-between rounded-card border border-ink-200 bg-surface-sunken px-3 py-2 text-xs dark:border-ink-800 dark:bg-surface-dark-sunken">
                <span className="inline-flex items-center gap-2 text-ink-600 dark:text-inkDark-500">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: catModal.color }}
                  />
                  {filtered.length} giao dịch
                </span>
                <span className="font-semibold tabular-nums text-ink-900 dark:text-inkDark-900">
                  {formatVND(total)}
                </span>
              </div>
              {filtered.length === 0 ? (
                <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-8 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
                  Chưa có giao dịch nào trong tháng này.
                </div>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
                  {filtered.map(t => (
                    <li key={t.id} className="flex items-start justify-between gap-3 px-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-900 dark:text-inkDark-900">
                          {t.payee || t.note || 'Không tiêu đề'}
                        </div>
                        <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-500">
                          {formatDateTime(t.occurred_at)}
                          {t.note && t.payee && (
                            <span className="ml-2 italic">— {t.note}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-err-600 dark:text-err-500">
                          −{formatVND(t.amount_minor)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
