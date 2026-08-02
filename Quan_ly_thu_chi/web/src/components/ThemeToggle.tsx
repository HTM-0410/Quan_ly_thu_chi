import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
export function ThemeToggle() {
  const { mode, toggle } = useTheme();

  const isDark =
    mode === 'dark' ||
    (mode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const label = isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition
        hover:bg-ink-50 hover:text-ink-900
        dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span className="sr-only">{label}</span>
      {isDark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
    </button>
  );
}
