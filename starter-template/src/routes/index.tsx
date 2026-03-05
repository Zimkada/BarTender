import { createBrowserRouter } from 'react-router-dom';

/**
 * Routing de l'application.
 *
 * ⚠️ À compléter avec les pages et layouts du projet.
 *
 * Modèle recommandé :
 *   /auth/*   → AuthLayout   (public)
 *   /*        → RootLayout   (authentifié)
 *   /admin/*  → AdminLayout  (admin uniquement)
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>vite-supabase-starter</h1>
        <p>Template prêt. Remplacer cette page par l'application.</p>
      </div>
    ),
  },
]);
