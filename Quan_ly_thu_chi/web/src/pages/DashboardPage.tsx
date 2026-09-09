import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { CategoryIcon } from '../components/CategoryIcon';
import { AccountIcon } from '../components/AccountIcon';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useAuth } from '../lib/auth';
import {
  getBudgetProgress,
  getNetWorth,
  getTransactionsSummary,
  listAccountsWithBalances,
  listBudgets,
  listCategories,
  listRecurring,
  listTransactions,
} from '../lib/api';
import { formatDateTime, formatVND, toLocalDateString } from '../lib/format';
import { resolveCategory } from '../lib/categoryResolve';
import type { Category, FinancialAccount, Transaction } from '../lib/types';
import {
  ACCOUNT_TYPE_LABEL,
  TRANSACTION_TYPE_LABEL,
} from '../lib/labels';

interface AccountWithBalance extends FinancialAccount {
  balance: number;
}

interface ActionableInsight {
  id: string;
  type: 'danger' | 'warning' | 'info';
  title: string;
  description: string;
  linkText: string;
  linkTo: string;
}

export function DashboardPage() {
  useDocumentTitle('Tổng quan');
  const { profile } = useAuth();
  const timezone = profile?.timezone || 'Asia/Ho_Chi_Minh';
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [netWorth, setNetWorth] = useState<number>(0);
  const [monthIncome, setMonthIncome] = useState<number>(0);
  const [monthExpense, setMonthExpense] = useState<number>(0);
  const [insights, setInsights] = useState<ActionableInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [accs, txs, cats, nw] = await Promise.all([
        listAccountsWithBalances(),
        listTransactions({ limit: 6 }),
        listCategories(),
        getNetWorth(),
      ]);
      setAccounts(accs);
      setRecent(txs);
      setCategories(cats);
      setNetWorth(nw);

      const now = new Date();
      const start = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const sum = await getTransactionsSummary({
        start_date: start,
        end_date: end,
        timezone,
      });
      setMonthIncome(Number(sum?.total_income ?? 0));
      setMonthExpense(Number(sum?.total_expense ?? 0));

      // Quét các việc cần chú ý (Actionable Insights - F21)
      const collected: ActionableInsight[] = [];
      try {
        // 1. Quét ngân sách sắp chạm trần hoặc vượt
        const budgets = await listBudgets();
        const activeBudgets = budgets.filter(b => b.is_active);
        const progressList = await Promise.all(
          activeBudgets.slice(0, 5).map(b => getBudgetProgress(b.id, start, end).catch(() => null)),
        );
        for (let i = 0; i < progressList.length; i++) {
          const p = progressList[i];
          const b = activeBudgets[i];
          if (p && b && p.percent >= 80) {
            if (p.percent >= 100) {
              collected.push({
                id: `budget-${b.id}`,
                type: 'danger',
                title: `Ngân sách vượt ${Math.round(p.percent)}%`,
                description: `"${b.name}" đã chi ${formatVND(p.spent_minor)} / ${formatVND(b.amount_minor)}.`,
                linkText: 'Xem ngân sách',
                linkTo: '/budgets',
              });
            } else {
              collected.push({
                id: `budget-${b.id}`,
                type: 'warning',
                title: `Ngân sách chạm ${Math.round(p.percent)}%`,
                description: `"${b.name}" sắp chạm trần chi tiêu tháng.`,
                linkText: 'Xem ngân sách',
                linkTo: '/budgets',
              });
            }
          }
        }

        // 2. Quét giao dịch định kỳ đến hạn
        const rules = await listRecurring();
        const todayStr = toLocalDateString(now);
        const dueRules = rules.filter(
          r => r.status === 'active' && r.next_occurrence && r.next_occurrence <= todayStr,
        );
        if (dueRules.length > 0) {
          collected.push({
            id: 'recurring-due',
            type: 'warning',
            title: `${dueRules.length} khoản định kỳ đến hạn`,
            description: `Có chi phí hoặc thu nhập định kỳ cần được ghi nhận vào sổ.`,
            linkText: 'Ghi nhận ngay',
            linkTo: '/recurring',
          });
        }

        // 3. Quét giao dịch chưa phân loại
        const uncategorized = txs.filter(
          t => !t.category_id && t.type !== 'transfer' && t.status !== 'voided',
        );
        if (uncategorized.length > 0) {
          collected.push({
            id: 'uncategorized',
            type: 'info',
            title: `${uncategorized.length} giao dịch chưa phân loại`,
            description: `Giao dịch gần đây chưa có danh mục, ảnh hưởng tới biểu đồ phân tích.`,
            linkText: 'Phân loại ngay',
            linkTo: '/transactions',
          });
        }
      } catch {
        // Tránh gián đoạn dashboard nếu sub-query lỗi
      }
      setInsights(collected.slice(0, 3));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const monthNet = monthIncome - monthExpense;
  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date())}
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Tổng quan tài chính
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Số dư, thu chi và các giao dịch gần nhất.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-2"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới dữ liệu tổng quan"
          >
            {loading ? <Spinner size="sm" /> : null}
            {loading ? 'Đang tải…' : 'Làm mới'}
          </button>
          <Link to="/transactions?action=new" className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={16} strokeWidth={2.25} /> Giao dịch mới
          </Link>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {!loading && accounts.length === 0 && (
        <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50/80 via-surface to-brand-50/40 p-6 dark:border-brand-800 dark:from-brand-950/40 dark:via-surface-dark dark:to-brand-900/20 shadow-card">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                <WalletIcon size={16} /> Bắt đầu với Quản lý thu chi
              </div>
              <h2 className="text-xl font-bold text-ink-900 dark:text-inkDark-900">
                Chào mừng bạn! Hãy thiết lập tài khoản đầu tiên
              </h2>
              <p className="text-sm text-ink-600 dark:text-inkDark-400 max-w-xl">
                Để theo dõi dòng tiền chính xác, bạn cần tạo ít nhất một ví hoặc tài khoản ngân hàng (ví dụ: Tiền mặt, Vietcombank, Momo...).
              </p>
            </div>
            <Link
              to="/accounts"
              className="btn-primary shrink-0 inline-flex items-center gap-2 shadow-pop"
            >
              <Plus size={16} strokeWidth={2.25} /> Thiết lập tài khoản ngay
            </Link>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          eyebrow="Tất cả"
          title="Tổng tài sản"
          value={formatVND(netWorth)}
          accent="brand"
          loading={loading}
          icon={WalletIcon}
        />
        <StatCard
          eyebrow="Tháng này"
          title="Thu nhập"
          value={formatVND(monthIncome)}
          accent="ok"
          loading={loading}
          icon={TrendingUp}
        />
        <StatCard
          eyebrow="Tháng này"
          title="Chi tiêu"
          value={formatVND(monthExpense)}
          accent="err"
          loading={loading}
          icon={TrendingDown}
          subtitle={`Chênh lệch thu–chi: ${monthNet >= 0 ? '+' : ''}${formatVND(monthNet)}`}
        />
      </div>

      {/* Cần chú ý (Actionable Insights - F21) */}
      {!loading && insights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-600 dark:text-inkDark-400 flex items-center gap-2">
              <AlertCircle size={15} className="text-brand-500" />
              Cần chú ý ({insights.length})
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map(item => (
              <div
                key={item.id}
                className={clsx(
                  'card flex flex-col justify-between p-4 border-l-4 transition hover:shadow-pop',
                  item.type === 'danger' && 'border-l-err-500 bg-err-50/20 dark:bg-err-950/10',
                  item.type === 'warning' && 'border-l-warning-500 bg-warning-50/20 dark:bg-warning-950/10',
                  item.type === 'info' && 'border-l-info-500 bg-info-50/20 dark:bg-info-950/10',
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-900 dark:text-inkDark-900">
                    {item.type === 'danger' && <AlertTriangle size={14} className="text-err-500 shrink-0" />}
                    {item.type === 'warning' && <AlertCircle size={14} className="text-warning-500 shrink-0" />}
                    {item.type === 'info' && <Tag size={14} className="text-info-500 shrink-0" />}
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-ink-600 dark:text-inkDark-400">
                    {item.description}
                  </p>
                </div>
                <div className="pt-3 mt-1 border-t border-ink-100 dark:border-inkDark-200 flex justify-end">
                  <Link
                    to={item.linkTo}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {item.linkText} <ArrowUpRight size={12} strokeWidth={2} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accounts + Recent */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-ink-800">
            <div>
              <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
                Tài khoản
              </h2>
              <p className="text-2xs uppercase tracking-[0.16em] text-ink-400 dark:text-inkDark-400">
                Số dư hiện tại
              </p>
            </div>
            <Link
              to="/accounts"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Quản lý <ArrowUpRight size={12} strokeWidth={2} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Chưa có tài khoản"
                description="Thêm tài khoản đầu tiên để bắt đầu theo dõi tài chính."
                icon={<WalletIcon size={20} strokeWidth={1.5} />}
                action={
                  <Link to="/accounts" className="btn-primary">
                    + Tạo tài khoản
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {accounts.map(a => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AccountIcon name={a.icon} color={a.color} size="md" variant="solid" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-900 dark:text-inkDark-900">
                        {a.name}
                      </div>
                      <div className="truncate text-xs text-ink-500 dark:text-inkDark-500">
                        {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
                        {a.institution_name ? ` · ${a.institution_name}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="num shrink-0 text-base tabular-nums text-ink-900 dark:text-inkDark-900">
                    {formatVND(a.balance)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-ink-800">
            <div>
              <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
                Giao dịch gần đây
              </h2>
              <p className="text-2xs uppercase tracking-[0.16em] text-ink-400 dark:text-inkDark-400">
                {recent.length > 0 ? `${Math.min(recent.length, 6)} mục mới nhất` : '6 mục mới nhất'}
              </p>
            </div>
            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Xem tất cả <ArrowUpRight size={12} strokeWidth={2} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : recent.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Chưa có giao dịch"
                description="Tạo giao dịch đầu tiên để bắt đầu theo dõi."
                icon={<ArrowLeftRight size={20} strokeWidth={1.5} />}
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {recent.slice(0, 6).map(t => {
                const cat = resolveCategory(categoryById, t);
                const isVoid = t.status === 'voided';
                const accent =
                  t.type === 'income' ? 'ok' : t.type === 'expense' ? 'err' : 'brand';
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                  >
                    {cat ? (
                      <CategoryIcon name={cat.icon} color={cat.color} size="sm" />
                    ) : (
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-inkDark-500">
                        <ArrowLeftRight size={14} strokeWidth={1.75} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-sm font-medium ${isVoid ? 'line-through text-ink-400 dark:text-inkDark-400' : 'text-ink-900 dark:text-inkDark-900'}`}
                      >
                        {t.payee ?? TRANSACTION_TYPE_LABEL[t.type]}
                      </div>
                      <div className="truncate text-xs text-ink-500 dark:text-inkDark-500">
                        {formatDateTime(t.occurred_at)}
                        {t.status === 'voided' && (
                          <span className="ml-1 text-err-600 dark:text-err-500">(đã hủy)</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-sm font-semibold tabular-nums ${amountColor(accent)} ${isVoid ? 'opacity-40' : ''}`}
                    >
                      <span className="mr-0.5">
                        {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                      </span>
                      {formatVND(t.amount_minor)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function amountColor(accent: 'brand' | 'ok' | 'err') {
  return accent === 'ok'
    ? 'text-ok-600 dark:text-ok-500'
    : accent === 'err'
      ? 'text-err-600 dark:text-err-500'
      : 'text-ink-900 dark:text-inkDark-900';
}

interface StatCardProps {
  eyebrow: string;
  title: string;
  value: string;
  subtitle?: string;
  accent: 'brand' | 'ok' | 'err';
  loading: boolean;
  icon: LucideIcon;
}

function StatCard({ eyebrow, title, value, subtitle, accent, loading, icon: IconCmp }: StatCardProps) {
  const accentMap = {
    brand: {
      ring: 'border-brand-100 dark:border-brand-700/30',
      iconBg: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
      value: 'text-ink-900 dark:text-inkDark-900',
    },
    ok: {
      ring: 'border-ok-100 dark:border-ok-700/30',
      iconBg: 'bg-ok-50 text-ok-600 dark:bg-ok-700/15 dark:text-ok-500',
      value: 'text-ok-700 dark:text-ok-500',
    },
    err: {
      ring: 'border-err-100 dark:border-err-700/30',
      iconBg: 'bg-err-50 text-err-600 dark:bg-err-700/15 dark:text-err-500',
      value: 'text-err-700 dark:text-err-500',
    },
  } as const;
  const a = accentMap[accent];

  return (
    <div
      className={`card relative overflow-hidden p-5 ${a.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500 dark:text-inkDark-500">
            {eyebrow}
          </div>
          <div className="mt-1 text-sm font-medium text-ink-700 dark:text-inkDark-500">
            {title}
          </div>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-card ${a.iconBg}`}>
          <IconCmp size={18} strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div className={`num text-[28px] leading-tight tracking-tight ${a.value}`}>
            {value}
          </div>
        )}
        {subtitle && (
          <div className="mt-1 text-xs text-ink-500 dark:text-inkDark-500">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
