import clsx from 'clsx';
import { Icon } from './Icon';

interface CategoryIconProps {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'h-6 w-6', icon: 14, radius: 'rounded-md' },
  sm: { box: 'h-8 w-8', icon: 16, radius: 'rounded-md' },
  md: { box: 'h-10 w-10', icon: 20, radius: 'rounded-card' },
  lg: { box: 'h-14 w-14', icon: 26, radius: 'rounded-card' },
} as const;

export function CategoryIcon({ name, color, size = 'md', className }: CategoryIconProps) {
  const s = SIZE_MAP[size];
  return (
    <div
      className={clsx(
        'grid shrink-0 place-items-center',
        s.box,
        s.radius,
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
      }}
      aria-hidden="true"
    >
      <Icon name={name} size={s.icon} strokeWidth={1.75} style={{ color }} />
    </div>
  );
}
