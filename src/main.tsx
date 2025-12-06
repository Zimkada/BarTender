import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router-dom';

// Contexts
import { AuthProvider } from './context/AuthContext';
import { BarProvider } from './context/BarContext';
import { StockProvider } from './context/StockContext';
import { StockBridgeProvider } from './context/StockBridgeProvider';
import { AppProvider } from './context/AppContext';
import { ModalProvider } from './context/ModalContext'; // ✅ NEW
import { NotificationsProvider } from './components/Notifications';

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
          <BarProvider>
            <StockProvider>
              <StockBridgeProvider>
                <AppProvider>
                  <ModalProvider>
                    <RouterProvider router={router} />
                  </ModalProvider>
                </AppProvider>
              </StockBridgeProvider>
            </StockProvider>
          </BarProvider>
        </AuthProvider>
      </NotificationsProvider>
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  </StrictMode>
);
