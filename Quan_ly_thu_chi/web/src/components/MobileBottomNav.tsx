import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  CreditCard,
  LogOut,
  Menu,
  PieChart,
  Repeat,
  Settings as SettingsIcon,
  Tag,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ThemeToggle } from './ThemeToggle';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const PRIMARY_BOTTOM_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Tổng quan', icon: Activity, end: true },
  { to: '/transactions', label: 'Giao dịch', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Tài khoản', icon: Wallet },
  { to: '/reports', label: 'Báo cáo', icon: TrendingUp },
];

export const DRAWER_SECTIONS: NavSection[] = [
  {
    title: 'Dòng tiền & Công nợ',
    items: [
      { to: '/recurring', label: 'Giao dịch định kỳ', icon: Repeat },
      { to: '/debts', label: 'Sổ công nợ', icon: CreditCard },
      { to: '/people', label: 'Người quen & Đối tác', icon: Users },
    ],
  },
  {
    title: 'Kế hoạch tài chính',
    items: [
      { to: '/budgets', label: 'Ngân sách chi tiêu', icon: PieChart },
      { to: '/goals', label: 'Mục tiêu tích lũy', icon: Target },
    ],
  },
  {
    title: 'Hệ thống & Cấu hình',
    items: [
      { to: '/categories', label: 'Danh mục thu chi', icon: Tag },
      { to: '/settings', label: 'Cài đặt tài khoản', icon: SettingsIcon },
    ],
  },
];

interface MobileBottomNavProps {
  displayName: string;
  email: string;
  initial: string;
  onSignOut: () => void;
}

export function MobileBottomNav({
  displayName,
  email,
  initial,
  onSignOut,
}: MobileBottomNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Đóng drawer khi route thay đổi
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Đóng drawer khi bấm phím Escape
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  // Kiểm tra xem trang hiện tại có phải là 1 trong các mục trong Drawer không
  const isDrawerRouteActive = DRAWER_SECTIONS.some(section =>
    section.items.some(item =>
      item.end
        ? location.pathname === item.to
        : location.pathname.startsWith(item.to),
    ),
  );

  return (
    <>
      {/* Bottom Bar ghim đáy màn hình trên mobile */}
      <nav
        aria-label="Điều hướng chính trên di động"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-ink-100 bg-surface-raised/95 px-1 py-1.5 backdrop-blur-md dark:border-ink-800 dark:bg-surface-dark-raised/95 md:hidden"
      >
        {PRIMARY_BOTTOM_NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'group flex flex-1 flex-col items-center gap-0.5 rounded-btn py-1 text-center transition',
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-ink-600 hover:text-ink-900 dark:text-inkDark-500 dark:hover:text-inkDark-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={clsx(
                    'grid h-7 w-7 place-items-center rounded-pill transition',
                    isActive && 'bg-brand-50 dark:bg-brand-500/15',
                  )}
                >
                  <item.icon size={19} strokeWidth={isActive ? 2.25 : 1.75} />
                </div>
                <span
                  className={clsx(
                    'text-[10px] leading-tight font-medium',
                    isActive ? 'font-semibold' : 'opacity-80',
                  )}
                >
                  {item.label}
                </span>
                {isActive && <span className="sr-only">(trang hiện tại)</span>}
              </>
            )}
          </NavLink>
        ))}

        {/* Nút "Thêm" mở Drawer */}
        <button
          type="button"
          onClick={() => setDrawerOpen(o => !o)}
          aria-expanded={drawerOpen}
          aria-label="Mở menu chức năng mở rộng"
          className={clsx(
            'group flex flex-1 flex-col items-center gap-0.5 rounded-btn py-1 text-center transition',
            isDrawerRouteActive || drawerOpen
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-ink-600 hover:text-ink-900 dark:text-inkDark-500 dark:hover:text-inkDark-900',
          )}
        >
          <div
            className={clsx(
              'grid h-7 w-7 place-items-center rounded-pill transition',
              (isDrawerRouteActive || drawerOpen) &&
                'bg-brand-50 dark:bg-brand-500/15',
            )}
          >
            <Menu
              size={19}
              strokeWidth={isDrawerRouteActive || drawerOpen ? 2.25 : 1.75}
            />
          </div>
          <span
            className={clsx(
              'text-[10px] leading-tight font-medium',
              isDrawerRouteActive || drawerOpen ? 'font-semibold' : 'opacity-80',
            )}
          >
            Thêm
          </span>
        </button>
      </nav>

      {/* Drawer mở rộng (Bottom Sheet) */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Danh mục chức năng mở rộng"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-ink-900/50 backdrop-blur-sm md:hidden animate-in fade-in-0 duration-200"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="flex max-h-[85vh] flex-col rounded-t-card border-t border-ink-200 bg-surface-raised shadow-2xl dark:border-ink-700 dark:bg-surface-dark-raised"
            onClick={e => e.stopPropagation()}
          >
            {/* Thanh gạt và Header */}
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white shadow-sm"
                  aria-hidden="true"
                >
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-ink-900 dark:text-inkDark-900">
                    {displayName}
                  </div>
                  <div className="truncate text-2xs text-ink-500 dark:text-inkDark-500">
                    {email}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 dark:text-inkDark-400 dark:hover:bg-ink-800"
                aria-label="Đóng menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nội dung danh sách theo cụm */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {DRAWER_SECTIONS.map(section => (
                <div key={section.title}>
                  <div className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wider text-ink-400 dark:text-inkDark-400">
                    {section.title}
                  </div>
                  <ul className="grid grid-cols-1 gap-1">
                    {section.items.map(item => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          onClick={() => setDrawerOpen(false)}
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center gap-3 rounded-card px-3 py-2.5 text-sm font-medium transition',
                              isActive
                                ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                                : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900',
                            )
                          }
                        >
                          <item.icon size={18} strokeWidth={1.75} />
                          <span className="flex-1">{item.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Chân drawer: Theme toggle + Đăng xuất */}
            <div className="border-t border-ink-100 bg-surface-sunken px-4 py-3 dark:border-ink-800 dark:bg-surface-dark-sunken flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-ink-600 dark:text-inkDark-400">
                <span>Giao diện:</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="btn-secondary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5 text-err-600 dark:text-err-400"
              >
                <LogOut size={14} strokeWidth={1.75} /> Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
