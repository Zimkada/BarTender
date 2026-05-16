import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBar } from '../../../context/BarContext';
import { useOnboarding } from '../../../context/OnboardingContext';
import { CheckCircle, Clock } from 'lucide-react';
import { OnboardingFooter } from '../ui/OnboardingFooter';

export interface RedirectStepConfig {
    id: string;
    title: string;
    description: string;
    icon?: string;
    targetRoute: string;
    completionCheck: (barId: string) => Promise<{ complete: boolean; count: number }>;
    isMandatory: boolean;
    delegationHint?: string; // Pour les étapes du propriétaire
}

interface RedirectStepProps {
    config: RedirectStepConfig;
    onComplete: () => void;
    onSkip?: () => void;
}

export const RedirectStep: React.FC<RedirectStepProps> = ({
    config,
    onComplete,
    onSkip,
}) => {
    const navigate = useNavigate();
    const { currentBar } = useBar();
    const { navigationDirection, previousStep } = useOnboarding();
    const [status, setStatus] = useState<{ complete: boolean; count: number }>({ complete: false, count: 0 });

    const isComplete = status.complete;
    // Initial check + polling toutes les 5 secondes
    // FIX: Utilisation du pattern isMounted pour éviter les fuites de mémoire et race conditions
    useEffect(() => {
        if (!currentBar?.id) return;

        let isMounted = true;
        const intervalTime = 5000;

        const checkCompletion = async () => {
            if (!isMounted) return;

            try {
                const result = await config.completionCheck(currentBar.id);
                if (!isMounted) return;

                setStatus(result);

                // Auto-progression SEULEMENT si on avance (forward)
                // Si on a fait "Retour", on attend le clic de l'utilisateur
                if (result.complete && navigationDirection === 'forward') {
                    // Auto-progression si tâche complétée
                    setTimeout(() => {
                        if (isMounted) onComplete();
                    }, 1500);
                }
            } catch (error) {
                console.error('Error checking completion:', error);
            }
        };

        // Check immédiat
        checkCompletion();

        // Polling
        const interval = setInterval(checkCompletion, intervalTime);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [currentBar?.id, config.completionCheck]); // Deps minimales pour éviter re-render loops

    const handleRedirect = () => {
        navigate(config.targetRoute);
    };

    const handleSkip = () => {
        if (onSkip) onSkip();
    };

    return (
        <div className="w-full max-w-2xl mx-auto px-4">
            <div className="bg-card rounded-lg shadow-md p-8">
                {/* Header */}
                {/* Header */}
                <div className="mb-8 text-center">
                    {config.icon && (
                        <div className="text-5xl mb-4">{config.icon}</div>
                    )}
                    <h1 className="text-3xl font-bold text-foreground">{config.title}</h1>
                    <p className="mt-2 text-foreground/70">{config.description}</p>
                </div>

                {/* Status */}
                <div className={`p-6 rounded-lg mb-6 transition-all ${isComplete
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),85%)] shadow-sm'
                    }`}>
                    <div className="flex items-center gap-3">
                        {isComplete ? (
                            <>
                                <CheckCircle className="w-8 h-8 text-green-600" />
                                <div>
                                    <p className="font-bold text-green-900 text-lg">✓ Tâche complétée</p>
                                    <p className="text-sm text-green-700">
                                        {status.count > 0 ? `Vous avez déjà enregistré ${status.count} élément(s).` : 'Action effectuée avec succès.'}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                <Clock className="w-8 h-8 text-[hsl(var(--brand-hue),var(--brand-saturation),50%)] animate-pulse" />
                                <div>
                                    <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),30%)]">
                                        {config.isMandatory ? '⚠️ Action obligatoire' : 'Action optionnelle'}
                                    </p>
                                    <p className="text-sm text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">
                                        Cliquez ci-dessous pour effectuer cette tâche.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Delegation Hint (Propriétaire uniquement) */}
                {config.delegationHint && !isComplete && (
                    <div className="p-4 bg-[hsl(var(--brand-hue),var(--brand-saturation),94%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),85%)] rounded-lg mb-6">
                        <p className="text-sm text-[hsl(var(--brand-hue),var(--brand-saturation),30%)]">
                            💡 <strong>Délégation :</strong> {config.delegationHint}
                        </p>
                    </div>
                )}

                {/* Actions */}
                {/* Footer Actions Standardisé via Component */}
                <OnboardingFooter
                    primaryAction={isComplete && navigationDirection === 'backward' ? {
                        label: "Continuer l'onboarding →",
                        onClick: onComplete,
                    } : !isComplete ? {
                        label: "Aller au menu",
                        onClick: handleRedirect,
                    } : undefined}
                    onBack={previousStep}
                    secondaryAction={
                        (isComplete) ? {
                            label: "Ajouter d'autres produits",
                            onClick: handleRedirect,
                            variant: 'outline'
                        } : (!config.isMandatory && onSkip) ? {
                            label: "Passer cet étape",
                            onClick: handleSkip
                        } : undefined
                    }
                    showLater={!isComplete}
                />

                {/* Progress indicator when complete */}
                {isComplete && (
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-green-600 h-full animate-pulse" style={{ width: '100%' }} />
                    </div>
                )}
            </div>
        </div>
    );
};
