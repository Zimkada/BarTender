import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { BarProvider } from './context/BarContext';
import { StockProvider } from './context/StockContext';
import { StockBridgeProvider } from './context/StockBridgeProvider';
import { AppProvider } from './context/AppContext';
import { NotificationsProvider } from './components/Notifications';
import { queryClient } from './lib/react-query';
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
                  <App />
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