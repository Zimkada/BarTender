import { useState } from 'react';
import { LayoutDashboard, ShoppingCart, BarChart3 } from 'lucide-react';
import { DailyDashboard } from '../components/DailyDashboard';
import { useAuth } from '../context/AuthContext';
import { useViewport } from '../hooks/useViewport';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';

export type DashboardViewMode = 'summary' | 'orders' | 'performance';

/**
 * Page Dashboard - Wrapper pour le composant DailyDashboard avec navigation par onglets
 * Route: /dashboard
 */
export default function DashboardPage() {
  const { currentSession } = useAuth();
  const { isMobile } = useViewport();
  const [viewMode, setViewMode] = useState<DashboardViewMode>('summary');

  const role = currentSession?.role;

  // Choose the right guide base on role
  let tourId = 'dashboard-overview';
  if (role === 'gerant') tourId = 'manager-dashboard';
  if (role === 'serveur') tourId = 'create-first-sale';

  // Formatage de la date pour le sous-titre
  const businessDate = getCurrentBusinessDateString();
  const [year, month, day] = businessDate.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);

  const formattedDate = dateObj.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  const tabsConfig = [
    { id: 'summary', label: isMobile ? 'Synthèse' : 'Synthèse du jour', icon: LayoutDashboard },
    { id: 'orders', label: isMobile ? 'Commandes' : 'Gestion Commandes', icon: ShoppingCart },
    { id: 'performance', label: 'Performance', icon: BarChart3 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
      <TabbedPageHeader
        title="Dashboard"
        subtitle={isMobile ? displayDate : `Suivi du ${displayDate}`}
        icon={<LayoutDashboard size={24} />}
        tabs={tabsConfig}
        activeTab={viewMode}
        onTabChange={(id) => setViewMode(id as DashboardViewMode)}
        guideId={tourId}
      />

      <main className="container mx-auto px-4 py-4 pb-24">
        <DailyDashboard activeView={viewMode} />
      </main>
    </div>
  );
}
