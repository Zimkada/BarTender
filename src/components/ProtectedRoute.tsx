// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { usePlan } from '../hooks/usePlan';
import type { FeatureKey } from '../config/plans';
import type { RolePermissions } from '../types';

interface ProtectedRouteProps {
  permission?: keyof RolePermissions;
  /** Feature du plan requise — redirige vers / si le plan du bar ne l'inclut pas */
  feature?: FeatureKey;
  /**
   * ⭐ Route du module restauration : inaccessible si le bar n'a pas la cuisine
   * activée (PLAN_MODULE_RESTAURATION.md §3).
   *
   * ⚠️ `hasRestaurant` exige DÉJÀ le mode complet (§13.4) — la garde est donc
   * double sans avoir à le redire ici.
   *
   * Un bar pur atteignant l'URL par un lien ou un signet est renvoyé à
   * l'accueil, exactement comme pour une permission manquante.
   */
  requiresRestaurant?: boolean;
}

export function ProtectedRoute({ permission, feature, requiresRestaurant }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission } = useAuth();
  const { hasFeature } = usePlan();
  const { hasRestaurant } = useBarContext();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  if (feature && !hasFeature(feature)) {
    return <Navigate to="/" replace />;
  }

  if (requiresRestaurant && !hasRestaurant) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
