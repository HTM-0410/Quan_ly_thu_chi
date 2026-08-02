import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  LogOut,
  PieChart,
  Repeat,
  Settings as SettingsIcon,
  Tag,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { IS_USING_FALLBACK } from '../lib/config';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Tổng quan', icon: Activity, end: true },
  { to: '/transactions', label: 'Giao dịch', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Tài khoản', icon: Wallet },
  { to: '/categories', label: 'Danh mục', icon: Tag },
  { to: '/budgets', label: 'Ngân sách', icon: PieChart },
  { to: '/goals', label: 'Mục tiêu', icon: Target },
  { to: '/recurring', label: 'Định kỳ', icon: Repeat },
  { to: '/reports', label: 'Báo cáo', icon: TrendingUp },
  { to: '/settings', label: 'Cài đặt', icon: SettingsIcon },
];

function BrandLogo() {
  return <Logo size={36} />;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(item => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={clsx(
                    'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <item.icon size={18} strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {isActive && <span className="sr-only">(trang hiện tại)</span>}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function AppLayout() {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const [fallbackDismissed, setFallbackDismissed] = useState(false);

  async function handleSignOut() {
    await signOut();
    nav('/login', { replace: true });
  }

  const displayName = profile?.display_name?.trim() || user?.email || 'Bạn';
  const initial = (displayName[0] ?? '?').toUpperCase();
  const email = user?.email ?? '';

  return (
    <div className="flex h-full bg-surface text-ink-900 dark:bg-surface-dark dark:text-inkDark-900">
      {IS_USING_FALLBACK && !fallbackDismissed && (
        <div
          role="status"
          className="fixed left-1/2 top-3 z-50 -translate-x-1/2 max-w-md rounded-card border border-warn-100 bg-warn-50 px-3 py-2 text-xs text-warn-600 shadow-pop dark:border-warn-500/40 dark:bg-warn-500/15 dark:text-warn-500"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden="true">⚠️</span>
            <div className="flex-1">
              <strong>Đang dùng cấu hình demo.</strong> Tạo <code>web/.env.local</code> từ{' '}
              <code>web/.env.example</code> và restart dev server để dùng Supabase riêng.
            </div>
            <button
              type="button"
              aria-label="Đóng cảnh báo"
              className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setFallbackDismissed(true)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-surface-raised dark:border-ink-800 dark:bg-surface-dark-raised md:flex">
        <div className="border-b border-ink-100 px-5 py-5 dark:border-ink-800">
          <BrandLogo />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng chính">
          <div className="px-2 pb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-ink-400 dark:text-inkDark-400">
            Làm việc
          </div>
          <NavList />
        </nav>

        <div className="border-t border-ink-100 px-3 py-3 dark:border-ink-800">
          <div className="flex items-center gap-2.5 rounded-card p-2">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white shadow-sm"
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-900 dark:text-inkDark-900">
                {displayName}
              </div>
              <div className="truncate text-xs text-ink-500 dark:text-inkDark-500">{email}</div>
            </div>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 bg-surface-raised px-4 py-3 dark:border-ink-800 dark:bg-surface-dark-raised md:hidden">
          <BrandLogo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="btn-secondary text-xs"
              aria-label="Đăng xuất"
            >
              <LogOut size={14} strokeWidth={1.75} /> Đăng xuất
            </button>
          </div>
        </header>

        {/* Mobile horizontal nav */}
        <div className="border-b border-ink-100 bg-surface-raised dark:border-ink-800 dark:bg-surface-dark-raised md:hidden">
          <nav
            className="flex gap-0.5 overflow-x-auto px-2 py-2"
            aria-label="Điều hướng chính"
          >
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex shrink-0 flex-col items-center gap-1 rounded-btn px-3 py-1.5 text-2xs font-medium transition',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={18} strokeWidth={1.75} />
                    <span className="whitespace-nowrap">{item.label}</span>
                    {isActive && <span className="sr-only">(trang hiện tại)</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
