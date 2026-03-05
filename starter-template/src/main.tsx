import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'react-hot-toast';

import { initMonitoring, captureError } from './lib/monitoring';
import { queryClient } from './lib/react-query';
import { router } from './routes';
import { ErrorFallback } from './components/common/ErrorFallback';
// import { AuthProvider } from './context/AuthContext'; // À décommenter
import './index.css';

// ─── Initialisation monitoring ────────────────────────────────────────────────
initMonitoring();

// Erreurs runtime non catchées
window.addEventListener('error', (event: ErrorEvent) => {
  captureError(event.error, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// Promesses rejetées non gérées
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  captureError(event.reason, { type: 'unhandledPromiseRejection' });
});

// ─── Rendu ────────────────────────────────────────────────────────────────────
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      {/* ⚠️ Ajouter ici les Providers de l'app (Auth, Theme, etc.) */}
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={(error, info) => captureError(error, { componentStack: info.componentStack })}
      >
        <RouterProvider router={router} />
      </ErrorBoundary>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />}
    </QueryClientProvider>
  </StrictMode>
);
