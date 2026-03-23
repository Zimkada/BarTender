import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'react-hot-toast';

// Monitoring & Error Tracking
import { initMonitoring, captureError } from './lib/monitoring';

// Contexts
import { AuthProvider } from './context/AuthContext';
import { BarProvider } from './context/BarContext';
import { ThemeProvider } from './context/ThemeContext';
import { OnboardingProvider } from './context/OnboardingContext';
import { GuideProvider } from './context/GuideContext';
import { StockProvider } from './context/StockContext';
import { AppProvider } from './context/AppProvider';
import { ModalProvider } from './context/ModalContext';
import { NotificationsProvider } from './components/Notifications';
import { ErrorFallback } from './components/common/ErrorFallback';
import App from './App';

// PWA Components
import { PWAInstallPrompt } from './components/PWAInstallPrompt';

// Config
import { queryClient } from './lib/react-query';
import { router } from './routes';
import './index.css';

// Dev helpers
import './utils/devHelpers';

// ════════════════════════════════════════════════════════════════
// Initialize Monitoring & Error Handlers
// ════════════════════════════════════════════════════════════════

initMonitoring();

// Global error handler (runtime errors)
window.addEventListener('error', (event: ErrorEvent) => {
  console.error('[Window Error]', event.error);
  captureError(event.error, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// Unhandled promise rejection handler (async/await errors)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  captureError(event.reason, {
    type: 'unhandledPromiseRejection',
  });
  // Don't prevent default - let browser log it too for dev visibility
});

// Service Worker Error Bridge
// SW runs in a different scope (self) and can't call Sentry directly
// So it sends errors via postMessage, and we capture them here
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, error, context } = event.data;

    if (type === 'SENTRY_ERROR') {
      console.error('[SW Error]', error);
      captureError(new Error(error), {
        source: 'service-worker',
        ...context,
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      <NotificationsProvider>
        <AuthProvider>
          <BarProvider>
            {/* ThemeProvider always loaded - provides theme context to all components */}
            <ThemeProvider>
              <OnboardingProvider>
                <GuideProvider>
                  <StockProvider>
                    <AppProvider>
                      <ModalProvider>
                        <ErrorBoundary FallbackComponent={ErrorFallback} onError={(error, info) => console.error("Caught an error:", error, info)}>
                          <App />
                          <RouterProvider router={router} />
                          {/* PWA Components */}
                          <PWAInstallPrompt />
                        </ErrorBoundary>
                      </ModalProvider>
                    </AppProvider>
                  </StockProvider>
                </GuideProvider>
              </OnboardingProvider>
            </ThemeProvider>
          </BarProvider>
        </AuthProvider>
      </NotificationsProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />}
    </QueryClientProvider>
  </StrictMode>
);
