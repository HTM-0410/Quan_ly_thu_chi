/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Editorial warm ink palette (replaces slate)
        ink: {
          50: '#f7f4ed',
          100: '#ece6d8',
          200: '#d8cfba',
          300: '#b8ac90',
          400: '#8e8268',
          500: '#65594a',
          600: '#433a2f',
          700: '#2b251d',
          800: '#1f1a14',
          900: '#15110d',
        },
        // Warm "paper" surfaces
        surface: {
          DEFAULT: '#faf7f2',
          raised: '#ffffff',
          sunken: '#f4f1ea',
          dark: '#15110d',
          'dark-raised': '#1f1a14',
          'dark-sunken': '#0d0a07',
        },
        // Dark-mode ink scale (must be flat at the colors.* level for Tailwind)
        inkDark: {
          50: '#1f1a14',
          100: '#2a241c',
          200: '#3a3127',
          300: '#4a4034',
          400: '#6a5e4e',
          500: '#8b7d6b',
          600: '#b9aa92',
          700: '#d6c9b3',
          800: '#e6dac6',
          900: '#f4ede0',
        },
        // Primary accent: deep terracotta — singular brand voice
        brand: {
          50: '#fbf2ec',
          100: '#f3dccf',
          200: '#e6b89f',
          300: '#d39272',
          400: '#c26f48',
          500: '#b8451f',
          600: '#9a3618',
          700: '#7a2c13',
          800: '#5a2010',
          900: '#3d160b',
        },
        // Semantic
        ok: {
          50: '#ecfdf3',
          100: '#d1fadf',
          500: '#15803d',
          600: '#126b32',
          700: '#0e5427',
        },
        err: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#b91c1c',
          600: '#991b1b',
          700: '#7f1d1d',
        },
        warn: {
          50: '#fef7ee',
          100: '#fde7c8',
          500: '#c2691a',
          600: '#9c5314',
        },
        // Backwards-compatible brand-500 used by old buttons
      },
      fontFamily: {
        sans: ['"Noto Sans"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
      },
      borderRadius: {
        card: '14px',
        btn: '8px',
        pill: '999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(26,22,18,0.04), 0 1px 1px rgba(26,22,18,0.03)',
        card:
          '0 1px 0 rgba(26,22,18,0.04), 0 1px 2px rgba(26,22,18,0.04), 0 4px 16px rgba(26,22,18,0.06)',
        pop: '0 8px 24px rgba(26,22,18,0.08), 0 2px 4px rgba(26,22,18,0.04)',
        ring: '0 0 0 4px rgba(184,69,31,0.12)',
      },
    },
  },
  plugins: [],
};
