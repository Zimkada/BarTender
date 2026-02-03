import React, { useEffect } from 'react';
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
        userId,
        barId: contextBarId
    } = useOnboarding();
    const { currentSession } = useAuth();
    const { currentBar, barMembers } = useBar(); // Destructured currentBar and barMembers from useBar

    // Initialize Onboarding Context for Training
    useEffect(() => {
        if (!currentSession?.userId || !currentBar?.id) return;

        // Sync bar ID if needed
        if (contextBarId !== currentBar.id) {
            updateBarId(currentBar.id);
        }

        // If context is already initialized for the CURRENT user, don't re-init
        // This prevents stale state ("Promoter") from persisting when logging in as a "Server"
        if (userId && userId === String(currentSession.userId)) return;

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
        initializeOnboarding(
            String(currentSession.userId),
            String(currentBar.id),
            role as any,
            true // Force barIsAlreadySetup = true for Training Flow
        );

    }, [currentSession, currentBar, barMembers, userId, contextBarId, initializeOnboarding, updateBarId]);

    // Redirect to dashboard if completed
    useEffect(() => {
        if (currentStep === OnboardingStep.COMPLETE) {
            const timer = setTimeout(() => {
                navigate('/dashboard', { replace: true });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [currentStep, navigate]);

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
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center w-full max-w-3xl mx-auto">
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20 }}
                            className="w-24 h-24 flex items-center justify-center rounded-full bg-[hsl(var(--brand-hue),var(--brand-saturation),95%)] mb-6 shadow-inner"
                        >
                            <span className="text-6xl">🎓</span>
                        </motion.div>
                        <div className="backdrop-blur-xl bg-white/60 border border-white/40 shadow-xl rounded-2xl p-6 md:p-10 w-full ring-1 ring-black/5">
                            <h2 className="text-3xl font-bold mb-3 text-[hsl(var(--brand-hue),var(--brand-saturation),10%)]">Formation Terminée !</h2>
                            <p className="text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] mb-6">Vous maîtrisez maintenant les bases.</p>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="w-full py-3 rounded-xl bg-[image:var(--brand-gradient)] text-white font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                            >
                                Retour au tableau de bord
                            </button>
                        </div>
                    </div>
                );

            default:
                // Fallback for unknown steps in training mode
                console.warn(`TrainingFlow: Unhandled step ${currentStep} for role ${userRole}`);
                return (
                    <div className="text-center py-10">
                        <p className="text-gray-500">Étape de formation non trouvée: {currentStep}</p>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg"
                        >
                            Retour au tableau de bord
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-[hsl(var(--brand-hue),var(--brand-saturation),98%)] flex flex-col items-center py-8 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[60vh] h-[60vh] rounded-full bg-[image:var(--brand-gradient)] opacity-5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60vh] h-[60vh] rounded-full bg-[hsl(var(--brand-hue),var(--brand-saturation),50%)] opacity-5 blur-[120px] pointer-events-none" />

            {/* Academy Header */}
            <div className="w-full max-w-4xl px-4 mb-6 flex justify-between items-center relative z-10">
                <div className="flex items-center gap-3 backdrop-blur-sm bg-white/30 px-4 py-2 rounded-full border border-white/40 shadow-sm">
                    <span className="text-2xl filter drop-shadow-sm">🎓</span>
                    <div>
                        <h1 className="text-lg font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),15%)] leading-tight">Académie BarTender</h1>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">Formation Interactive</p>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="text-sm font-medium text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] hover:text-[hsl(var(--brand-hue),var(--brand-saturation),20%)] transition-colors px-3 py-1 rounded-lg hover:bg-black/5"
                >
                    Quitter
                </button>
            </div>

            <OnboardingProgressBar />

            <main className="w-full flex-1 flex flex-col items-center justify-start mt-8 px-4 relative z-10">
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full max-w-4xl"
                >
                    {renderStep()}
                </motion.div>
            </main>
        </div>
    );
};
