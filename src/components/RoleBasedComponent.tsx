import React from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { UserRole, RolePermissions } from '../types';

interface RoleBasedComponentProps {
  children: React.ReactNode;
  // Option 1: Par rôle
  allowedRoles?: UserRole[];
  // Option 2: Par permission
  requiredPermission?: keyof RolePermissions;
  // Option 3: Fonction custom
  condition?: () => boolean;
  // Fallback si pas autorisé
  fallback?: React.ReactNode;
}

export function RoleBasedComponent({ 
  children, 
  allowedRoles, 
  requiredPermission, 
  condition,
  fallback = null 
}: RoleBasedComponentProps) {
  const { getCurrentRole, canAccess } = usePermissions();

  const isAllowed = (): boolean => {
    // Condition custom prioritaire
    if (condition) {
      return condition();
    }
    
    // Vérification par permission
    if (requiredPermission) {
      return canAccess(requiredPermission);
    }
    
    // Vérification par rôle
    if (allowedRoles) {
      const currentRole = getCurrentRole();
      return currentRole ? allowedRoles.includes(currentRole) : false;
    }
    
    // Par défaut, autorisé
    return true;
  };

  return isAllowed() ? <>{children}</> : <>{fallback}</>;
}