// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../hooks/usePlan';
import type { FeatureKey } from '../config/plans';

interface ProtectedRouteProps {
  permission?: string;
  /** Feature du plan requise — redirige vers / si le plan du bar ne l'inclut pas */
  feature?: FeatureKey;
}

export function ProtectedRoute({ permission, feature }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission } = useAuth();
  const { hasFeature } = usePlan();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  if (feature && !hasFeature(feature)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
