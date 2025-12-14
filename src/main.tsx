import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary'; // Ajout de l'import ErrorBoundary

// Contexts
import { AuthProvider } from './context/AuthContext';
import { ActingAsProvider } from './context/ActingAsContext';
import { BarProvider } from './context/BarContext';
import { StockProvider } from './context/StockContext';
import { StockBridgeProvider } from './context/StockBridgeProvider';
import { AppProvider } from './context/AppProvider';
import { ModalProvider } from './context/ModalContext';
import { NotificationsProvider } from './components/Notifications';
import { ErrorFallback } from './components/common/ErrorFallback'; // Ajout de l'import ErrorFallback

// Config
import { queryClient } from './lib/react-query';
import { router } from './routes';
import './index.css';

// Dev helpers (console utilities) - Mode dev uniquement
import './utils/devHelpers';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        <AuthProvider>
          <ActingAsProvider>
            <BarProvider>
              <StockProvider>
                <StockBridgeProvider>
                  <AppProvider>
                    <ModalProvider>
                      <ErrorBoundary FallbackComponent={ErrorFallback} onError={(error, info) => console.error("Caught an error:", error, info)}>
                        <RouterProvider router={router} />
                      </ErrorBoundary>
                    </ModalProvider>
                  </AppProvider>
                </StockBridgeProvider>
              </StockProvider>
            </BarProvider>
          </ActingAsProvider>
        </AuthProvider>
      </NotificationsProvider>
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  </StrictMode>
);
