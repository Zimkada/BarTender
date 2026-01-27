import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';

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
    const { currentStep, userRole } = useOnboarding();
    const { currentSession } = useAuth();

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
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-6xl mb-4"
                        >
                            🎓
                        </motion.div>
                        <h2 className="text-3xl font-bold mb-2">Formation Terminée !</h2>
                        <p className="text-gray-500">Retour au tableau de bord...</p>
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
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8">
            {/* Academy Header */}
            <div className="w-full max-w-4xl px-4 mb-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🎓</span>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Académie BarTender</h1>
                        <p className="text-xs text-gray-500">Formation Interactive</p>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
                >
                    Quitter
                </button>
            </div>

            <OnboardingProgressBar />

            <main className="w-full flex-1 flex flex-col items-center justify-start mt-4">
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full"
                >
                    {renderStep()}
                </motion.div>
            </main>
        </div>
    );
};
