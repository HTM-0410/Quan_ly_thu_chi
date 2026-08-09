import { useEffect, useState } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, CheckCircle2, RefreshCcw } from 'lucide-react';
import { DebtFormModal } from '../components/DebtFormModal';
import { DebtDetailModal } from '../components/DebtDetailModal';
import { EmptyState, ErrorState, Skeleton } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { getDebts, getPeople, getDebtSummary } from '../lib/api';
import { formatVND } from '../lib/format';
import clsx from 'clsx';
import type { Debt, Person } from '../lib/types';
import type { DebtSummary } from '../lib/api';

type Filter = 'all' | 'lend' | 'borrow' | 'paid';

export function DebtsPage() {
  useDocumentTitle('Công nợ');
  const toast = useToast();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const [showForm, setShowForm] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [debtsData, peopleData, summaryData] = await Promise.all([
        getDebts(),
        getPeople(),
        getDebtSummary(),
      ]);

      const peopleMap = new Map(peopleData.map(p => [p.id, p]));
      setDebts(debtsData);
      setPeople(peopleMap);
      setSummary(summaryData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function handleDebtsUpdated() {
      load();
    }
    window.addEventListener('debts-updated', handleDebtsUpdated);
    return () => window.removeEventListener('debts-updated', handleDebtsUpdated);
  }, []);

  const filteredDebts = debts.filter(d => {
    switch (filter) {
      case 'lend': return d.type === 'lend' && d.status === 'active';
      case 'borrow': return d.type === 'borrow' && d.status === 'active';
      case 'paid': return d.status === 'paid';
      default: return true;
    }
  });

  const activeDebts = filteredDebts.filter(d => d.status === 'active');
  const paidDebts = filteredDebts.filter(d => d.status === 'paid');

  function getPersonName(personId: string | null | undefined) {
    if (!personId) return 'Không xác định';
    return people.get(personId)?.name ?? 'Không xác định';
  }

  function openDetail(debt: Debt) {
    setSelectedDebt(debt);
    setShowDetail(true);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            {summary ? `${summary.activeLendCount + summary.activeBorrowCount} khoản nợ đang hoạt động` : 'Đang tải...'}
          </div>
          <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
            Công nợ
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
            Theo dõi các khoản cho vay và đi vay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới danh sách"
          >
            {loading ? <Spinner size="sm" /> : <RefreshCcw size={14} strokeWidth={1.75} />}
            Làm mới
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={16} strokeWidth={2.25} /> Thêm khoản nợ
          </button>
        </div>
      </header>

      {err && <ErrorState message={err} onRetry={load} />}

      {!err && summary && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-card border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-500/10">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <ArrowUpRight size={20} />
                <span className="font-medium">Đang cho vay</span>
              </div>
              <div className="num mt-2 text-2xl font-semibold text-green-800 dark:text-green-300">
                {formatVND(summary.totalLending)}
              </div>
              <div className="text-sm text-green-600 dark:text-green-500">
                {summary.activeLendCount} khoản
              </div>
            </div>

            <div className="rounded-card border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-500/10">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <ArrowDownRight size={20} />
                <span className="font-medium">Đang vay</span>
              </div>
              <div className="num mt-2 text-2xl font-semibold text-orange-800 dark:text-orange-300">
                {formatVND(summary.totalBorrowing)}
              </div>
              <div className="text-sm text-orange-600 dark:text-orange-500">
                {summary.activeBorrowCount} khoản
              </div>
            </div>
          </div>

          <div className="flex gap-1 rounded-card bg-ink-100 p-1 dark:bg-ink-800">
            {([
              ['all', 'Tất cả'],
              ['lend', 'Cho vay'],
              ['borrow', 'Đang vay'],
              ['paid', 'Đã trả xong'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={clsx(
                  'flex-1 rounded-btn py-1.5 text-sm font-medium transition',
                  filter === value
                    ? 'bg-surface shadow-sm text-ink-900 dark:bg-surface-dark dark:text-inkDark-900'
                    : 'text-ink-600 hover:text-ink-900 dark:text-inkDark-500 dark:hover:text-inkDark-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {activeDebts.length === 0 && paidDebts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={20} strokeWidth={1.5} />}
              title="Không có khoản nợ nào"
              description="Thêm khoản cho vay hoặc đi vay để theo dõi công nợ."
              action={
                <button onClick={() => setShowForm(true)} className="btn-primary mt-2">
                  <Plus size={16} strokeWidth={2.25} /> Thêm khoản nợ
                </button>
              }
            />
          ) : (
            <div className="space-y-6">
              {activeDebts.length > 0 && (
                <div className="space-y-2">
                  {activeDebts.map(debt => {
                    const personName = getPersonName(debt.person_id);
                    const paid = debt.original_amount - debt.remaining_amount;
                    const progress = debt.original_amount > 0
                      ? Math.round((paid / debt.original_amount) * 100)
                      : 0;

                    return (
                      <div
                        key={debt.id}
                        onClick={() => openDetail(debt)}
                        className="cursor-pointer rounded-card border border-ink-100 bg-surface p-4 transition hover:border-brand-200 hover:shadow-sm dark:border-ink-800 dark:bg-surface-dark dark:hover:border-brand-800"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              'flex h-10 w-10 items-center justify-center rounded-full',
                              debt.type === 'lend'
                                ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400'
                                : 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400'
                            )}>
                              {debt.type === 'lend'
                                ? <ArrowUpRight size={20} />
                                : <ArrowDownRight size={20} />
                              }
                            </div>
                            <div>
                              <div className="font-medium">{personName}</div>
                              <div className="text-sm text-ink-500 dark:text-inkDark-500">
                                {debt.type === 'lend' ? 'Còn phải thu' : 'Còn nợ'}:{' '}
                                <span className={debt.type === 'lend' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}>
                                  {formatVND(debt.remaining_amount)}
                                </span>
                                {' / '}
                                {formatVND(debt.original_amount)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                                <div
                                  className={clsx(
                                    'h-full rounded-full transition-all',
                                    debt.type === 'lend' ? 'bg-green-500' : 'bg-orange-500'
                                  )}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs text-ink-400 dark:text-inkDark-400">{progress}%</span>
                          </div>
                        </div>

                        {debt.notes && (
                          <div className="mt-2 text-sm text-ink-400 dark:text-inkDark-400">
                            {debt.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {filter === 'all' && paidDebts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-ink-500 dark:text-inkDark-500">
                    Đã trả xong ({paidDebts.length})
                  </h3>
                  {paidDebts.map(debt => (
                    <div
                      key={debt.id}
                      onClick={() => openDetail(debt)}
                      className="cursor-pointer rounded-card border border-ink-100 bg-ink-50 p-4 opacity-60 transition hover:opacity-80 dark:border-ink-800 dark:bg-ink-800"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={20} className="text-green-500" />
                        <div>
                          <div className="font-medium">{getPersonName(debt.person_id)}</div>
                          <div className="text-sm text-ink-500 dark:text-inkDark-500">
                            {debt.type === 'lend' ? 'Đã thu đủ' : 'Đã trả đủ'}: {formatVND(debt.original_amount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <DebtFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={load}
      />

      <DebtDetailModal
        open={showDetail}
        onClose={() => {
          setShowDetail(false);
          setSelectedDebt(null);
        }}
        onSuccess={() => {
          load();
          setShowDetail(false);
          setSelectedDebt(null);
        }}
        debt={selectedDebt}
      />
    </div>
  );
}
