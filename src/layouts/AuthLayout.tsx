// src/layouts/AuthLayout.tsx
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { createContext, useContext, useState, useEffect, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LoadingFallback } from '../components/LoadingFallback';
import { LazyLoadErrorBoundary } from '../components/LazyLoadErrorBoundary';

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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Déterminer si c'est un flux de récupération de mot de passe
  useEffect(() => {
    const checkRecoveryFlow = async () => {
      try {
        // Écouter les événements d'auth pour détecter PASSWORD_RECOVERY
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') {
            setIsPasswordRecovery(true);
          }
        });

        setIsLoading(false);
        return () => {
          subscription?.unsubscribe();
        };
      } catch (error) {
        console.error('[AuthLayout] Error checking recovery flow:', error);
        setIsLoading(false);
      }
    };

    checkRecoveryFlow();
  }, []);

  // Pendant le chargement initial, afficher rien pour éviter les redirections prématurées
  if (isLoading) {
    return null;
  }

  // Rediriger vers le dashboard si authentifié (sauf si en mode récupération)
  if (isAuthenticated && !isPasswordRecovery) {
    return <Navigate to="/" replace />;
  }

  // 3. Définition des fonctions de navigation
  const navValue = {
    navigateToForgotPassword: () => navigate('/auth/forgot-password'),
    navigateToLogin: () => navigate('/auth/login'),
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-subtle to-brand-subtle">
      {/* 4. Fournir le contexte aux composants enfants (Outlet) */}
      <AuthNavContext.Provider value={navValue}>
        <LazyLoadErrorBoundary maxRetries={3}>
          <Suspense fallback={<LoadingFallback />}>
            <Outlet />
          </Suspense>
        </LazyLoadErrorBoundary>
      </AuthNavContext.Provider>
    </div>
  );
}