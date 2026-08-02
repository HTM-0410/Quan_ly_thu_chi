import { Component, type ErrorInfo, type ReactNode } from 'react';
import { APP_NAME } from './config';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Bắt mọi render error ở cây con, hiển thị fallback UI an toàn thay vì
 * crash trắng trang. Log error ra console để dev debug.
 *
 * Production nên hook thêm Sentry.captureException() ở componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[${APP_NAME}] Unhandled UI error`, error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center bg-slate-50 p-6"
      >
        <div className="card max-w-md w-full text-center space-y-4">
          <div className="text-5xl" aria-hidden>
            ⚠️
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Đã xảy ra lỗi không mong muốn</h1>
          <p className="text-sm text-slate-600">
            {APP_NAME} gặp sự cố khi hiển thị trang này. Bạn có thể thử lại hoặc tải lại toàn bộ ứng
            dụng.
          </p>
          {this.state.error && (
            <pre className="text-left text-xs bg-slate-100 border border-slate-200 rounded p-3 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex justify-center gap-2">
            <button type="button" className="btn" onClick={this.reset}>
              Thử lại
            </button>
            <button type="button" className="btn btn-primary" onClick={this.reload}>
              Tải lại trang
            </button>
          </div>
        </div>
      </div>
    );
  }
}