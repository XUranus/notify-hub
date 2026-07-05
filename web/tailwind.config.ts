import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /* ── Material You extended tokens ── */
        'surface-variant': 'hsl(var(--surface-variant))',
        'on-surface-variant': 'hsl(var(--on-surface-variant))',
        outline: {
          DEFAULT: 'hsl(var(--outline))',
          variant: 'hsl(var(--outline-variant))',
        },
        'primary-container': {
          DEFAULT: 'hsl(var(--primary-container))',
          foreground: 'hsl(var(--on-primary-container))',
        },
        'secondary-container': {
          DEFAULT: 'hsl(var(--secondary-container))',
          foreground: 'hsl(var(--on-secondary-container))',
        },
        tertiary: {
          DEFAULT: 'hsl(var(--tertiary))',
          foreground: 'hsl(var(--tertiary-foreground))',
          container: 'hsl(var(--tertiary-container))',
          'container-foreground': 'hsl(var(--on-tertiary-container))',
        },
        'error-container': {
          DEFAULT: 'hsl(var(--error-container))',
          foreground: 'hsl(var(--on-error-container))',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          variant: 'hsl(var(--surface-variant))',
        },
        'inverse-surface': {
          DEFAULT: 'hsl(var(--inverse-surface))',
          foreground: 'hsl(var(--inverse-foreground))',
          primary: 'hsl(var(--inverse-primary))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'md3': '0 1px 3px 1px hsl(var(--shadow) / 0.15), 0 1px 2px 0 hsl(var(--shadow) / 0.3)',
        'md3-lg': '0 4px 8px 3px hsl(var(--shadow) / 0.15), 0 1px 3px 0 hsl(var(--shadow) / 0.3)',
        'md3-xl': '0 8px 12px 6px hsl(var(--shadow) / 0.15), 0 4px 4px 0 hsl(var(--shadow) / 0.3)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
