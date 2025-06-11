import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { BarProvider } from './context/BarContext.tsx';
import { AppProvider } from './context/AppContext.tsx';
import { NotificationsProvider } from './components/Notifications';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotificationsProvider>
      <AuthProvider>
        <BarProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </BarProvider>
      </AuthProvider>
    </NotificationsProvider>
  </StrictMode>
);