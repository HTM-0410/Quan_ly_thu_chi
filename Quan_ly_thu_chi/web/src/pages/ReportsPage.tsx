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
import { groupByDay, indexByDay, type DailyExpense } from '../lib/daily';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  getMonthlyHistory,
  getTransactionsSummary,
  listCategories,
  listTransactions,
} from '../lib/api';
import { formatVND } from '../lib/format';
import type { Category, Transaction } from '../lib/types';

interface MonthBucket {
  label: string;
  income: number;
  expense: number;
}

function monthLabel(d: Date): string {
  return `${('0' + (d.getMonth() + 1)).slice(-2)}/${d.getFullYear().toString().slice(-2)}`;
}

const COLORS = ['#1E88E5', '#43A047', '#E53935', '#FB8C00', '#8E24AA', '#00897B', '#5E35B1', '#3949AB'];

export function ReportsPage() {
  useDocumentTitle('Báo cáo');
  const [income, setIncome] = useState<number>(0);
  const [expense, setExpense] = useState<number>(0);
  const [history, setHistory] = useState<MonthBucket[]>([]);
  const [byCategory, setByCategory] = useState<{ name: string; amount: number; color: string }[]>(
    [],
  );
  const [heatmapData, setHeatmapData] = useState<Map<string, DailyExpense>>(new Map());
  const [heatmapTxs, setHeatmapTxs] = useState<Map<string, Transaction[]>>(new Map());
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [heatmapYear, setHeatmapYear] = useState<number>(new Date().getFullYear());
  const [heatmapMonth, setHeatmapMonth] = useState<number>(new Date().getMonth());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const [historyRows, sum, cats, txs] = await Promise.all([
        getMonthlyHistory(6),
        getTransactionsSummary({
          start_date: monthStart.toISOString().slice(0, 10),
          end_date: monthEnd.toISOString().slice(0, 10),
        }),
        listCategories(),
        listTransactions({
          from: monthStart.toISOString(),
          to: new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 1).toISOString(),
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
          label: monthLabel(new Date(row.period_start)),
          income: row.total_income,
          expense: row.total_expense,
        })),
      );
      setCategories(cats);
      const catById = new Map<string, Category>(cats.map((c: Category) => [c.id, c]));
      const totals = new Map<string, number>();
      for (const t of txs) {
        if (!t.category_id) continue;
        totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount_minor);
      }
      const pie = Array.from(totals.entries())
        .map(([catId, amount]) => {
          const cat = catById.get(catId);
          return {
            name: cat?.name ?? 'Khác',
            amount,
            color: cat?.color ?? '#757575',
          };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);
      setByCategory(pie);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadHeatmap(year: number, monthIndex: number) {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 1);
    setHeatmapLoading(true);
    try {
      const txs: Transaction[] = await listTransactions({
        from: start.toISOString(),
        to: end.toISOString(),
        type: 'expense',
        limit: 1000,
      });
      setHeatmapData(groupByDay(txs));
      setHeatmapTxs(indexByDay(txs));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setHeatmapLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadHeatmap(heatmapYear, heatmapMonth);
  }, [heatmapYear, heatmapMonth]);

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
                  >
                    {byCategory.map((d, i) => (
                      <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => formatVND(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
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
            year={heatmapYear}
            monthIndex={heatmapMonth}
            expenses={heatmapData}
            transactionsByDay={heatmapTxs}
            onChangeMonth={(y, m) => {
              setHeatmapYear(y);
              setHeatmapMonth(m);
            }}
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
    </div>
  );
}
