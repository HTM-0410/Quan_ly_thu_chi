import { useEffect, useMemo, useState } from 'react';
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
import { CalendarRange, TrendingDown, TrendingUp } from 'lucide-react';
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
  /** period start (YYYY-MM-DD) dùng để sort ổn định. */
  start: string;
}

// ============================================================
// Khoảng thời gian (preset + custom)
// ============================================================

type RangePreset = 'current' | 'month' | 'quarter' | 'year' | 'custom';

interface RangeState {
  preset: RangePreset;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (inclusive)
}

const PRESET_LABELS: Record<RangePreset, string> = {
  current: 'Hiện tại',
  month: 'Tháng',
  quarter: 'Quý',
  year: 'Năm',
  custom: 'Tùy chỉnh',
};

/** Pad 2 chữ số. */
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Build YYYY-MM-DD từ local Date. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** Parse YYYY-MM-DD thành local Date. */
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** Ngày đầu tiên của tháng chứa `d`. */
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
/** Ngày cuối cùng của tháng chứa `d`. */
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
/** Tháng trước đó N tháng. */
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
/** Quý của `d` (Q1=0..Q4=3). */
function quarterIndex(d: Date) {
  return Math.floor(d.getMonth() / 3);
}

/**
 * Tính [start, end] từ preset, neo theo `anchor` (mặc định = tháng hiện tại).
 * - current: tháng hiện tại
 * - month:   12 tháng gần nhất, neo về cùng tháng
 * - quarter: 4 quý gần nhất, neo về cùng quý
 * - year:    5 năm gần nhất (theo năm dương lịch)
 * - custom:  dùng start/end đã chọn
 */
function deriveRange(preset: RangePreset, anchor: Date, customStart: string, customEnd: string): RangeState {
  const today = new Date();
  switch (preset) {
    case 'current':
      return { preset, start: ymd(startOfMonth(today)), end: ymd(endOfMonth(today)) };
    case 'month': {
      const end = endOfMonth(anchor);
      const start = startOfMonth(addMonths(anchor, -11));
      return { preset, start: ymd(start), end: ymd(end) };
    }
    case 'quarter': {
      // 4 quý gần nhất tính tới quý hiện tại.
      const qNow = quarterIndex(today);
      const startQ = new Date(today.getFullYear(), qNow * 3, 1);
      const endQ = new Date(today.getFullYear(), qNow * 3 + 3, 0);
      const start = new Date(startQ.getFullYear(), startQ.getMonth() - 9, 1);
      return { preset, start: ymd(start), end: ymd(endQ) };
    }
    case 'year': {
      const y = today.getFullYear();
      return { preset, start: `${y - 4}-01-01`, end: `${y}-12-31` };
    }
    case 'custom': {
      // Đảm bảo start <= end, fallback về tháng hiện tại nếu invalid.
      const s = parseYmd(customStart);
      const e = parseYmd(customEnd);
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) {
        return { preset, start: ymd(startOfMonth(today)), end: ymd(endOfMonth(today)) };
      }
      return { preset, start: ymd(s), end: ymd(e) };
    }
  }
}

/**
 * Chia range thành các bucket hiển thị cho biểu đồ cột, phù hợp với preset:
 * - month:   bucket theo tháng → 12 cột
 * - quarter: bucket theo quý → 4 cột
 * - year:    bucket theo năm → 5 cột
 * - current/custom: bucket theo ngày → chỉ với custom (current: 1 tháng → 1 bucket)
 *
 * Trả về label từng bucket + khoảng (start, end) YYYY-MM-DD cho từng bucket
 * để gọi getTransactionsSummary tuần tự.
 */
