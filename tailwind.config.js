/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // Breakpoints optimisés marché Afrique de l'Ouest
    // Mobile-first: 99% utilisateurs smartphones Android Bénin
    screens: {
      'xs': '375px',   // Smartphones standards (iPhone SE, Galaxy A)
      'sm': '480px',   // Large smartphones / mode paysage
      'lg': '1024px',  // Desktop/Laptop (rare - promoteurs uniquement)
      // md: SUPPRIMÉ (tablettes inutiles contexte Bénin)
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
      // Couleurs optimisées lisibilité soleil africain
      colors: {
        // Contrastes élevés pour usage extérieur bars Bénin
      },
    },
  },
  plugins: [],
};
