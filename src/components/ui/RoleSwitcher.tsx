import React from 'react';
import { cn } from '../../lib/utils';
import { UserRole } from '../../types';

interface RoleSwitcherProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
  isLoading?: boolean;
  availableRoles?: UserRole[];
  showLabel?: boolean;
}

/**
 * Premium Role Switcher Component
 * Displays interactive button group for switching between roles
 * Shows which role is currently active with visual highlight
 */
export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  value,
  onChange,
  disabled = false,
  isLoading = false,
  availableRoles = ['serveur', 'gerant'],
  showLabel = false,
}) => {
  const getRoleLabel = (role: UserRole): string => {
    switch (role) {
      case 'gerant': return 'Gérant';
      case 'serveur': return 'Serveur';
      case 'promoteur': return 'Promoteur';
      case 'super_admin': return 'Super Admin';
      default: return role;
    }
  };

  const getRoleColor = (role: UserRole, isActive: boolean): string => {
    const baseClasses = 'px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200';

    if (!isActive) {
      return cn(baseClasses, 'bg-gray-100 text-gray-500 hover:bg-gray-200');
    }

    switch (role) {
      case 'gerant':
        return cn(baseClasses, 'bg-brand-primary text-white shadow-md shadow-brand-subtle');
      case 'serveur':
        return cn(baseClasses, 'bg-blue-500 text-white shadow-md shadow-blue-100');
      case 'promoteur':
        return cn(baseClasses, 'bg-purple-500 text-white shadow-md shadow-purple-100');
      default:
        return cn(baseClasses, 'bg-gray-400 text-white');
    }
  };

  const handleClick = (role: UserRole) => {
    if (!disabled && !isLoading && role !== value) {
      onChange(role);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {showLabel && (
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Rôle
        </label>
      )}

      <div className="flex gap-2 flex-wrap">
        {availableRoles.map((role) => (
          <button
            key={role}
            onClick={() => handleClick(role)}
            disabled={disabled || isLoading}
            className={cn(
              getRoleColor(role, role === value),
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'hover:disabled:bg-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary',
              'transition-all duration-200'
            )}
            aria-pressed={role === value}
            aria-label={`Changer le rôle en ${getRoleLabel(role)}`}
            title={`Cliquez pour changer le rôle en ${getRoleLabel(role)}`}
          >
            {isLoading && role === value ? (
              <>
                <span className="inline-block animate-spin mr-2">⟳</span>
                {getRoleLabel(role)}
              </>
            ) : (
              getRoleLabel(role)
            )}
          </button>
        ))}
      </div>

      {/* Accessible hint */}
      <p className="text-[10px] text-gray-400 mt-1">
        Cliquez sur un rôle pour le changer
      </p>
    </div>
  );
};
