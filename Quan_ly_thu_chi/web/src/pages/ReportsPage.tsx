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
import { CalendarRange, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { ErrorState, Skeleton } from '../components/EmptyState';
import { MonthHeatmap } from '../components/MonthHeatmap';
import { DayDetail } from '../components/DayDetail';
import { Modal } from '../components/Modal';
import { groupByDay, indexByDay, compactVNDMinor, type DailyExpense } from '../lib/daily';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  getCategoryExpensesBreakdown,
  getTransactionsSummary,
  listCategories,
  listTransactions,
  type CategoryExpenseItem,
} from '../lib/api';
import { formatDate, formatVND, formatDateTime, monthRangeInTz, toLocalDateString } from '../lib/format';
import { categoryKey } from '../lib/categoryResolve';
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
  current: 'Tháng này',
  month: '12 tháng gần nhất',
  quarter: '4 quý gần nhất',
  year: '5 năm gần nhất',
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

export interface PieCategoryItem {
  name: string;
  categoryId: string;
  amount: number;
  color: string;
  count: number;
  percent: number;
}

export function ReportsPage() {
  useDocumentTitle('Báo cáo');
  const { profile } = useAuth();
  const timezone =
    profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';

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
  const [byCategory, setByCategory] = useState<PieCategoryItem[]>([]);
  // Giao dịch trong khoảng range đã chọn (để phục vụ drilldown popup khi click pie).
  const [rangeTxs, setRangeTxs] = useState<Transaction[]>([]);
  const [heatmapData, setHeatmapData] = useState<Map<string, DailyExpense>>(new Map());
  const [heatmapTxs, setHeatmapTxs] = useState<Map<string, Transaction[]>>(new Map());
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [heatmapAnchor, setHeatmapAnchor] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [catModal, setCatModal] = useState<
    | { name: string; color: string; categoryId: string }
    | null
  >(null);

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  /**
   * Load thu/chi theo range đang chọn.
   * Đồng bộ hoàn toàn KPI, BarChart, và PieChart cùng khoảng thời gian [range.start, range.end].
   */
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [sum, cats, rawBreakdown, hist, txs] = await Promise.all([
        getTransactionsSummary({
          start_date: range.start,
          end_date: range.end,
          timezone,
        }),
        listCategories(),
        getCategoryExpensesBreakdown({
          start_date: range.start,
          end_date: range.end,
          timezone,
        }),
        loadHistory(range),
        // Lấy transactions cho drill-down modal trong range đã chọn
        listTransactions({
          from: `${range.start}T00:00:00Z`,
          to: `${range.end}T23:59:59Z`,
          type: 'expense',
          limit: 1000,
        }),
      ]);

      const totalInc = Number(sum?.total_income ?? 0);
      const totalExp = Number(sum?.total_expense ?? 0);
      setIncome(totalInc);
      setExpense(totalExp);
      setHistory(hist);
      setCategories(cats);
      setRangeTxs(txs as Transaction[]);

      // Xử lý PieChart: Phân bổ Top 7 danh mục, nhóm Chưa phân loại và nhóm Khác (F06)
      const totalExpenseBreakdown = rawBreakdown.reduce((acc, item) => acc + item.total_amount, 0);

      // Tách mục chưa phân loại nếu có
      const uncategorizedItem = rawBreakdown.find(item => item.category_id === '__uncategorized__');
      const categorizedItems = rawBreakdown.filter(item => item.category_id !== '__uncategorized__');

      // Lấy tối đa 7 danh mục lớn nhất
      const topCategorized = categorizedItems.slice(0, 7);
      const remainingCategorized = categorizedItems.slice(7);

      const pieList: PieCategoryItem[] = [];

      // 1. Thêm các danh mục Top 7
      topCategorized.forEach((c, idx) => {
        const pct = totalExp > 0 ? (c.total_amount / totalExp) * 100 : 0;
        pieList.push({
          name: c.category_name,
          categoryId: c.category_id,
          amount: c.total_amount,
          color: c.color || COLORS[idx % COLORS.length],
          count: c.transaction_count,
          percent: Math.round(pct * 10) / 10,
        });
      });

      // 2. Thêm nhóm "Chưa phân loại" nếu có chi tiêu chưa gắn danh mục
      if (uncategorizedItem && uncategorizedItem.total_amount > 0) {
        const pct = totalExp > 0 ? (uncategorizedItem.total_amount / totalExp) * 100 : 0;
        pieList.push({
          name: 'Chưa phân loại',
          categoryId: '__uncategorized__',
          amount: uncategorizedItem.total_amount,
          color: '#757575',
          count: uncategorizedItem.transaction_count,
          percent: Math.round(pct * 10) / 10,
        });
      }

      // 3. Gom các danh mục nhỏ còn lại vào "Khác"
      if (remainingCategorized.length > 0) {
        const otherAmount = remainingCategorized.reduce((acc, item) => acc + item.total_amount, 0);
        const otherCount = remainingCategorized.reduce((acc, item) => acc + item.transaction_count, 0);
        const pct = totalExp > 0 ? (otherAmount / totalExp) * 100 : 0;
        pieList.push({
          name: 'Khác',
          categoryId: '__other__',
          amount: otherAmount,
          color: '#9e9e9e',
          count: otherCount,
          percent: Math.round(pct * 10) / 10,
        });
      }

      // Sắp xếp lại theo số tiền giảm dần
      pieList.sort((a, b) => b.amount - a.amount);
      setByCategory(pieList);

      // Đồng bộ Heatmap anchor nếu tháng hiện tại nằm ngoài range
      const rangeStartDate = parseYmd(range.start);
      const rangeEndDate = parseYmd(range.end);
      if (heatmapAnchor < startOfMonth(rangeStartDate) || heatmapAnchor > endOfMonth(rangeEndDate)) {
        setHeatmapAnchor(startOfMonth(rangeEndDate));
      }
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

    const out: MonthBucket[] = [];
    const concurrency = 6;
    for (let i = 0; i < buckets.length; i += concurrency) {
      const slice = buckets.slice(i, i + concurrency);
      const rows = await Promise.all(
        slice.map(async (b) => {
          const row = await getTransactionsSummary({
            start_date: b.start,
            end_date: b.end,
            timezone,
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
      const daily = groupByDay(txs, timezone);
      setHeatmapData(daily);
      setHeatmapTxs(indexByDay(txs, timezone));
    } catch (e) {
      console.error('[reports-heatmap]', e);
    } finally {
      setHeatmapLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.preset, range.start, range.end, timezone]);

  useEffect(() => {
    loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapAnchor, timezone]);

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
        return `Tình hình chi (${formatDate(range.start)} → ${formatDate(range.end)})`;
    }
  }, [range]);

  // Set các ID thuộc Top 7 danh mục (để lọc danh sách "Khác")
  const distinctTopCategoryIds = useMemo(() => {
    return new Set(
      byCategory
        .filter(c => c.categoryId !== '__other__' && c.categoryId !== '__uncategorized__')
        .map(c => c.categoryId),
    );
  }, [byCategory]);

  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null;

  return (
    <div className="space-y-6 sm:space-y-7">
      <header>
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
          Phân tích thu chi
        </div>
        <h1 className="h-display mt-0.5 text-2xl sm:text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
          Báo cáo
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-ink-500 dark:text-inkDark-500">
          Tổng hợp thu chi toàn diện theo thời gian và theo danh mục (đồng bộ thời gian thực).
        </p>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {/* Range selector & Validity banner (F20) */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Presets scroller */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-card bg-surface-sunken dark:bg-surface-dark-sunken border border-ink-200/70 dark:border-ink-800 no-scrollbar max-w-full">
          {(Object.keys(PRESET_LABELS) as RangePreset[]).map(p => {
            const active = p === rangePreset;
            return (
              <button
                key={p}
                type="button"
                onClick={() => handlePresetChange(p)}
                className={[
                  'rounded-btn px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap',
                  active
                    ? 'bg-brand-600 text-white shadow-xs font-semibold dark:bg-brand-500'
                    : 'text-ink-600 hover:text-ink-900 hover:bg-surface dark:text-inkDark-400 dark:hover:text-inkDark-200 dark:hover:bg-surface-dark',
                ].join(' ')}
                aria-pressed={active}
              >
                {PRESET_LABELS[p]}
              </button>
            );
          })}
        </div>

        {/* Khoảng ngày hiệu lực (F20) */}
        <div className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 rounded-card bg-surface-sunken/60 dark:bg-surface-dark-sunken/70 border border-ink-200/60 dark:border-inkDark-200 text-2xs text-ink-500 dark:text-inkDark-400">
          <CalendarRange size={13} className="text-brand-600 dark:text-brand-400 shrink-0" />
          <span>
            Hiệu lực: <strong className="font-semibold text-ink-800 dark:text-inkDark-900">{formatDate(range.start)}</strong> — <strong className="font-semibold text-ink-800 dark:text-inkDark-900">{formatDate(range.end)}</strong>
          </span>
        </div>
      </div>

      {range.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-card border border-brand-200/70 bg-brand-50/40 dark:border-brand-900/50 dark:bg-brand-950/20 text-xs">
          <span className="font-medium text-ink-700 dark:text-inkDark-700">Tùy chỉnh khoảng thời gian:</span>
          <label className="flex items-center gap-1.5 text-ink-600 dark:text-inkDark-400">
            Từ
            <input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={e => setCustomStart(e.target.value)}
              className="rounded-btn border border-ink-200 bg-surface px-2.5 py-1 text-xs text-ink-900 shadow-2xs dark:border-inkDark-200 dark:bg-surface-dark dark:text-inkDark-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-ink-600 dark:text-inkDark-400">
            Đến
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              max={toLocalDateString(today)}
              onChange={e => setCustomEnd(e.target.value)}
              className="rounded-btn border border-ink-200 bg-surface px-2.5 py-1 text-xs text-ink-900 shadow-2xs dark:border-inkDark-200 dark:bg-surface-dark dark:text-inkDark-900"
            />
          </label>
        </div>
      )}

      {/* KPI Cards: 3 stats harmonious overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Thu nhập */}
        <div className="card relative overflow-hidden p-3.5 sm:p-4.5 flex flex-col justify-between border-l-4 border-l-ok-500">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-ok-600 dark:text-ok-400">
              Thu nhập
            </span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full bg-ok-50 text-ok-600 dark:bg-ok-900/40 dark:text-ok-400 shrink-0">
              <TrendingUp size={15} strokeWidth={2} />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            {loading ? (
              <Skeleton className="h-7 w-28 sm:w-36" />
            ) : (
              <div className="num text-lg sm:text-2xl font-bold tracking-tight text-ok-600 dark:text-ok-400">
                {formatVND(income)}
              </div>
            )}
            <div className="mt-0.5 text-2xs text-ink-400 dark:text-inkDark-500">
              Tổng tiền ghi nhận vào
            </div>
          </div>
        </div>

        {/* Chi tiêu */}
        <div className="card relative overflow-hidden p-3.5 sm:p-4.5 flex flex-col justify-between border-l-4 border-l-err-500">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-err-600 dark:text-err-400">
              Chi tiêu
            </span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full bg-err-50 text-err-600 dark:bg-err-900/40 dark:text-err-400 shrink-0">
              <TrendingDown size={15} strokeWidth={2} />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            {loading ? (
              <Skeleton className="h-7 w-28 sm:w-36" />
            ) : (
              <div className="num text-lg sm:text-2xl font-bold tracking-tight text-err-600 dark:text-err-400">
                {formatVND(expense)}
              </div>
            )}
            <div className="mt-0.5 text-2xs text-ink-400 dark:text-inkDark-500">
              Tổng tiền chi ra ngoài
            </div>
          </div>
        </div>

        {/* Chênh lệch thu - chi */}
        <div className={`card relative overflow-hidden p-3.5 sm:p-4.5 flex flex-col justify-between col-span-2 sm:col-span-1 border-l-4 ${
          net >= 0 ? 'border-l-brand-500 dark:border-l-brand-400' : 'border-l-err-500 dark:border-l-err-400'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-600 dark:text-inkDark-400">
              Chênh lệch thu – chi
            </span>
            <div className={`grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full shrink-0 ${
              net >= 0
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
                : 'bg-err-50 text-err-600 dark:bg-err-900/40 dark:text-err-400'
            }`}>
              <Scale size={15} strokeWidth={2} />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            {loading ? (
              <Skeleton className="h-7 w-28 sm:w-36" />
            ) : (
              <div className={`num text-lg sm:text-2xl font-bold tracking-tight ${
                net > 0
                  ? 'text-brand-600 dark:text-brand-400'
                  : net < 0
                  ? 'text-err-600 dark:text-err-400'
                  : 'text-ink-700 dark:text-inkDark-300'
              }`}>
                {net > 0 ? `+${formatVND(net)}` : formatVND(net)}
              </div>
            )}
            <div className="mt-0.5 flex items-center gap-1.5 text-2xs">
              {income === 0 && expense === 0 ? (
                <span className="text-ink-400 dark:text-inkDark-500">Chưa có biến động</span>
              ) : net >= 0 ? (
                <span className="inline-flex items-center font-medium text-ok-600 dark:text-ok-400">
                  Thặng dư {savingsRate !== null ? `(${savingsRate}%)` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center font-medium text-err-600 dark:text-err-400">
                  Thâm hụt {savingsRate !== null ? `(${Math.abs(savingsRate)}%)` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Biểu đồ xu hướng (BarChart) */}
      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-4 sm:px-5 py-3.5 dark:border-inkDark-200">
          <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
            {sectionTitle}
          </h2>
        </div>
        <div className="p-4 sm:p-5">
          {loading ? (
            <Skeleton className="h-72" />
          ) : history.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-10 text-center text-sm text-ink-500 dark:border-inkDark-200 dark:bg-surface-dark-sunken dark:text-inkDark-400">
              Chưa có dữ liệu trong khoảng này.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#3a3127' : '#e2e8f0'} vertical={false} opacity={0.6} />
                  <XAxis dataKey="label" stroke={isDark ? '#8b7d6b' : '#94a3b8'} fontSize={12} tickLine={false} />
                  <YAxis stroke={isDark ? '#8b7d6b' : '#94a3b8'} fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => compactVNDMinor(Number(v))} />
                  <Tooltip
                    formatter={v => formatVND(Number(v))}
                    contentStyle={{
                      backgroundColor: isDark ? '#1f1a14' : 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '8px',
                      border: `1px solid ${isDark ? '#3a3127' : '#e2e8f0'}`,
                      boxShadow: isDark ? '0 4px 12px rgba(0, 0, 0, 0.35)' : '0 4px 12px rgba(0, 0, 0, 0.08)',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: isDark ? '#f4ede0' : '#0f172a', fontWeight: 600 }}
                    itemStyle={{ color: isDark ? '#f4ede0' : '#0f172a' }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: 8, fontSize: '12px' }}
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-xs font-medium text-ink-700 dark:text-inkDark-700">
                        {value}
                      </span>
                    )}
                  />
                  <Bar dataKey="income" name="Thu nhập" fill={isDark ? '#22c55e' : '#15803d'} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="expense" name="Chi tiêu" fill={isDark ? '#f87171' : '#dc2626'} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
            Trục Y hiển thị số tiền thu / chi theo VND.
          </p>
        </div>
      </section>

      {/* Biểu đồ tròn và bảng phân bổ danh mục (PieChart & Table - F06, F20) */}
      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3.5 dark:border-inkDark-200">
          <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
            Chi tiêu theo danh mục ({PRESET_LABELS[range.preset]})
          </h2>
        </div>
        <div className="p-5">
          {loading ? (
            <Skeleton className="h-72" />
          ) : byCategory.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-10 text-center text-sm text-ink-500 dark:border-inkDark-200 dark:bg-surface-dark-sunken dark:text-inkDark-400">
              Chưa có dữ liệu chi tiêu trong khoảng thời gian này.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart style={{ outline: 'none' }}>
                    <Pie
                      data={byCategory}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={100}
                      paddingAngle={3}
                      stroke={isDark ? '#1f1a14' : '#ffffff'}
                      strokeWidth={2}
                      onClick={(d) => {
                        const payload = d as unknown as PieCategoryItem;
                        if (!payload?.categoryId) return;
                        setCatModal({
                          name: payload.name ?? 'Khác',
                          color: payload.color ?? '#757575',
                          categoryId: payload.categoryId,
                        });
                      }}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      {byCategory.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.color || COLORS[i % COLORS.length]}
                          stroke={isDark ? '#1f1a14' : '#ffffff'}
                          strokeWidth={2}
                          style={{ outline: 'none' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name, item) => [
                        `${formatVND(Number(v))} (${(item.payload as PieCategoryItem).percent}%)`,
                        name,
                      ]}
                      contentStyle={{
                        backgroundColor: isDark ? '#1f1a14' : 'rgba(255, 255, 255, 0.95)',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#3a3127' : '#e2e8f0'}`,
                        boxShadow: isDark ? '0 4px 12px rgba(0, 0, 0, 0.35)' : '0 4px 12px rgba(0, 0, 0, 0.08)',
                        fontSize: '12px',
                      }}
                      itemStyle={{ color: isDark ? '#f4ede0' : '#0f172a' }}
                      labelStyle={{ color: isDark ? '#f4ede0' : '#0f172a', fontWeight: 600 }}
                    />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs font-medium text-ink-700 dark:text-inkDark-700">
                          {value}
                        </span>
                      )}
                      wrapperStyle={{ paddingTop: 10, fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bảng chi tiết danh mục */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {byCategory.map(item => (
                  <div
                    key={item.categoryId}
                    onClick={() => setCatModal({ name: item.name, color: item.color, categoryId: item.categoryId })}
                    className="flex items-center justify-between p-2.5 rounded-btn hover:bg-ink-50 dark:hover:bg-surface-dark-sunken cursor-pointer transition text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-3 w-3 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: item.color }} />
                      <span className="truncate font-medium text-ink-900 dark:text-inkDark-900">{item.name}</span>
                      <span className="text-2xs text-ink-500 dark:text-inkDark-400">({item.count} GD)</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-semibold text-ink-900 dark:text-inkDark-900 tabular-nums">
                        {formatVND(item.amount)}
                      </span>
                      <span className="ml-2 text-2xs font-semibold text-ink-500 dark:text-inkDark-400">
                        {item.percent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mt-2 text-2xs text-ink-500 dark:text-inkDark-400">
            Click vào 1 danh mục trên biểu đồ hoặc danh sách để xem chi tiết giao dịch.
          </p>
        </div>
      </section>

      {/* Heatmap chi tiêu theo ngày */}
      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3.5 dark:border-inkDark-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
              Chi tiêu theo từng ngày
            </h2>
            <div className="flex items-center gap-2">
              {heatmapLoading && (
                <span className="text-2xs uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-400" aria-live="polite">
                  Đang tải…
                </span>
              )}
              <p className="text-2xs text-ink-500 dark:text-inkDark-400">
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

      {/* Modal: Giao dịch thuộc danh mục trong khoảng thời gian đã chọn (F06, F20) */}
      <Modal
        open={catModal !== null}
        onClose={() => setCatModal(null)}
        title={catModal ? `Giao dịch — ${catModal.name}` : 'Giao dịch'}
        description={`Các giao dịch thuộc danh mục này trong khoảng thời gian đã chọn (${formatDate(range.start)} – ${formatDate(range.end)}).`}
      >
        {(() => {
          if (!catModal) return null;

          // Lọc giao dịch chính xác cho cả danh mục thường, Chưa phân loại và Khác
          const filtered = rangeTxs
            .filter(t => {
              const k = categoryKey(t);
              if (catModal.categoryId === '__uncategorized__') {
                return !k;
              }
              if (catModal.categoryId === '__other__') {
                return k && !distinctTopCategoryIds.has(k);
              }
              return k === catModal.categoryId;
            })
            .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

          const total = filtered.reduce((s, t) => s + t.amount_minor, 0);

          return (
            <div>
              <div className="mb-3 flex items-center justify-between rounded-card border border-ink-200 bg-surface-sunken px-3 py-2 text-xs dark:border-inkDark-200 dark:bg-surface-dark-sunken">
                <span className="inline-flex items-center gap-2 text-ink-600 dark:text-inkDark-400">
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
                <div className="rounded-card border border-dashed border-ink-200 bg-surface-sunken px-6 py-8 text-center text-sm text-ink-500 dark:border-inkDark-200 dark:bg-surface-dark-sunken dark:text-inkDark-400">
                  Chưa có giao dịch nào trong khoảng thời gian này.
                </div>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto dark:divide-inkDark-200">
                  {filtered.map(t => (
                    <li key={t.id} className="flex items-start justify-between gap-3 px-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-900 dark:text-inkDark-900">
                          {t.payee || t.note || 'Không tiêu đề'}
                        </div>
                        <div className="mt-0.5 text-2xs text-ink-500 dark:text-inkDark-400">
                          {formatDateTime(t.occurred_at)}
                          {t.note && t.payee && (
                            <span className="ml-2 italic">— {t.note}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-err-600 dark:text-err-400">
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