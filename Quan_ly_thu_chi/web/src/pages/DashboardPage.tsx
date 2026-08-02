import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { CategoryIcon } from '../components/CategoryIcon';
import { AccountIcon } from '../components/AccountIcon';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  getNetWorth,
  getTransactionsSummary,
  listAccountsWithBalances,
  listCategories,
  listTransactions,
} from '../lib/api';
import { formatDateTime, formatVND } from '../lib/format';
import type { Category, FinancialAccount, Transaction } from '../lib/types';
import {
  ACCOUNT_TYPE_LABEL,
  TRANSACTION_TYPE_LABEL,
} from '../lib/labels';

interface AccountWithBalance extends FinancialAccount {
  balance: number;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function DashboardPage() {
  useDocumentTitle('Tổng quan');
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [netWorth, setNetWorth] = useState<number>(0);
  const [monthIncome, setMonthIncome] = useState<number>(0);
  const [monthExpense, setMonthExpense] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [accs, txs, cats, nw] = await Promise.all([
        listAccountsWithBalances(),
        listTransactions({ limit: 8 }),
        listCategories(),
        getNetWorth(),
      ]);
      setAccounts(accs);
      setRecent(txs);
      setCategories(cats);
      setNetWorth(nw);

      const start = startOfMonth().toISOString().slice(0, 10);
      const end = endOfMonth().toISOString().slice(0, 10);
      const sum = await getTransactionsSummary({
        start_date: start,
        end_date: end,
      });
      setMonthIncome(Number(sum?.total_income ?? 0));
      setMonthExpense(Number(sum?.total_expense ?? 0));
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
          <Link to="/transactions" className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={16} strokeWidth={2.25} /> Giao dịch mới
          </Link>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

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
          subtitle={`Còn lại: ${formatVND(monthNet)}`}
        />
      </div>

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
                8 mục mới nhất
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
                const cat = t.category_id ? categoryById.get(t.category_id) : undefined;
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
