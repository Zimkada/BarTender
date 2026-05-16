import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Home } from 'lucide-react';

interface OnboardingBreadcrumbProps {
    currentStep: string;
    onBackToOnboarding?: () => void;
}

/**
 * Breadcrumb affiché en haut des pages métier quand mode=onboarding
 * Permet à l'utilisateur de retourner à l'onboarding
 */
export const OnboardingBreadcrumb: React.FC<OnboardingBreadcrumbProps> = ({
    currentStep,
    onBackToOnboarding,
}) => {
    const navigate = useNavigate();

    const handleBack = () => {
        if (onBackToOnboarding) {
            onBackToOnboarding();
        } else {
            navigate('/onboarding');
        }
    };

    return (
        <div className="bg-brand-subtle border-b border-brand-subtle px-4 py-3 mb-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-card text-brand-primary flex items-center justify-center flex-shrink-0">
                        <Home className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-micro text-brand-primary">Configuration initiale</p>
                        <p className="text-body-sm font-semibold text-foreground truncate">{currentStep}</p>
                    </div>
                </div>

                <button
                    onClick={handleBack}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 h-9 bg-card border border-border rounded-lg hover:border-brand-primary hover:text-brand-primary transition-colors text-caption font-medium text-foreground/80 whitespace-nowrap shadow-sm"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Retour<span className="hidden sm:inline"> à l'onboarding</span></span>
                </button>
            </div>
        </div>
    );
};
