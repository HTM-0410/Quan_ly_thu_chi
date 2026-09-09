import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Logo } from '../components/Logo';

export function ForgotPasswordPage() {
  useDocumentTitle('Quên mật khẩu');
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setErr('Vui lòng nhập email hợp lệ.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { error } = await resetPassword(mail);
    setSubmitting(false);
    if (error) {
      setErr(error);
      return;
    }
    setSentEmail(mail);
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
            <h1 className="h-display text-xl font-semibold">Khôi phục mật khẩu</h1>
            <p className="mt-1 text-sm text-white/85">
              Nhập email để nhận hướng dẫn đặt lại mật khẩu của bạn.
            </p>
          </div>

          <div className="space-y-4 px-6 py-6">
            {sentEmail ? (
              <div
                role="status"
                aria-live="polite"
                className="space-y-3 rounded-card border border-ok-100 bg-ok-50 px-4 py-3 text-sm text-ok-700 dark:border-ok-700/40 dark:bg-ok-700/15 dark:text-ok-500"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={16} /> Đã gửi email khôi phục!
                </div>
                <p>
                  Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến{' '}
                  <span className="font-semibold">{sentEmail}</span>. Vui lòng kiểm tra hộp thư (kể cả thư mục spam).
                </p>
                <div className="pt-2">
                  <Link
                    to="/login"
                    className="btn-primary inline-flex w-full items-center justify-center gap-2 !py-2 text-sm"
                  >
                    <ArrowLeft size={16} /> Quay lại Đăng nhập
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label className="label" htmlFor="forgot-email">
                    Email tài khoản
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="forgot-email"
                      type="email"
                      className="input pl-9"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value);
                        if (err) setErr(null);
                      }}
                      placeholder="you@example.com"
                      required
                      autoFocus
                    />
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-inkDark-400"
                    />
                  </div>
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
                  {submitting ? 'Đang gửi…' : (
                    <>
                      Gửi liên kết đặt lại mật khẩu <ArrowRight size={16} strokeWidth={2} />
                    </>
                  )}
                </button>

                <div className="text-center text-sm text-ink-600 dark:text-inkDark-500">
                  Nhớ mật khẩu rồi?{' '}
                  <Link
                    to="/login"
                    className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Đăng nhập ngay
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
