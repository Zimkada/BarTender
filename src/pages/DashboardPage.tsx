// src/pages/DashboardPage.tsx
import { useEffect } from 'react';
import { DailyDashboard } from '../components/DailyDashboard';
import { useAutoGuide } from '@/hooks/useGuideTrigger';
import { useOnboarding } from '@/context/OnboardingContext';
import { useGuide } from '@/context/GuideContext';
import { GuideTourModal } from '@/components/guide/GuideTourModal';

/**
 * Page Dashboard - Wrapper pour le composant DailyDashboard
 * Route: /dashboard
 * Integrates: Guide system (dashboard-overview guide)
 */
export default function DashboardPage() {
  const { isComplete: onboardingComplete } = useOnboarding();
  const { hasCompletedGuide } = useGuide();

  // Trigger dashboard guide after onboarding (first visit only)
  useAutoGuide(
    'dashboard-overview',
    onboardingComplete && !hasCompletedGuide('dashboard-overview'),
    { delay: 2000 }
  );

  return (
    <>
      <DailyDashboard />
      <GuideTourModal />
    </>
  );
}
