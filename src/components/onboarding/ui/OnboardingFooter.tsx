import React from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { LoadingButton } from '../../ui/LoadingButton';
import { BackButton } from '../../ui/BackButton';

interface OnboardingFooterProps {
    // Ligne 1 : Action Principale (Centre)
    primaryAction?: {
        label: string;
        onClick: () => void;
        isLoading?: boolean;
        loadingText?: string;
        icon?: React.ReactNode;
        className?: string; // Pour surcharge style (ex: bg-green-600)
    };

    // Ligne 2 : Navigation (Gauche / Droite)
    onBack?: () => void;
    secondaryAction?: {
        label: string; // Ex: "Passer", "Suivant"
        onClick: () => void;
        disabled?: boolean;
        variant?: 'ghost' | 'outline' | 'default';
    };

    // Ligne 3 : Escape (Centre)
    showLater?: boolean;
}

export const OnboardingFooter: React.FC<OnboardingFooterProps> = ({
    primaryAction,
    onBack,
    secondaryAction,
    showLater = true,
}) => {

    return (
        <div className="mt-8 pt-6 border-t border-border flex flex-col gap-3">
            {/* Ligne 1 : Action Principale (Centre) */}
            {primaryAction && (
                <div className="flex justify-center">
                    <LoadingButton
                        onClick={primaryAction.onClick}
                        isLoading={primaryAction.isLoading}
                        loadingText={primaryAction.loadingText}
                        className={`w-full sm:w-auto h-11 px-6 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2 ${primaryAction.className || 'btn-brand'}`}
                    >
                        {primaryAction.label}
                        {primaryAction.icon || <ArrowRight className="w-4 h-4" />}
                    </LoadingButton>
                </div>
            )}

            {/* Ligne 2 : Retour (Gauche) / Secondaire (Droite) */}
            <div className="flex justify-between items-center w-full px-1">
                <div>
                    {onBack && (
                        <BackButton
                            onClick={onBack}
                            showLabel={true}
                            label="Retour"
                            variant="ghost"
                            size="sm"
                        />
                    )}
                </div>

                <div>
                    {secondaryAction && (
                        <button
                            type="button"
                            onClick={secondaryAction.onClick}
                            disabled={secondaryAction.disabled}
                            className={`text-body-sm font-medium px-4 py-2 rounded-lg transition-colors ${secondaryAction.variant === 'outline'
                                ? 'border border-border bg-card text-foreground/80 hover:border-brand-primary hover:text-brand-primary'
                                : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                                }`}
                        >
                            {secondaryAction.label}
                        </button>
                    )}
                </div>
            </div>

            {/* Ligne 3 : Compléter plus tard (Centre) */}
            {showLater && (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => window.location.href = '/dashboard'}
                        className="text-caption text-muted-foreground hover:text-foreground/70 px-3 py-1.5 flex items-center gap-1.5 transition-colors"
                    >
                        <Clock className="w-3.5 h-3.5" />
                        Compléter plus tard
                    </button>
                </div>
            )}
        </div>
    );
};
