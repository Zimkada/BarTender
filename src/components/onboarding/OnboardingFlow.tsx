import React, { useEffect } from 'react';
import { useOnboarding, OnboardingStep } from '@/context/OnboardingContext';
import { useAuth } from '@/context/AuthContext';
import { useBar } from '@/context/BarContext';

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

/**
 * Main Onboarding Flow Orchestrator
 * Renders the appropriate step component based on current step and role
 */
export const OnboardingFlow: React.FC = () => {
  const { currentStep, userRole, userId, barId, initializeOnboarding } = useOnboarding();
  const { currentSession } = useAuth();
  const { currentBar } = useBar();

  // Initialize onboarding on first mount if not already initialized
  useEffect(() => {
    if (!userId && currentSession?.user?.id && currentBar?.id) {
      // Determine user role from bar_members
      const userBarMember = currentBar?.members?.find(
        (m) => m.user_id === currentSession.user.id
      );
      const role = (userBarMember?.role || 'serveur') as any;

      initializeOnboarding(currentSession.user.id, currentBar.id, role);
    }
  }, [currentSession, currentBar, userId, initializeOnboarding]);

  // Render appropriate component based on current step
  const renderStep = () => {
    switch (currentStep) {
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
    <div className="min-h-screen bg-gray-100 py-12">
      {renderStep()}
    </div>
  );
};
