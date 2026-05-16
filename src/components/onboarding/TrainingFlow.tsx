import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';

// Components for Training/Education
import { WelcomeStep } from './WelcomeStep';
import { RoleDetectedStep } from './RoleDetectedStep';
import { ManagerTourStep } from './ManagerTourStep';
import { BartenderIntroStep } from './BartenderIntroStep';
import { BartenderDemoStep } from './BartenderDemoStep';
import { BartenderTestSaleStep } from './BartenderTestSaleStep';
import { OnboardingProgressBar } from './OnboardingProgressBar';
import { motion } from 'framer-motion';

/**
 * TrainingFlow Orchestrator
 * Dedicated component for the educational "Academy" flow.
 * Separated from OnboardingFlow which focuses on Bar Setup.
 */
export const TrainingFlow: React.FC = () => {
    const navigate = useNavigate();
    const {
        currentStep,
        userRole,
        initializeOnboarding,
        updateBarId,
        completeTraining,
        userId,
        barId: contextBarId
    } = useOnboarding();
    const { currentSession, refreshSession } = useAuth();
    const { currentBar, barMembers } = useBar(); // Destructured currentBar and barMembers from useBar

    // Initialize Onboarding Context for Training
    const initializationAttempted = useRef(false);

    useEffect(() => {
        if (!currentSession?.userId || !currentBar?.id) return;

        // Prevent double initialization or re-initialization on state updates
        if (initializationAttempted.current) return;

        // Sync bar ID if needed
        if (contextBarId !== currentBar.id) {
            updateBarId(currentBar.id);
        }

        // Determine role and init
        const userBarMember = barMembers?.find(
            (m: any) => String(m.userId) === String(currentSession.userId)
        );
        const isBarOwner = String(currentBar.ownerId) === String(currentSession.userId);

        let role = 'serveur'; // default fallback
        if (userBarMember?.role) {
            role = String(userBarMember.role);
        } else if (isBarOwner) {
            role = 'promoteur';
        }

        // Force "Training Mode" by passing true for barIsAlreadySetup
        // This ensures getStepSequence returns the training path
        // We initialize to ensure we start at the beginning of the training sequence
        initializeOnboarding(
            String(currentSession.userId),
            String(currentBar.id),
            role as any,
            true // Force barIsAlreadySetup = true for Training Flow
        );

        initializationAttempted.current = true;

    }, [currentSession, currentBar, barMembers, userId, contextBarId, initializeOnboarding, updateBarId]);

    // Redirect to dashboard if completed
    // [FIX] Removed auto-redirect logic that was causing a loop.
    // User must explicitly click "Back to Dashboard" to complete the process.

    // Render appropriate educational component
    const renderStep = () => {
        switch (currentStep) {
            // Shared Intro
            case OnboardingStep.WELCOME:
                return <WelcomeStep />;
            case OnboardingStep.ROLE_DETECTED:
                return <RoleDetectedStep />;

            // Manager / Promoter Training Path
            case OnboardingStep.MANAGER_TOUR:
            case OnboardingStep.OWNER_REVIEW: // Fallback if context redirects incorrectly
                return <ManagerTourStep />;

            // Bartender Training Path
            case OnboardingStep.BARTENDER_INTRO:
                return <BartenderIntroStep />;
            case OnboardingStep.BARTENDER_DEMO:
                return <BartenderDemoStep />;
            case OnboardingStep.BARTENDER_TEST_SALE:
                return <BartenderTestSaleStep />;

            // Completion
            case OnboardingStep.COMPLETE:
                return (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center w-full max-w-2xl mx-auto">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center text-3xl">
                            🎓
                        </div>
                        <div className="bg-card border border-border shadow-sm rounded-2xl p-8 md:p-10 w-full">
                            <h2 className="text-h1 text-foreground mb-2">Formation terminée</h2>
                            <p className="text-body text-muted-foreground mb-8">Vous maîtrisez maintenant les bases.</p>
                            <button
                                onClick={async () => {
                                    try {
                                        await completeTraining();
                                        await refreshSession();
                                        navigate('/dashboard?training_completed=true', { replace: true });
                                    } catch (err) {
                                        console.error("Error finalizing training:", err);
                                        navigate('/dashboard', { replace: true });
                                    }
                                }}
                                className="btn-brand w-full h-11 rounded-xl text-body-sm font-semibold"
                            >
                                Retour au tableau de bord
                            </button>
                        </div>
                    </div>
                );

            default:
                console.warn(`TrainingFlow: Unhandled step ${currentStep} for role ${userRole}`);
                return (
                    <div className="text-center py-10">
                        <p className="text-body-sm text-muted-foreground mb-4">Étape de formation introuvable : {currentStep}</p>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="btn-brand h-10 rounded-xl px-5 text-body-sm font-semibold"
                        >
                            Retour au tableau de bord
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-muted flex flex-col items-center py-8 relative">
            {/* Academy Header */}
            <div className="w-full max-w-4xl px-4 mb-5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-subtle text-brand-primary flex items-center justify-center text-lg">
                        🎓
                    </div>
                    <div>
                        <h1 className="text-h3 text-foreground leading-tight">Académie BarTender</h1>
                        <p className="text-micro text-muted-foreground">Formation interactive</p>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="text-caption font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
                >
                    Quitter
                </button>
            </div>

            <OnboardingProgressBar />

            <main className="w-full flex-1 flex flex-col items-center justify-start mt-6 px-4">
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-full max-w-4xl"
                >
                    {renderStep()}
                </motion.div>
            </main>
        </div>
    );
};
