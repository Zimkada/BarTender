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
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-3 mb-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Home className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-xs text-blue-600 font-medium">Configuration initiale</p>
                        <p className="text-sm font-semibold text-blue-900">{currentStep}</p>
                    </div>
                </div>

                <button
                    onClick={handleBack}
                    className="flex-shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition text-sm font-medium text-blue-700 whitespace-nowrap shadow-sm"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Retour<span className="hidden sm:inline"> à l'onboarding</span></span>
                </button>
            </div>
        </div>
    );
};
