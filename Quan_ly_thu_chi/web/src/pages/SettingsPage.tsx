import { useEffect, useState } from 'react';
import { Monitor, Moon, Save, Sun, User as UserIcon } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { FormField } from '../components/FormField';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import { updateProfile } from '../lib/api';

const CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'SGD', 'THB'];
const TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Sáng', icon: Sun },
  { id: 'dark', label: 'Tối', icon: Moon },
  { id: 'system', label: 'Hệ thống', icon: Monitor },
];

export function SettingsPage() {
  useDocumentTitle('Cài đặt');
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const { mode, setMode } = useTheme();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [currency, setCurrency] = useState(profile?.base_currency ?? 'VND');
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Asia/Ho_Chi_Minh');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setCurrency(profile?.base_currency ?? 'VND');
    setTimezone(profile?.timezone ?? 'Asia/Ho_Chi_Minh');
  }, [profile]);

  async function save() {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.push('error', 'Vui lòng nhập tên hiển thị.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user.id, {
        display_name: trimmed,
        base_currency: currency,
        timezone,
        onboarding_completed: true,
      });
      await refreshProfile();
      toast.push('success', 'Đã lưu cài đặt');
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
          Tài khoản
        </div>
        <h1 className="h-display mt-1 text-3xl font-semibold tracking-tight text-ink-900 dark:text-inkDark-900">
          Cài đặt
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-inkDark-500">
          Thông tin cá nhân và tùy chọn giao diện.
        </p>
      </header>

      <section className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div className="grid h-9 w-9 place-items-center rounded-card bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <UserIcon size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
              Thông tin cá nhân
            </h2>
            <p className="text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
              Hồ sơ và tùy chọn khu vực
            </p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <FormField label="Email">
            <input
              className="input cursor-not-allowed bg-ink-50 dark:bg-ink-800/50"
              value={user?.email ?? ''}
              disabled
              readOnly
            />
          </FormField>
          <FormField label="Tên hiển thị" required>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tên của bạn"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tiền tệ">
              <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Múi giờ">
              <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary inline-flex items-center gap-2"
              onClick={save}
              disabled={saving}
            >
              {saving ? <Spinner size="sm" /> : <Save size={16} strokeWidth={1.75} />}
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div className="grid h-9 w-9 place-items-center rounded-card bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <Sun size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="h-display text-base font-semibold text-ink-900 dark:text-inkDark-900">
              Giao diện
            </h2>
            <p className="text-2xs uppercase tracking-[0.14em] text-ink-400 dark:text-inkDark-400">
              Chủ đề sáng / tối
            </p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div role="radiogroup" aria-label="Chọn chủ đề" className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={mode === opt.id}
                onClick={() => setMode(opt.id)}
                className={clsx(
                  'flex flex-col items-center justify-center gap-1.5 rounded-card border px-3 py-3 text-sm font-medium transition',
                  mode === opt.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'border-ink-200 bg-surface-raised text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-surface-dark-raised dark:text-inkDark-500 dark:hover:border-ink-700',
                )}
              >
                <opt.icon size={18} strokeWidth={1.75} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-500 dark:text-inkDark-500">
            Chế độ <strong>Hệ thống</strong> sẽ tự theo cài đặt của thiết bị.
          </p>
        </div>
      </section>
    </div>
  );
}
