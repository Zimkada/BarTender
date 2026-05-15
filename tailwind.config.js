/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    // Breakpoints optimisés marché Afrique de l'Ouest
    // Mobile-first: 99% utilisateurs smartphones Android Bénin
    screens: {
      'xs': '375px',   // Smartphones standards (iPhone SE, Galaxy A)
      'sm': '480px',   // Large smartphones / mode paysage
      'md': '768px',   // Tablets / desktop small
      'lg': '1024px',  // Desktop/Laptop (rare - promoteurs uniquement)
      // xl/2xl: SUPPRIMÉS (grands écrans inutiles)
    },
    extend: {
      // Échelle typographique 2026 — paires (taille, line-height + letter-spacing)
      // Hiérarchie claire : display > h1 > h2 > h3 > body > caption > micro
      // Règle : uppercase + tracking-wide réservé aux "micro" (10-11px) uniquement
      fontSize: {
        'micro':   ['0.6875rem', { lineHeight: '1rem',    letterSpacing: '0.08em',   fontWeight: '600' }], // 11px - labels uppercase
        'caption': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0',        fontWeight: '500' }], // 13px - métadonnées
        'body-sm': ['0.875rem',  { lineHeight: '1.375rem',letterSpacing: '0',        fontWeight: '400' }], // 14px
        'body':    ['0.9375rem', { lineHeight: '1.5rem',  letterSpacing: '0',        fontWeight: '400' }], // 15px - texte principal
        'h3':      ['1.125rem',  { lineHeight: '1.5rem',  letterSpacing: '-0.005em', fontWeight: '600' }], // 18px
        'h2':      ['1.375rem',  { lineHeight: '1.75rem', letterSpacing: '-0.01em',  fontWeight: '600' }], // 22px
        'h1':      ['1.75rem',   { lineHeight: '2.125rem',letterSpacing: '-0.02em',  fontWeight: '600' }], // 28px
        'display': ['2.25rem',   { lineHeight: '2.5rem',  letterSpacing: '-0.025em', fontWeight: '600' }], // 36px
      },
      // Spacing safe-area pour Android notch/gesture bar
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      // Hauteur viewport safe pour Android
      height: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },
      // Design System colors using HSL CSS variables
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
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Note: Brand colors are handled via CSS classes in index.css
        // because Tailwind compiles at build-time and can't resolve CSS variables
      },


      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Animations PWA
      keyframes: {
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
