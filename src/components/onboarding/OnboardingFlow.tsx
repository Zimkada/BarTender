import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep, UserRole } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBar } from '../../context/BarContext';

import { OnboardingCompletionService } from '../../services/onboarding/completionTracking.service';
import { RedirectStep } from './steps/RedirectStep';

// Define the config type here or import it if exported
interface RedirectStepConfig {
  id: string;
  title: string;
  description: string;
  icon?: string;
  targetRoute: string;
  completionCheck: (barId: string) => Promise<{ complete: boolean; count: number }>;
  isMandatory: boolean;
  delegationHint?: string;
}

// Welcome & Role detection
import { WelcomeStep } from './WelcomeStep';
import { RoleDetectedStep } from './RoleDetectedStep';

// Owner components
import { BarDetailsStep } from './BarDetailsStep';
// Removed duplicated steps import (AddProducts, SetupStaff etc replaced by RedirectStep)
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
import { LoadingFallback } from '../LoadingFallback';

// Configuration des étapes propriétaire avec redirection
const OWNER_REDIRECT_STEPS: Record<string, RedirectStepConfig> = {
  [OnboardingStep.OWNER_ADD_PRODUCTS]: {
    id: 'add-products',
    title: 'Ajouter des Produits',
    description: 'Créez votre catalogue de produits avec les prix locaux',
    icon: '🍻',
    targetRoute: '/inventory?mode=onboarding&task=add-products&tab=operations', // Fixed to operations where "Add Product" button is located
    completionCheck: OnboardingCompletionService.checkProductsAdded,
    isMandatory: false, // Modification: Rendre non obligatoire pour permettre de passer
    delegationHint: 'Vous pouvez aussi demander à votre gérant de faire cette tâche',
  },
  [OnboardingStep.OWNER_STOCK_INIT]: {
    id: 'init-stock',
    title: 'Vérifier le Stock',
    description: 'Initialisez ou ajustez les quantités des produits sans stock',
    icon: '📦',
    targetRoute: '/inventory?mode=onboarding&task=init-stock&tab=operations',
    completionCheck: OnboardingCompletionService.checkStockInitialized,
    isMandatory: false,
    delegationHint: 'Votre gérant peut aussi initialiser le stock',
  },
  [OnboardingStep.OWNER_SETUP_STAFF]: {
    id: 'add-servers',
    title: 'Créer Comptes Serveurs',
    description: 'Ajoutez vos baristas et serveurs',
    icon: '👥',
    targetRoute: '/team?mode=onboarding&task=add-servers',
    completionCheck: OnboardingCompletionService.checkServersAdded,
    isMandatory: false,
    delegationHint: 'Votre gérant peut créer les comptes serveurs',
  },
  [OnboardingStep.OWNER_ADD_MANAGERS]: {
    id: 'add-managers',
    title: 'Ajouter des Gérants',
    description: 'Invitez des gérants pour superviser le bar',
    icon: '👔',
    targetRoute: '/team?mode=onboarding&task=add-managers',
    completionCheck: OnboardingCompletionService.checkManagersAdded,
    isMandatory: false,
    delegationHint: undefined, // Pas de délégation (owner-only)
  },
};

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
    updateBarId,
    userId,
    userRole,
    barId: contextBarId,
    nextStep, // We need nextStep for the RedirectStep callback
    completeOnboarding, // Needed for final step persistence
    barIsAlreadySetup, // Needed to check context mode
    isHydrating // Consuming hydration state
  } = useOnboarding();
  const { currentSession, refreshSession } = useAuth(); // Destructure refreshSession
  const { currentBar, barMembers } = useBar();

  // Check if user has permission to access onboarding
  // Rule: Only bar owner (promoteur) can always access onboarding
  // Manager/Bartender can only access if explicitly invited (role exists in bar_members)
  useEffect(() => {
    if (!currentSession?.userId || !currentBar?.id) return;

    const isBarOwner = String(currentBar.ownerId) === String(currentSession.userId);
    const userBarMember = barMembers?.find(
      (m: any) => String(m.userId) === String(currentSession.userId)
    );

    // PERMISSION CHECK:
    // - Bar owner (promoteur): Always allowed
    // - Manager (gerant): Only allowed if explicitly added to bar_members with role 'gerant'
    // - Bartender (serveur): Only allowed if explicitly added to bar_members with role 'serveur'

    // Determine effective role from bar membership directly (source of truth before onboarding init)
    const memberRole = userBarMember?.role;
    const isManager = memberRole === 'gerant';
    const isBartender = memberRole === 'serveur';

    if (!isBarOwner && !isManager && !isBartender) {
      // User does not have permission to access onboarding
      // Redirect to dashboard
      console.warn(
        `Access denied: User ${currentSession.userId} tried to access onboarding for bar ${currentBar.id} without permission`
      );
      navigate('/dashboard', { replace: true });
      return;
    }

    // Guard: Prevent re-initialization ONLY if we are in the correct mode.
    // We are in OnboardingFlow (Setup), so we expect barIsAlreadySetup to be FALSE.
    // If context is initialized (userId) AND barIsAlreadySetup is FALSE, we are good to keep state.
    // If barIsAlreadySetup is TRUE (Training residue), we MUST re-initialize.
    if (userId && barIsAlreadySetup === false) return;

    if (currentSession && currentBar && barMembers) {
      // Determine role: use bar member role if found, prioritize owner role if user is bar owner
      let role: UserRole = 'serveur'; // default

      if (userBarMember?.role) {
        role = String(userBarMember.role) as UserRole;
      }

      // If user is the bar owner, ensure they have promoteur/owner role
      if (isBarOwner) {
        role = 'promoteur';
      }

      initializeOnboarding(
        String(currentSession.userId),
        String(currentBar.id),
        role,
        currentBar.isSetupComplete || false
      );
    }
  }, [currentSession?.userId, currentBar?.id, currentBar?.ownerId, barMembers, userRole, userId, initializeOnboarding, navigate]);

  // Sync onboarding context barId with currentBar when user switches bars
  // This triggers the reset and hydration effects in OnboardingContext
  useEffect(() => {
    if (currentBar?.id && contextBarId !== currentBar.id) {
      updateBarId(currentBar.id);
    }
  }, [currentBar?.id, contextBarId, updateBarId]);

  // Render appropriate component based on current step
  const renderStep = () => {
    // Étapes avec redirection configurée
    if (OWNER_REDIRECT_STEPS[currentStep]) {
      const config = OWNER_REDIRECT_STEPS[currentStep];
      return (
        <RedirectStep
          config={config}
          onComplete={nextStep}
          onSkip={!config.isMandatory ? nextStep : undefined}
        />
      );
    }

    // Étapes spéciales (formulaires inline)
    switch (currentStep) {
      // Welcome & Role detection
      case OnboardingStep.WELCOME:
        return <WelcomeStep />;
      case OnboardingStep.ROLE_DETECTED:
        return <RoleDetectedStep />;

      // Owner/Promoter path
      case OnboardingStep.OWNER_BAR_DETAILS:
        return <BarDetailsStep />;
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
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-8 md:p-10 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center text-3xl">
                🎉
              </div>
              <h1 className="text-h1 text-gray-900 mb-2">Configuration terminée</h1>
              <p className="text-body text-gray-500 mb-8">Votre bar est prêt à être utilisé.</p>
              <button
                onClick={async () => {
                  try {
                    await completeOnboarding();
                    console.log('Onboarding marked as complete');
                    await refreshSession();
                    console.log('Session refreshed');
                  } catch (e) {
                    console.error("Erreur lors de la complétion:", e);
                  }
                  navigate('/dashboard', { replace: true });
                }}
                className="btn-brand h-11 rounded-xl px-6 text-body-sm font-semibold"
              >
                Aller au tableau de bord
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="w-full max-w-2xl mx-auto px-4">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-8 text-center">
              <p className="text-body-sm text-gray-500">Chargement de l'onboarding…</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative overflow-hidden">
      {/* Progress indicator - sticky at top */}
      <OnboardingProgressBar />

      {/* Step content */}
      <div className="py-10 relative z-10">
        {isHydrating ? (
          <LoadingFallback />
        ) : (
          renderStep()
        )}
      </div>
    </div>
  );
};
