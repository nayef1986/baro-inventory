import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        slate: 'rgb(var(--color-slate) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        oud: {
          DEFAULT: 'rgb(var(--color-oud) / <alpha-value>)',
          tint: 'rgb(var(--color-oud-tint) / <alpha-value>)'
        },
        brass: 'rgb(var(--color-brass) / <alpha-value>)',
        status: {
          'not-started': '#9CA3AF',
          'under-review': '#F59E0B',
          approved: '#10B981',
          'needs-revision': '#EF4444',
          'closed-missed': '#991B1B'
        }
      },
      fontFamily: {
        ar: ['var(--font-ar)', 'sans-serif'],
        en: ['var(--font-en)', 'sans-serif']
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
        base: ['1rem', { lineHeight: '1.6' }],
        lg: ['1.25rem', { lineHeight: '1.5' }],
        xl: ['1.5rem', { lineHeight: '1.4' }],
        '2xl': ['2rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        '3xl': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }]
      },
      borderRadius: {
        control: '10px',
        card: '16px',
        sheet: '22px',
        modal: '28px'
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)'
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,20,24,.04)',
        elevated: '0 8px 24px rgba(16,20,24,.06)'
      },
      backdropBlur: {
        chrome: '20px'
      }
    }
  },
  plugins: []
};

export default config;
