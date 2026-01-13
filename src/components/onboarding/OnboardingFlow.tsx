import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep, UserRole } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';

// Welcome & Role detection
import { WelcomeStep } from './WelcomeStep';
import { RoleDetectedStep } from './RoleDetectedStep';

// Owner components
import { BarDetailsStep } from './BarDetailsStep';
import { AddManagersStep } from './AddManagersStep';
import { SetupStaffStep } from './SetupStaffStep';
import { AddProductsStep } from './AddProductsStep';
import { StockInitStep } from './StockInitStep';
import { ClosingHourStep } from './ClosingHourStep';
import { ReviewStep } from './ReviewStep';

// Manager components
import { ManagerRoleConfirmStep } from './ManagerRoleConfirmStep';
import { ManagerCheckStaffStep } from './ManagerCheckStaffStep';
import { ManagerTourStep } from './ManagerTourStep';

// Bartender components
import { BartenderIntroStep } from './BartenderIntroStep';
import { BartenderDemoStep } from './BartenderDemoStep';
import { BartenderTestSaleStep } from './BartenderTestSaleStep';

// Progress indicator
import { OnboardingProgressBar } from './OnboardingProgressBar';

/**
 * Main Onboarding Flow Orchestrator
 * Renders the appropriate step component based on current step and role
 * Includes sticky progress bar to show user progression
 */
export const OnboardingFlow: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentStep,
    initializeOnboarding,
    userId,
  } = useOnboarding();
  const { currentSession } = useAuth();
  const { currentBar, barMembers } = useBar();

  // Initialize onboarding on first mount if not already initialized
  useEffect(() => {
    if (!userId && currentSession?.userId && currentBar?.id) {
      if (currentSession && currentBar && barMembers) {
        const userBarMember = barMembers.find(
          (m: any) => String(m.userId) === String(currentSession.userId)
        );

        // Determine role: use bar member role if found, prioritize owner role if user is bar owner
        let role: UserRole = 'serveur'; // default

        if (userBarMember?.role) {
          role = String(userBarMember.role) as UserRole;
        }

        // If user is the bar owner, ensure they have promoteur/owner role
        if (String(currentBar.ownerId) === String(currentSession.userId)) {
          role = 'promoteur';
        }

        initializeOnboarding(
          String(currentSession.userId),
          String(currentBar.id),
          role
        );
      }
    }
  }, [currentSession?.userId, currentBar?.id, currentBar?.ownerId, barMembers, initializeOnboarding]);

  // Render appropriate component based on current step
  const renderStep = () => {
    switch (currentStep) {
      // Welcome & Role detection
      case OnboardingStep.WELCOME:
        return <WelcomeStep />;
      case OnboardingStep.ROLE_DETECTED:
        return <RoleDetectedStep />;

      // Owner/Promoter path
      case OnboardingStep.OWNER_BAR_DETAILS:
        return <BarDetailsStep />;
      case OnboardingStep.OWNER_ADD_MANAGERS:
        return <AddManagersStep />;
      case OnboardingStep.OWNER_SETUP_STAFF:
        return <SetupStaffStep />;
      case OnboardingStep.OWNER_ADD_PRODUCTS:
        return <AddProductsStep />;
      case OnboardingStep.OWNER_STOCK_INIT:
        return <StockInitStep />;
      case OnboardingStep.OWNER_CLOSING_HOUR:
        return <ClosingHourStep />;
      case OnboardingStep.OWNER_REVIEW:
        return <ReviewStep />;

      // Manager path
      case OnboardingStep.MANAGER_ROLE_CONFIRM:
        return <ManagerRoleConfirmStep />;
      case OnboardingStep.MANAGER_CHECK_STAFF:
        return <ManagerCheckStaffStep />;
      case OnboardingStep.MANAGER_TOUR:
        return <ManagerTourStep />;

      // Bartender path
      case OnboardingStep.BARTENDER_INTRO:
        return <BartenderIntroStep />;
      case OnboardingStep.BARTENDER_DEMO:
        return <BartenderDemoStep />;
      case OnboardingStep.BARTENDER_TEST_SALE:
        return <BartenderTestSaleStep />;

      // Default
      case OnboardingStep.COMPLETE:
        return (
          <div className="w-full max-w-2xl mx-auto px-4">
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Configuration terminée !</h1>
              <p className="text-gray-600 mb-6">Votre bar est prêt à être utilisé.</p>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Aller au Dashboard
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="w-full max-w-2xl mx-auto px-4">
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-600">Loading onboarding...</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Progress indicator - sticky at top */}
      <OnboardingProgressBar />

      {/* Step content */}
      <div className="py-12">
        {renderStep()}
      </div>
    </div>
  );
};
