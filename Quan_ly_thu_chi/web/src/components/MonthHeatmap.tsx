import { useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatVND } from '../lib/format';
import {
  buildMonthGrid,
  compactVNDMinor,
  computeMonthStats,
  type CalendarCell,
  type DailyExpense,
  topSpendDays,
} from '../lib/daily';
import type { Transaction } from '../lib/types';

interface Props {
  year: number;
  monthIndex: number;
  expenses: Map<string, DailyExpense>;
  /** Map ngày → danh sách transactions của ngày đó. */
  transactionsByDay: Map<string, Transaction[]>;
  onChangeMonth: (year: number, monthIndex: number) => void;
  /** Được gọi khi user click vào 1 ô ngày có dữ liệu. */
  onDayClick: (date: string) => void;
}

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Tô màu theo giá trị ròng của ngày (thu - chi):
 * - amount > 0  (bội chi) → tông đỏ (5 bậc)
 * - amount < 0  (dương)   → tông xanh (5 bậc)
 * - amount = 0            → nền trung tính
 * Mỗi bậc đã cân chỉnh contrast: text trên nền luôn đạt AA.
 */
type CellTone = 0 | 1 | 2 | 3 | 4;

function intensityTone(amount: number, max: number): CellTone {
  if (amount === 0 || max === 0) return 0;
  const ratio = Math.abs(amount) / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

const RED_TONE_CLASS: Record<CellTone, string> = {
  0: 'bg-surface-sunken/40 text-ink-500 border-ink-100/60 dark:bg-surface-dark-sunken/40 dark:text-inkDark-500 dark:border-inkDark-200/50',
  1: 'bg-rose-50/70 text-rose-900 border-rose-200/60 dark:bg-rose-950/25 dark:text-rose-300 dark:border-rose-900/30',
  2: 'bg-rose-100/75 text-rose-900 border-rose-300/60 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800/40',
  3: 'bg-rose-200/80 text-rose-950 border-rose-400/70 dark:bg-rose-800/45 dark:text-rose-200 dark:border-rose-700/50',
  4: 'bg-rose-300/60 text-rose-950 border-2 border-rose-500/80 shadow-2xs dark:bg-rose-800/75 dark:text-rose-100 dark:border-2 dark:border-rose-500/80',
};

const GREEN_TONE_CLASS: Record<CellTone, string> = {
  0: 'bg-surface-sunken/40 text-ink-500 border-ink-100/60 dark:bg-surface-dark-sunken/40 dark:text-inkDark-500 dark:border-inkDark-200/50',
  1: 'bg-emerald-50/70 text-emerald-900 border-emerald-200/60 dark:bg-emerald-950/25 dark:text-emerald-300 dark:border-emerald-900/30',
  2: 'bg-emerald-100/75 text-emerald-900 border-emerald-300/60 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/40',
  3: 'bg-emerald-200/80 text-emerald-950 border-emerald-400/70 dark:bg-emerald-800/45 dark:text-emerald-200 dark:border-emerald-700/50',
  4: 'bg-emerald-300/60 text-emerald-950 border-2 border-emerald-500/80 shadow-2xs dark:bg-emerald-800/75 dark:text-emerald-100 dark:border-2 dark:border-emerald-500/80',
};

function formatMonthLabel(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1);
  return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(d);
}

