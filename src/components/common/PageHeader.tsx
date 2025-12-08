import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  mobileActions?: React.ReactNode;  // Actions différentes sur mobile
  hideSubtitleOnMobile?: boolean;    // Masquer subtitle sur mobile pour gagner de l'espace
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  mobileActions,
  hideSubtitleOnMobile = false
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-2xl shadow-sm mb-6 overflow-hidden p-6">
      <div className="flex flex-col gap-4">
        {/* Ligne principale : Back button + Icon + Title */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-lg transition-colors hover:bg-white/20 flex-shrink-0"
            >
              <ArrowLeft size={24} />
            </Button>
            {icon && (
              <div className="hidden sm:flex items-center justify-center bg-white/20 p-2 rounded-lg flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{title}</h1>
              {subtitle && (
                <p className={`text-sm text-amber-100 mt-1 ${hideSubtitleOnMobile ? 'hidden sm:block' : ''}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Actions desktop uniquement */}
          {actions && (
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>

        {/* Actions mobile : full width en dessous si mobileActions existe */}
        {mobileActions && (
          <div className="flex sm:hidden items-center gap-2">
            {mobileActions}
          </div>
        )}

        {/* Fallback : actions normales sur mobile si pas de mobileActions */}
        {!mobileActions && actions && (
          <div className="flex sm:hidden items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
