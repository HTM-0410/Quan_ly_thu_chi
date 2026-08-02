import clsx from 'clsx';

interface LogoMarkProps {
  /** Pixel size of the square tile. Default 36. */
  size?: number;
  className?: string;
}

/**
 * Brand mark — a rounded square with a warm gradient and a stylized
 * "ledger + balance dot" glyph. Dùng cho sidebar, login/signup, favicon.
 *
 * SVG được inline để:
 *  - đổi màu dễ theo dark mode bằng CSS currentColor
 *  - render sắc nét ở mọi kích thước
 */
export function LogoMark({ size = 36, className }: LogoMarkProps) {
  return (
    <span
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-card text-white shadow-pop',
        'bg-[radial-gradient(circle_at_30%_25%,theme(colors.brand.300)_0%,theme(colors.brand.500)_45%,theme(colors.brand.800)_100%)]',
        'ring-1 ring-inset ring-white/15',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* "Ledger card": ba đường ngang + một chấm cân bằng */}
        <path d="M8 11.5h13" opacity="0.9" />
        <path d="M8 16   h11" opacity="0.7" />
        <path d="M8 20.5h13" opacity="0.9" />
        {/* coin dot */}
        <circle cx="22.5" cy="16" r="1.6" fill="currentColor" stroke="none" opacity="0.95" />
      </svg>
    </span>
  );
}

interface LogoProps {
  size?: number;
  /** Show "Personal Finance" tagline below the wordmark */
  tagline?: boolean;
  className?: string;
}

/**
 * Logo đầy đủ — mark + wordmark. Dùng Fraunces cho phần tiêu đề, JetBrains Mono
 * fallback nhẹ cho hàng chữ. Accent chữ "Lý" được in nghiêng serif để có chất riêng.
 */
export function Logo({ size = 36, tagline = true, className }: LogoProps) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <div className="leading-tight">
        <div
          className="font-display font-semibold text-ink-900 dark:text-inkDark-900"
          style={{ fontSize: Math.round(size * 0.42), letterSpacing: '-0.01em' }}
        >
          Quản <span className="italic">Lý</span> Thu Chi
        </div>
        {tagline && (
          <div
            className="font-semibold uppercase tracking-[0.18em] text-ink-500 dark:text-inkDark-500"
            style={{ fontSize: Math.round(size * 0.22) }}
          >
            Personal Finance
          </div>
        )}
      </div>
    </div>
  );
}
