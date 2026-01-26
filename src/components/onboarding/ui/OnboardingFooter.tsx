import React from 'react';
import { ArrowRight, ChevronLeft, Clock } from 'lucide-react';
import { LoadingButton } from '../../ui/LoadingButton';

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
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col gap-4">
            {/* Ligne 1 : Action Principale (Centre) */}
            {primaryAction && (
                <div className="flex justify-center">
                    <LoadingButton
                        onClick={primaryAction.onClick}
                        isLoading={primaryAction.isLoading}
                        loadingText={primaryAction.loadingText}
                        className={`w-full sm:w-auto px-8 py-3 rounded-lg text-white font-semibold shadow-md flex items-center justify-center gap-2 transition hover:scale-105 ${primaryAction.className || 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {primaryAction.label}
                        {primaryAction.icon || <ArrowRight className="w-5 h-5" />}
                    </LoadingButton>
                </div>
            )}

            {/* Ligne 2 : Retour (Gauche) / Secondaire (Droite) */}
            <div className="flex justify-between items-center w-full px-1">
                {/* Gauche : Retour */}
                <div>
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="text-gray-500 hover:text-gray-700 font-medium text-sm px-3 py-2 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Retour
                        </button>
                    )}
                </div>

                {/* Droite : Secondaire (Passer / Suivant) */}
                <div>
                    {secondaryAction && (
                        <button
                            type="button"
                            onClick={secondaryAction.onClick}
                            disabled={secondaryAction.disabled}
                            className={`font-medium text-sm px-4 py-2 rounded-lg transition ${secondaryAction.variant === 'outline'
                                ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                : 'text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 border border-transparent'
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
                        className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2 flex items-center gap-1.5"
                    >
                        <Clock className="w-3.5 h-3.5" />
                        Compléter plus tard
                    </button>
                </div>
            )}
        </div>
    );
};
