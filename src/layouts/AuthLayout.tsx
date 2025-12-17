// src/layouts/AuthLayout.tsx
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { createContext, useContext } from 'react';
import { useAuth } from '../context/AuthContext';

// 1. Création du contexte de navigation
type AuthNavContextType = {
  navigateToForgotPassword: () => void;
  navigateToLogin: () => void;
};

const AuthNavContext = createContext<AuthNavContextType | undefined>(undefined);

// 2. Création du hook personnalisé
export const useAuthNav = () => {
  const context = useContext(AuthNavContext);
  if (!context) {
    throw new Error('useAuthNav must be used within an AuthLayout');
  }
  return context;
};

export function AuthLayout() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // 3. Définition des fonctions de navigation
  const navValue = {
    navigateToForgotPassword: () => navigate('/auth/forgot-password'),
    navigateToLogin: () => navigate('/auth/login'),
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
      {/* 4. Fournir le contexte aux composants enfants (Outlet) */}
      <AuthNavContext.Provider value={navValue}>
        <Outlet />
      </AuthNavContext.Provider>
    </div>
  );
}