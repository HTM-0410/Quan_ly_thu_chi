import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Logo } from '../components/Logo';

const REDIRECT_DELAY_MS = 4000;

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  if (!/[A-Za-z]/.test(pw)) return 'Mật khẩu phải có ít nhất 1 chữ cái.';
  if (!/[0-9]/.test(pw)) return 'Mật khẩu phải có ít nhất 1 chữ số.';
  return null;
}

export function SignupPage() {
  useDocumentTitle('Đăng ký');
  const { session, signUp } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: Location } };

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(REDIRECT_DELAY_MS / 1000);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!successEmail) return;
    if (countdown <= 0) {
      nav('/login', { replace: true, state: { justSignedUpEmail: successEmail } });
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [successEmail, countdown, nav]);

  if (session) {
    const target = (loc.state?.from as unknown as { pathname?: string })?.pathname ?? '/dashboard';
    return <Navigate to={target} replace />;
  }

  function goToLoginNow() {
    if (!successEmail) return;
    nav('/login', { replace: true, state: { justSignedUpEmail: successEmail } });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccessEmail(null);
    setCountdown(REDIRECT_DELAY_MS / 1000);

    const name = fullName.trim();
    const mail = email.trim();
    if (!name) {
      setErr('Vui lòng nhập họ tên.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setErr('Email không hợp lệ.');
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setErr(pwErr);
      return;
    }
    if (password !== confirm) {
      setErr('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSubmitting(true);
    const { error, needsEmailConfirm } = await signUp(mail, password, name);
    setSubmitting(false);

    if (error) {
      setErr(error);
      return;
    }

    if (needsEmailConfirm) {
      setSuccessEmail(mail);
      return;
    }

    const target = (loc.state?.from as unknown as { pathname?: string })?.pathname ?? '/dashboard';
    nav(target, { replace: true });
  }

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-surface-sunken via-surface to-brand-50/40 px-4 py-12 dark:from-surface-dark-sunken dark:via-surface-dark dark:to-brand-900/20">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size={44} />
        </div>

        <div className="card overflow-hidden">
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-brand-700 px-6 py-6 text-white">
            <div
              aria-hidden="true"
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl"
            />
            <h1 className="h-display text-xl font-semibold">Tạo tài khoản mới</h1>
            <p className="mt-1 text-sm text-white/85">
              Bắt đầu theo dõi thu chi cá nhân chỉ trong vài phút.
            </p>
          </div>

          <form className="space-y-4 px-6 py-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="label" htmlFor="signup-name">Họ tên</label>
              <input
                id="signup-name"
                type="text"
                className="input"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Nguyễn Văn A"
              />
            </div>

            <div>
              <label className="label" htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
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
              <label className="label" htmlFor="signup-password">Mật khẩu</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPw ? 'text' : 'password'}
                  className="input pr-12"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-describedby="signup-password-hint"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 dark:text-inkDark-500 dark:hover:bg-ink-800 dark:hover:text-inkDark-900"
                  onClick={() => setShowPw(s => !s)}
                  aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p id="signup-password-hint" className="mt-1.5 text-xs text-ink-500 dark:text-inkDark-500">
                Tối thiểu 8 ký tự, có ít nhất 1 chữ cái và 1 chữ số.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="signup-confirm">Xác nhận mật khẩu</label>
              <input
                id="signup-confirm"
                type={showPw ? 'text' : 'password'}
                className="input"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
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
              disabled={submitting || successEmail !== null}
            >
              {submitting ? 'Đang tạo tài khoản…' : (
                <>
                  Tạo tài khoản <ArrowRight size={16} strokeWidth={2} />
                </>
              )}
            </button>

            {successEmail ? (
              <div
                role="status"
                aria-live="polite"
                className="space-y-3 rounded-card border border-ok-100 bg-ok-50 px-4 py-3 text-sm text-ok-700 dark:border-ok-700/40 dark:bg-ok-700/15 dark:text-ok-500"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={16} /> Đăng ký thành công!
                </div>
                <p>
                  Chúng tôi đã gửi email xác nhận đến{' '}
                  <span className="font-semibold">{successEmail}</span>. Vui lòng kiểm tra hộp thư
                  (kể cả thư mục spam) và click link xác nhận để kích hoạt tài khoản.
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs">
                    Tự chuyển sang trang đăng nhập sau{' '}
                    <span className="font-semibold tabular-nums">{countdown}s</span>…
                  </span>
                  <button
                    type="button"
                    onClick={goToLoginNow}
                    className="btn-primary !px-3 !py-1 !text-xs"
                  >
                    Đi ngay
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-ink-600 dark:text-inkDark-500">
                Đã có tài khoản?{' '}
                <Link to="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Đăng nhập
                </Link>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
