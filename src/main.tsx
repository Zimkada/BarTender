import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { BarProvider } from './context/BarContext.tsx';
import { StockProvider } from './context/StockContext.tsx';
import { StockBridgeProvider } from './context/StockBridgeProvider.tsx';
import { AppProvider } from './context/AppContext.tsx';
import { NotificationsProvider } from './components/Notifications';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
  </StrictMode>
);