import clsx from 'clsx';
import { Icon } from './Icon';

interface AccountIconProps {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'soft' | 'solid';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'h-6 w-6', icon: 13, radius: 'rounded-md' },
  sm: { box: 'h-9 w-9', icon: 18, radius: 'rounded-card' },
  md: { box: 'h-11 w-11', icon: 22, radius: 'rounded-card' },
  lg: { box: 'h-14 w-14', icon: 28, radius: 'rounded-card' },
} as const;

export function AccountIcon({
  name,
  color,
  size = 'md',
  variant = 'soft',
  className,
}: AccountIconProps) {
  const s = SIZE_MAP[size];

  if (variant === 'solid') {
    return (
      <div
        className={clsx(
          'grid shrink-0 place-items-center text-white shadow-sm',
          s.box,
          s.radius,
          className,
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <Icon name={name} size={s.icon} strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'grid shrink-0 place-items-center ring-1 ring-inset',
        s.box,
        s.radius,
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        // Soft ring tint using the same color
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)`,
      }}
      aria-hidden="true"
    >
      <Icon name={name} size={s.icon} strokeWidth={1.75} style={{ color }} />
    </div>
  );
}
