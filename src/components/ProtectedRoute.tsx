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
   * ⛔ CE COMMENTAIRE AFFIRMAIT L'INVERSE jusqu'au 18/08/2026 : « `hasRestaurant`
   * exige DÉJÀ le mode complet (§13.4) — la garde est donc double ». C'est FAUX
   * depuis le §20 : `hasRestaurant` ne teste plus QUE le drapeau, et la cuisine
   * s'ouvre dans les deux modes.
   *
   * ⚠️ Le code, lui, n'a jamais été faux — seule cette note l'était. Mais c'est
   * exactement le défaut que le plan nomme comme cause de l'incohérence
   * `replace_dish_price_options` : un commentaire périmé qui décrit un invariant
   * inversé égare plus sûrement qu'une absence de commentaire.
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
