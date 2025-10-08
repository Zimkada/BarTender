import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, RolePermissions } from '../types';

interface RoleBasedComponentProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermission?: keyof RolePermissions;
  condition?: () => boolean;
  fallback?: React.ReactNode;
}

export function RoleBasedComponent({ 
  children, 
  allowedRoles, 
  requiredPermission, 
  condition,
  fallback = null 
}: RoleBasedComponentProps) {
  const { currentSession, hasPermission } = useAuth(); // Utilisation directe de useAuth

  const isAllowed = (): boolean => {
    if (condition) {
      return condition();
    }
    
    if (requiredPermission) {
      return hasPermission(requiredPermission);
    }
    
    if (allowedRoles) {
      return currentSession ? allowedRoles.includes(currentSession.role) : false;
    }
    
    return true;
  };

  return isAllowed() ? <>{children}</> : <>{fallback}</>;
}