export function MonthHeatmap({
  year,
  monthIndex,
  expenses,
  transactionsByDay,
  onChangeMonth,
  onDayClick,
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const tooltipId = useId();

  const grid = useMemo(() => {
    return buildMonthGrid(year, monthIndex, expenses);
  }, [year, monthIndex, expenses]);
  // Lấy max của |net| (chi - thu) để tô cường độ đỏ/xanh đối xứng nhau.
  const max = useMemo(
    () =>
      Array.from(expenses.values()).reduce(
        (m, d) => Math.max(m, Math.abs(d.amount_minor - d.income_minor)),
        0,
      ),
    [expenses],
  );
  const stats = useMemo(() => computeMonthStats(expenses, year, monthIndex), [expenses, year, monthIndex]);
  const topDays = useMemo(() => topSpendDays(expenses, 5), [expenses]);
  // Tổng thu / chi / ròng trong tháng (dùng cho stat cards).
  // Quy ước: ròng = income - expense. Dương = dư, Âm = bội chi.
  const { totalIncome, totalExpense, netMonth } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const d of expenses.values()) {
      inc += d.income_minor;
      exp += d.amount_minor;
    }
    return { totalIncome: inc, totalExpense: exp, netMonth: inc - exp };
  }, [expenses]);

  function goto(delta: number) {
    const d = new Date(year, monthIndex + delta, 1);
    onChangeMonth(d.getFullYear(), d.getMonth());
  }
  function gotoThisMonth() {
    const t = new Date();
    onChangeMonth(t.getFullYear(), t.getMonth());
  }

  const isCurrentMonth = (() => {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === monthIndex;
  })();

  const hovered = hoveredKey ? expenses.get(hoveredKey) : null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary grid h-8 w-8 place-items-center !p-0"
            onClick={() => goto(-1)}
            aria-label="Tháng trước"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <h3 className="h-display min-w-[10rem] text-center text-sm font-semibold capitalize text-ink-900 dark:text-inkDark-900">
            {formatMonthLabel(year, monthIndex)}
          </h3>
          <button
            type="button"
            className="btn-secondary grid h-8 w-8 place-items-center !p-0"
            onClick={() => goto(1)}
            aria-label="Tháng sau"
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
          {!isCurrentMonth && (
            <button type="button" className="btn-ghost ml-2 text-xs" onClick={gotoThisMonth}>
              Tháng này
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-flat px-3 py-2.5">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
            Tổng thu nhập
          </div>
          <div className="num mt-0.5 text-lg tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
            +{formatVND(totalIncome)}
          </div>
        </div>
        <div className="card-flat px-3 py-2.5">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-err-600 dark:text-err-400">
            Tổng chi tiêu
          </div>
          <div className="num mt-0.5 text-lg tabular-nums font-bold text-err-600 dark:text-err-400">
            −{formatVND(totalExpense)}
          </div>
        </div>
        <div className="card-flat px-3 py-2.5">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-400">
            Ròng tháng
          </div>
          <div
            className={`num mt-0.5 text-lg tabular-nums font-bold ${netMonth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-err-600 dark:text-err-400'}`}
          >
            {netMonth >= 0 ? '+' : '−'}
            {formatVND(Math.abs(netMonth))}
          </div>
          <div className="mt-1 flex items-center">
            {netMonth >= 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
                Thặng dư
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50">
                Thâm hụt
              </span>
            )}
          </div>
        </div>
        <div className="card-flat px-3 py-2.5">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-400">
            Ngày chi cao nhất
          </div>
          <div className="num mt-0.5 text-lg tabular-nums font-bold text-ink-900 dark:text-inkDark-900">
            {stats.max_day ? formatVND(stats.max_day.amount_minor) : '—'}
          </div>
          {stats.max_day && (
            <div className="mt-0.5 text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
              {new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(
                new Date(stats.max_day.date),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div role="grid" aria-label={`Chi tiêu tháng ${formatMonthLabel(year, monthIndex)}`}>
        <div
          role="row"
          className="grid grid-cols-7 gap-1 text-center text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-500 mb-1"
        >
          {WEEKDAY_LABELS.map(l => (
            <div key={l} role="columnheader">
              {l}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {grid.map((row, ri) => (
            <div key={ri} role="row" className="grid grid-cols-7 gap-1">
              {row.map((cell, ci) => (
                <CellView
                  key={`${ri}-${ci}`}
                  cell={cell}
                  max={max}
                  tooltipId={tooltipId}
                  onHover={setHoveredKey}
                  onActivate={() => {
                    if (cell.date && (cell.amount_minor > 0 || cell.income_minor > 0)) onDayClick(cell.date);
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip / detail panel */}
      <div
        id={tooltipId}
        role="status"
        aria-live="polite"
        className="min-h-[2.5rem] rounded-card border border-ink-100 bg-surface-sunken px-3 py-2 text-sm dark:border-inkDark-200 dark:bg-surface-dark-sunken"
      >
        {hovered ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium text-ink-900 dark:text-inkDark-900">
                {new Intl.DateTimeFormat('vi-VN', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                }).format(new Date(hovered.date))}
              </div>
              <div className="text-xs text-ink-500 dark:text-inkDark-400">
                {hovered.count} giao dịch ·{' '}
                <span className="text-err-600 dark:text-err-400">−{formatVND(hovered.amount_minor)}</span>
                {hovered.income_minor > 0 && (
                  <>
                    {' / '}
                    <span className="text-emerald-700 dark:text-emerald-400">+{formatVND(hovered.income_minor)}</span>
                  </>
                )}
                {' · ròng: '}
                <span
                  className={
                    hovered.income_minor - hovered.amount_minor >= 0
                      ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                      : 'text-err-600 dark:text-err-400 font-medium'
                  }
                >
                  {hovered.income_minor - hovered.amount_minor >= 0 ? '+' : '−'}
                  {formatVND(Math.abs(hovered.income_minor - hovered.amount_minor))}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-500 dark:text-inkDark-400">
                {max > 0
                  ? `${Math.round((Math.abs(hovered.amount_minor - hovered.income_minor) / max) * 100)}% so với ngày mạnh nhất`
                  : '—'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-ink-500 dark:text-inkDark-400">
            Di chuột qua một ngày để xem chi tiết.
          </div>
        )}
      </div>

      {/* Legend gradient */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500 dark:text-inkDark-400">
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
          <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-400 dark:bg-emerald-500" />
          Dương
        </span>
        <div className="flex h-3 overflow-hidden rounded border border-ink-200 dark:border-inkDark-200">
          <div className="w-5 bg-emerald-300/70 dark:bg-emerald-800/75" />
          <div className="w-5 bg-emerald-200/80 dark:bg-emerald-800/45" />
          <div className="w-5 bg-emerald-100/75 dark:bg-emerald-900/30" />
          <div className="w-5 bg-emerald-50/70 dark:bg-emerald-950/25" />
          <div className="w-5 bg-surface-sunken dark:bg-surface-dark-sunken" />
          <div className="w-5 bg-rose-50/70 dark:bg-rose-950/25" />
          <div className="w-5 bg-rose-100/75 dark:bg-rose-900/30" />
          <div className="w-5 bg-rose-200/80 dark:bg-rose-800/45" />
          <div className="w-5 bg-rose-300/70 dark:bg-rose-800/75" />
        </div>
        <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
          <span className="inline-block h-2.5 w-2.5 rounded-xs bg-rose-400 dark:bg-rose-500" />
          Âm
        </span>
        <span className="ml-3 text-ink-400 dark:text-inkDark-400">
          ({stats.active_days} ngày có giao dịch)
        </span>
      </div>

      {/* Top 5 ngày chi nhiều */}
      {topDays.length > 0 && (
        <div>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-inkDark-400">
            Top 5 ngày chi nhiều nhất
          </h4>
          <ol className="space-y-1">
            {topDays.map((d, i) => (
              <li
                key={d.date}
                className="flex items-center justify-between rounded-card border border-ink-100 bg-surface-raised px-3 py-1.5 text-sm dark:border-inkDark-200 dark:bg-surface-dark-raised"
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-50 text-2xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {i + 1}
                  </span>
                  <span className="text-ink-900 dark:text-inkDark-900 font-medium">
                    {new Intl.DateTimeFormat('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    }).format(new Date(d.date))}
                  </span>
                  <span className="text-xs text-ink-500 dark:text-inkDark-400">
                    ({d.count} giao dịch)
                  </span>
                </span>
                <span className="num tabular-nums font-semibold text-err-600 dark:text-err-400">
                  {formatVND(d.amount_minor)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function CellView({
  cell,
  max,
  tooltipId,
  onHover,
  onActivate,
}: {
  cell: CalendarCell;
  max: number;
  tooltipId: string;
  onHover: (key: string | null) => void;
  onActivate: () => void;
}) {
  if (!cell.date) {
    return (
      <div
        role="gridcell"
        aria-hidden
        className="aspect-square rounded border border-transparent"
      />
    );
  }
  const ringClass = cell.isToday ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-surface dark:ring-offset-surface-dark' : '';
  const opacityClass = cell.isFuture ? 'opacity-40' : '';
  const hasExpense = cell.amount_minor > 0;
  const hasIncome = cell.income_minor > 0;
  // deficit = expense - income. Dương (deficit > 0) → đỏ. Âm (deficit < 0, dư) → xanh.
  const deficit = cell.amount_minor - cell.income_minor;
  const tone = intensityTone(deficit, max);
  const toneCls = deficit > 0
    ? RED_TONE_CLASS[tone]
    : deficit < 0
      ? GREEN_TONE_CLASS[tone]
      : RED_TONE_CLASS[0];
  const ariaLabel = hasExpense && hasIncome
    ? `Ngày ${cell.day}, chi tiêu ${formatVND(cell.amount_minor)}, thu nhập ${formatVND(cell.income_minor)}, ${cell.count} giao dịch. Nhấn Enter để xem chi tiết.`
    : hasExpense
      ? `Ngày ${cell.day}, chi tiêu ${formatVND(cell.amount_minor)}, ${cell.count} giao dịch. Nhấn Enter để xem chi tiết.`
      : hasIncome
        ? `Ngày ${cell.day}, thu nhập ${formatVND(cell.income_minor)}. Nhấn Enter để xem chi tiết.`
        : `Ngày ${cell.day}, không có giao dịch`;
  const dayTextCls = deficit < 0
    ? 'text-emerald-950 dark:text-emerald-100'
    : deficit > 0
      ? 'text-rose-950 dark:text-rose-100'
      : 'text-ink-600 dark:text-inkDark-500';

  const incomeTextCls = 'text-emerald-700 dark:text-emerald-300 font-bold';
  const expenseTextCls = 'text-rose-700 dark:text-rose-300 font-semibold';

  return (
    <button
      type="button"
      role="gridcell"
      aria-describedby={tooltipId}
      aria-label={ariaLabel}
      onMouseEnter={() => onHover(cell.date)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(cell.date)}
      onBlur={() => onHover(null)}
      onClick={onActivate}
      disabled={!hasExpense && !hasIncome}
      className={`group relative aspect-square rounded-lg border p-1 text-left flex flex-col justify-between transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-400 ${
        hasExpense || hasIncome
          ? 'cursor-pointer hover:scale-[1.04] hover:shadow-sm'
          : 'cursor-default'
      } ${toneCls} ${ringClass} ${opacityClass}`}
    >
      <div className="flex items-start justify-between w-full leading-none gap-0.5">
        <span className={`text-[11px] font-bold ${dayTextCls}`}>
          {cell.day}
        </span>
        {hasIncome && (
          <span className={`text-[9px] tabular-nums leading-tight ${incomeTextCls}`}>
            +{compactVNDMinor(cell.income_minor)}
          </span>
        )}
      </div>
      {hasExpense && (
        <div className="flex justify-end w-full leading-none mt-auto">
          <span className={`text-[9px] tabular-nums leading-tight ${expenseTextCls}`}>
            −{compactVNDMinor(cell.amount_minor)}
          </span>
        </div>
      )}
    </button>
  );
}
