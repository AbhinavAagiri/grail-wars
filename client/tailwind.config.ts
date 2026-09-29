import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-deep': 'var(--bg-deep)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        gold: 'var(--gold)',
        'gold-bright': 'var(--gold-bright)',
        'gold-dark': 'var(--gold-dark)',
        'banner-tan': 'var(--banner-tan)',
        'banner-ink': 'var(--banner-ink)',
        crimson: 'var(--crimson)',
        ink: 'var(--text)',
        muted: 'var(--muted)',
        success: 'var(--success)',
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        body: ['Lato', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        glow: '0 0 0 1px var(--gold-dark), 0 8px 30px rgba(201,164,92,.12)',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
} satisfies Config;
