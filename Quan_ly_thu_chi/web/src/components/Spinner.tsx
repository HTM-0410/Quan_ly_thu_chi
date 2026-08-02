import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Override color (e.g. white inside a primary button). */
  tone?: 'current' | 'brand';
}

const SIZE_PX = { sm: 14, md: 18, lg: 24 };

export function Spinner({ size = 'md', className, tone = 'current' }: SpinnerProps) {
  const px = SIZE_PX[size];
  return (
    <Loader2
      role="status"
      aria-label="Đang tải"
      size={px}
      strokeWidth={2.25}
      className={clsx(
        'animate-spin',
        tone === 'brand' ? 'text-brand-500' : 'text-current',
        className,
      )}
    />
  );
}