function bucketRange(range: RangeState): { label: string; start: string; end: string }[] {
  const buckets: { label: string; start: string; end: string }[] = [];
  const s = parseYmd(range.start);
  const e = parseYmd(range.end);

  if (range.preset === 'current') {
    buckets.push({ label: 'Tháng này', start: range.start, end: range.end });
    return buckets;
  }

  if (range.preset === 'custom') {
    // Ước lượng số ngày → nếu > 31 thì bucket theo tháng, ngược lại theo ngày.
    const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
    if (days <= 31) {
      const cur = new Date(s);
      while (cur <= e) {
        const ds = ymd(cur);
        const de = ymd(cur);
        buckets.push({
          label: `${pad2(cur.getDate())}/${pad2(cur.getMonth() + 1)}`,
          start: ds,
          end: de,
        });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const cur = startOfMonth(s);
      while (cur <= e) {
        const monthStart = ymd(cur);
        const monthEnd = ymd(endOfMonth(cur));
        // Chỉ thêm nếu overlap với range
        if (parseYmd(monthEnd) >= s && parseYmd(monthStart) <= e) {
          buckets.push({
            label: `${pad2(cur.getMonth() + 1)}/${cur.getFullYear()}`,
            start: monthStart > range.start ? monthStart : range.start,
            end: monthEnd < range.end ? monthEnd : range.end,
          });
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    return buckets;
  }

  if (range.preset === 'month') {
    const cur = startOfMonth(s);
    while (cur <= e) {
      buckets.push({
        label: `${pad2(cur.getMonth() + 1)}/${String(cur.getFullYear()).slice(-2)}`,
        start: ymd(cur),
        end: ymd(endOfMonth(cur)),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return buckets;
  }

  if (range.preset === 'quarter') {
    const cur = new Date(s.getFullYear(), Math.floor(s.getMonth() / 3) * 3, 1);
    while (cur <= e) {
      const q = Math.floor(cur.getMonth() / 3) + 1;
      const qEnd = new Date(cur.getFullYear(), cur.getMonth() + 3, 0);
      buckets.push({
        label: `Q${q}/${cur.getFullYear()}`,
        start: ymd(cur),
        end: ymd(qEnd),
      });
      cur.setMonth(cur.getMonth() + 3);
    }
    return buckets;
  }

  if (range.preset === 'year') {
    for (let y = s.getFullYear(); y <= e.getFullYear(); y++) {
      buckets.push({
        label: String(y),
        start: `${y}-01-01`,
        end: `${y}-12-31`,
      });
    }
    return buckets;
  }

  return buckets;
}

const COLORS = ['#1E88E5', '#43A047', '#E53935', '#FB8C00', '#8E24AA', '#00897B', '#5E35B1', '#3949AB'];

export function ReportsPage() {
  useDocumentTitle('Báo cáo');
  const { profile } = useAuth();
  const timezone =
    profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const today = useMemo(() => new Date(), []);
  const [rangePreset, setRangePreset] = useState<RangePreset>('month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const range: RangeState = useMemo(
    () => deriveRange(rangePreset, today, customStart, customEnd),
    [rangePreset, today, customStart, customEnd],
  );

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

  /**
   * Load thu/chi theo range đang chọn.
   * - Gọi getTransactionsSummary cho cả range (income/expense cards).
   * - Chia range thành bucket theo preset rồi gọi getTransactionsSummary
   *   cho từng bucket (history cho biểu đồ cột).
   */
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [sum, cats, txs, hist] = await Promise.all([
        getTransactionsSummary({
          start_date: range.start,
          end_date: range.end,
        }),
        listCategories(),
        listTransactions({
          from: monthRangeInTz(today.getFullYear(), today.getMonth(), timezone).start.toISOString(),
          to: monthRangeInTz(today.getFullYear(), today.getMonth(), timezone).end.toISOString(),
          type: 'expense',
          limit: 500,
        }),
        loadHistory(range),
      ]);

      setIncome(Number(sum?.total_income ?? 0));
      setExpense(Number(sum?.total_expense ?? 0));
      setHistory(hist);
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

  /**
   * Chia range thành bucket và gọi getTransactionsSummary cho mỗi bucket.
   * Trả về MonthBucket[] sẵn để binding vào BarChart.
   */
  async function loadHistory(range: RangeState): Promise<MonthBucket[]> {
    const buckets = bucketRange(range);
    if (buckets.length === 0) return [];

    // Parallel hóa nhưng giới hạn concurrency=6 để tránh spam RPC.
    const out: MonthBucket[] = [];
    const concurrency = 6;
    for (let i = 0; i < buckets.length; i += concurrency) {
      const slice = buckets.slice(i, i + concurrency);
      const rows = await Promise.all(
        slice.map(async (b) => {
          const row = await getTransactionsSummary({
            start_date: b.start,
            end_date: b.end,
          });
          return {
            label: b.label,
            start: b.start,
            income: Number(row?.total_income ?? 0),
            expense: Number(row?.total_expense ?? 0),
          };
        }),
      );
      out.push(...rows);
    }
    return out;
  }

  async function loadHeatmap() {
    const year = heatmapAnchor.getFullYear();
    const monthIndex = heatmapAnchor.getMonth();
    const { start, end } = monthRangeInTz(year, monthIndex, timezone);
    setHeatmapLoading(true);
    try {
      const txs: Transaction[] = await listTransactions({
        from: start.toISOString(),
        to: end.toISOString(),
        limit: 1000,
      });
      const grouped = groupByDay(txs, timezone);
      const indexed = indexByDay(txs, timezone);
      setHeatmapData(grouped);
      setHeatmapTxs(indexed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setHeatmapLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, range.start, range.end, range.preset]);

  useEffect(() => {
    loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapAnchor, timezone]);

  // Khi user chọn preset "custom" mà chưa có giá trị, mặc định = range hiện tại.
  function handlePresetChange(p: RangePreset) {
    setRangePreset(p);
    if (p === 'custom') {
      if (!customStart || !customEnd) {
        const r = deriveRange('current', today, '', '');
        setCustomStart(r.start);
        setCustomEnd(r.end);
      }
    }
  }

  const sectionTitle = useMemo(() => {
    switch (range.preset) {
      case 'current':
        return 'Tình hình chi tháng này';
      case 'month':
        return 'Tình hình chi 12 tháng gần nhất';
      case 'quarter':
        return 'Tình hình chi 4 quý gần nhất';
      case 'year':
        return 'Tình hình chi 5 năm gần nhất';
      case 'custom':
        return `Tình hình chi ${range.start} → ${range.end}`;
    }
  }, [range]);

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

      {/* Range selector */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="inline-flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500 dark:text-inkDark-500">
            <CalendarRange size={14} strokeWidth={1.75} />
            Khoảng thời gian
          </div>
          <div className="flex flex-wrap gap-1 rounded-card border border-ink-200 bg-surface-sunken p-1 dark:border-ink-800 dark:bg-surface-dark-sunken">
            {(Object.keys(PRESET_LABELS) as RangePreset[]).map(p => {
              const active = p === rangePreset;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetChange(p)}
                  className={[
                    'rounded-button px-3 py-1.5 text-xs font-medium transition',
                    active
                      ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500'
                      : 'text-ink-600 hover:bg-surface dark:text-inkDark-500 dark:hover:bg-surface-dark',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {PRESET_LABELS[p]}
                </button>
              );
            })}
          </div>
          {range.preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-inkDark-500">
                Từ
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={e => setCustomStart(e.target.value)}
                  className="rounded-button border border-ink-200 bg-surface px-2 py-1 text-xs text-ink-900 dark:border-ink-800 dark:bg-surface-dark dark:text-inkDark-900"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-inkDark-500">
                Đến
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  max={toLocalDateString(today)}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="rounded-button border border-ink-200 bg-surface px-2 py-1 text-xs text-ink-900 dark:border-ink-800 dark:bg-surface-dark dark:text-inkDark-900"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card relative overflow-hidden p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ok-600 dark:text-ok-500">
                Thu nhập
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
                Chi tiêu
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
            {sectionTitle}
          </h2>
        </div>
        <div className="p-5">
          {loading ? (
            <Skeleton className="h-72" />
          ) : history.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-10 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-surface-dark-sunken dark:text-inkDark-500">
              Chưa có dữ liệu trong khoảng này.
            </div>
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