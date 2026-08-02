import { useEffect } from 'react';
import { APP_NAME } from './config';

const SUFFIX = ` · ${APP_NAME}`;

/**
 * Đặt document.title cho mỗi page. Khôi phục title cũ khi unmount.
 *
 * @example useDocumentTitle('Tài khoản'); // → "Tài khoản · Quản lý thu chi"
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title}${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}