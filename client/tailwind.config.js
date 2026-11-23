// Design tokens (feature: UI redesign). Colours point at CSS variables in src/ui/theme.css, so one class
// (for example bg-surface) works in light and dark, and every role gets its own accent.
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: c('paper'), surface: c('surface'), raised: c('raised'), line: c('line'),
        ink: c('ink'), muted: c('muted'),
        accent: c('accent'), 'accent-ink': c('accent-ink'),
        critical: c('critical'), 'critical-soft': c('critical-soft'),
        high: c('high'), 'high-soft': c('high-soft'),
        moderate: c('moderate'), 'moderate-soft': c('moderate-soft'),
        low: c('low'), 'low-soft': c('low-soft'),
        info: c('info'), 'info-soft': c('info-soft'), glow: c('glow'),
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        serif: ['Charter', '"Bitstream Charter"', '"Sitka Text"', 'Cambria', 'Georgia', 'ui-serif', 'serif'],
      },
      borderRadius: { ui: 'var(--radius)', 'ui-lg': 'calc(var(--radius) * 1.5)' },
      boxShadow: {
        panel: '0 1px 0 rgb(var(--line) / 0.9), 0 6px 18px -10px rgb(var(--ink) / 0.25)',
        lift: '0 10px 30px -12px rgb(var(--ink) / 0.4)',
      },
      fontSize: {
        // Type scale (rem). Titles use the serif family.
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
        lg: ['1.1875rem', { lineHeight: '1.7rem' }],
        xl: ['1.4375rem', { lineHeight: '1.9rem' }],
        '2xl': ['1.8125rem', { lineHeight: '2.2rem' }],
        '3xl': ['2.375rem', { lineHeight: '2.7rem' }],
      },
      minHeight: { touch: '2.75rem' },
      minWidth: { touch: '2.75rem' },
    },
  },
  plugins: [],
};
