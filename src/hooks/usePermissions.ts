import { useAuth } from "../context/AuthContext";
import { RolePermissions } from '../types';

export function usePermissions() {
  const { currentSession, hasPermission } = useAuth();

  const canAccess = (permission: keyof RolePermissions): boolean => {
    return hasPermission(permission);
  };

  const isRole = (role: string): boolean => {
    return currentSession?.role === role;
  };

  const getCurrentRole = () => {
    return currentSession?.role;
  };

  const getCurrentUserId = () => {
    return currentSession?.userId;
  };

  const canSeeAllData = (): boolean => {
    return currentSession?.role !== 'serveur';
  };

  return {
    canAccess,
    isRole,
    getCurrentRole,
    getCurrentUserId,
    canSeeAllData,
    // Raccourcis pour permissions communes
    canManage: canAccess('canManageUsers'),
    canEditProducts: canAccess('canEditProducts'),
    canViewAnalytics: canAccess('canViewAnalytics'),
    canSwitchMode: canAccess('canSwitchToManagerMode'),
  };
}