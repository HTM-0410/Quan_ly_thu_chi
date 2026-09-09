import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Logo } from '../components/Logo';

export function LoginPage() {
  useDocumentTitle('Đăng nhập');
  const { session, signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: Location; justSignedUpEmail?: string } };
  const justSignedUpEmail = loc.state?.justSignedUpEmail;
  const [email, setEmail] = useState<string>(() => justSignedUpEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (session) {
    const target = (loc.state?.from as unknown as { pathname?: string })?.pathname ?? '/dashboard';
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      setErr(error);
      return;
    }
    const target = (loc.state?.from as unknown as { pathname?: string })?.pathname ?? '/dashboard';
    nav(target, { replace: true });
  }

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-surface-sunken via-surface to-brand-50/40 px-4 py-12 dark:from-surface-dark-sunken dark:via-surface-dark dark:to-brand-900/20">
      <div className="w-full max-w-md">
        {/* Brand mark above card */}
        <div className="mb-6 flex justify-center">
          <Logo size={44} />
        </div>

        <div className="card overflow-hidden">
          {/* Header band */}
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-brand-700 px-6 py-6 text-white">
            <div
              aria-hidden="true"
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl"
            />
            <h1 className="h-display text-xl font-semibold">Chào mừng trở lại</h1>
            <p className="mt-1 text-sm text-white/85">
              Đăng nhập để xem báo cáo thu chi mới nhất.
            </p>
          </div>

          <form className="space-y-4 px-6 py-6" onSubmit={handleSubmit}>
            {justSignedUpEmail && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2 rounded-card border border-ok-100 bg-ok-50 px-3 py-2 text-sm text-ok-700 dark:border-ok-700/40 dark:bg-ok-700/15 dark:text-ok-500"
              >
                <Sparkles size={16} className="mt-0.5 shrink-0" />
                <span>Đăng ký thành công. Nếu đã xác nhận email, hãy đăng nhập bên dưới.</span>
              </div>
            )}

            <div>
              <label className="label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="login-password">Mật khẩu</label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {err && (
              <div
                role="alert"
                className="rounded-card border border-err-100 bg-err-50 px-3 py-2 text-sm text-err-700 dark:border-err-700/40 dark:bg-err-700/15 dark:text-err-500"
              >
                {err}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? 'Đang đăng nhập…' : (
                <>
                  Đăng nhập <ArrowRight size={16} strokeWidth={2} />
                </>
              )}
            </button>

            <div className="text-center text-sm text-ink-600 dark:text-inkDark-500">
              Chưa có tài khoản?{' '}
              <Link to="/signup" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                Đăng ký
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
