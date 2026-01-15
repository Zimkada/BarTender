import { DailyDashboard } from '../components/DailyDashboard';
import { useAutoGuide } from '../hooks/useGuideTrigger';
import { useOnboarding } from '../context/OnboardingContext';
import { useGuide } from '../context/GuideContext';
import { useAuth } from '../context/AuthContext';

/**
 * Page Dashboard - Wrapper pour le composant DailyDashboard
 * Route: /dashboard
 * Integrates: Guide system (dashboard-overview guide)
 */
export default function DashboardPage() {
  const { isComplete: onboardingComplete } = useOnboarding();
  const { hasCompletedGuide } = useGuide();
  const { currentSession } = useAuth();

  const role = currentSession?.role;

  // Choose the right guide base on role
  let tourId = 'dashboard-overview';
  if (role === 'gerant') tourId = 'manager-dashboard';
  if (role === 'serveur') tourId = 'create-first-sale';

  // Trigger dashboard guide after onboarding (first visit only)
  useAutoGuide(
    tourId,
    onboardingComplete && !hasCompletedGuide(tourId),
    { delay: 2000 }
  );

  return <DailyDashboard />;
}
