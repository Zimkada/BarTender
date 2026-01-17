import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import { GuideHeaderButton } from '../guide/GuideHeaderButton';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  mobileActions?: React.ReactNode;  // Actions différentes sur mobile
  hideSubtitleOnMobile?: boolean;    // Masquer subtitle sur mobile pour gagner de l'espace
  guideId?: string;  // ID du guide à afficher pour cette page
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  mobileActions,
  hideSubtitleOnMobile = false,
  guideId
}: PageHeaderProps) {
  const navigate = useNavigate();

  // Combine guide button with existing actions
  const allActions = (
    <>
      {guideId && <GuideHeaderButton guideId={guideId} />}
      {actions}
    </>
  );

  const allMobileActions = (
    <>
      {guideId && <GuideHeaderButton guideId={guideId} variant="compact" />}
      {mobileActions || actions}
    </>
  );

  return (
    <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-2xl shadow-sm mb-4 sm:mb-6 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Ligne principale : Back button + Icon + Title */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-lg transition-colors hover:bg-white/20 flex-shrink-0"
            >
              <ArrowLeft size={20} className="sm:hidden" />
              <ArrowLeft size={24} className="hidden sm:block" />
            </Button>
            {icon && (
              <div className="hidden sm:flex items-center justify-center bg-white/20 p-2 rounded-lg flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold truncate">{title}</h1>
              {subtitle && (
                <p className={`text-xs sm:text-sm text-amber-100 mt-0.5 sm:mt-1 ${hideSubtitleOnMobile ? 'hidden sm:block' : ''}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Actions desktop uniquement */}
          {allActions && (
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              {allActions}
            </div>
          )}
        </div>

        {/* Actions mobile : full width en dessous */}
        {(mobileActions || actions || guideId) && (
          <div className="flex sm:hidden items-center gap-2">
            {allMobileActions}
          </div>
        )}
      </div>
    </div>
  );
}
