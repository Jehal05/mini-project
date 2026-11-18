// Tailwind config: HealthTwin dark medical theme colours and the Inter font.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#050B18',
          900: '#0B1A33',
        },
        primary: '#00C2FF',
        accent: '#7C5CFF',
        good: '#22C55E',
        warn: '#F59E0B',
        critical: '#EF4444',
        text: {
          DEFAULT: '#E6EDF7',
          muted: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
