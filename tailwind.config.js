/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
        // 🎨 Brand Color System - Couleur personnalisable
        brand: {
          DEFAULT: 'hsl(var(--brand-hue) var(--brand-saturation) var(--brand-light))',
          dark: 'hsl(var(--brand-hue) var(--brand-saturation) var(--brand-dark))',
          light: 'hsl(var(--brand-hue) var(--brand-saturation) 95%)',
          muted: 'hsl(var(--brand-hue) var(--brand-saturation) 85%)',
          foreground: 'hsl(0 0% 100%)',
          ring: 'hsl(var(--brand-hue) var(--brand-saturation) 50%)',
          border: 'hsl(var(--brand-hue) var(--brand-saturation) 80%)',
          50: 'hsl(var(--brand-hue) var(--brand-saturation) 97%)',
          100: 'hsl(var(--brand-hue) var(--brand-saturation) 92%)',
          200: 'hsl(var(--brand-hue) var(--brand-saturation) 80%)',
          300: 'hsl(var(--brand-hue) var(--brand-saturation) 70%)',
          400: 'hsl(var(--brand-hue) var(--brand-saturation) 60%)',
          500: 'hsl(var(--brand-hue) var(--brand-saturation) var(--brand-light))',
          600: 'hsl(var(--brand-hue) var(--brand-saturation) 48%)',
          700: 'hsl(var(--brand-hue) var(--brand-saturation) var(--brand-dark))',
          800: 'hsl(var(--brand-hue) var(--brand-saturation) 30%)',
          900: 'hsl(var(--brand-hue) var(--brand-saturation) 20%)',
        },
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
