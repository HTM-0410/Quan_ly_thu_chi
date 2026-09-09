import clsx from 'clsx';

interface LogoMarkProps {
  /** Pixel size of the square tile. Default 36. */
  size?: number;
  className?: string;
}

/**
 * Brand mark — Biểu tượng Dòng tiền Cân bằng (Thu & Chi):
 *  - Cung uốn lượn trắng hướng lên (Thu - Inflow / Growth).
 *  - Cung uốn lượn vàng kim hoàng kim (Chi - Outflow / Wealth Preservation).
 *  - Đồng xu tài lộc ở tâm điểm (Financial Equilibrium & Prosperity).
 *
 * SVG vector tự nhiên, sắc nét ở mọi kích cỡ (16px, 36px, 44px, 64px+).
 */
export function LogoMark({ size = 36, className }: LogoMarkProps) {
  return (
    <span
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-card text-white shadow-pop transition-transform duration-200 hover:scale-105',
        'bg-[linear-gradient(135deg,theme(colors.brand.500)_0%,theme(colors.brand.600)_55%,theme(colors.brand.800)_100%)]',
        'ring-1 ring-inset ring-white/20 dark:ring-white/15',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 36"
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoGold" x1="8" y1="8" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef08a" />
            <stop offset="0.5" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
        </defs>

        {/* Thu Arc (Inflow - Vòng cung đón dòng tiền vào) */}
        <path
          d="M10 18C10 13.58 13.58 10 18 10C21.5 10 24.5 12.2 25.5 15.5"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M22.5 15.5H26V12"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Chi Arc (Outflow - Vòng cung cân đối chi tiêu bằng sắc vàng kim) */}
        <path
          d="M26 18C26 22.42 22.42 26 18 26C14.5 26 11.5 23.8 10.5 20.5"
          stroke="url(#logoGold)"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M13.5 20.5H10V24"
          stroke="url(#logoGold)"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Đồng xu tâm điểm: Tròn ngoài, lõi vuông phong thủy */}
        <circle cx="18" cy="18" r="3.2" fill="white" />
        <rect x="16.6" y="16.6" width="2.8" height="2.8" rx="0.5" fill="#9a3412" />
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
 * Logo đầy đủ — Brand mark + Wordmark "Quản Lý Thu Chi".
 * Typography được thiết kế đồng nhất, vững chãi, không bị xiên lệch hay lỗi font.
 * Cụm "Thu Chi" được nhấn mạnh màu terracotta làm điểm nhấn thương hiệu.
 */
export function Logo({ size = 36, tagline = true, className }: LogoProps) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <div className="leading-tight">
        <div
          className="font-display font-bold tracking-tight text-ink-900 dark:text-inkDark-900"
          style={{ fontSize: Math.round(size * 0.44) }}
        >
          <span>Quản Lý</span>{' '}
          <span className="text-brand-600 dark:text-brand-400">Thu Chi</span>
        </div>
        {tagline && (
          <div
            className="font-semibold uppercase tracking-[0.18em] text-ink-500 dark:text-inkDark-400"
            style={{ fontSize: Math.round(size * 0.22) }}
          >
            Personal Finance
          </div>
        )}
      </div>
    </div>
  );
}
