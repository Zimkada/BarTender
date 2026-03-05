import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // ⚠️ Ajouter ici les couleurs de marque, polices, etc.
    },
  },
  plugins: [],
} satisfies Config;
