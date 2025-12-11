// src/layouts/AdminLayout.tsx
import { Link, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingFallback } from '../components/LoadingFallback';
import BarsManagementPanel from '../components/BarsManagementPanel';
import UsersManagementPanel from '../components/UsersManagementPanel';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Package, 
  FileText, 
  Bell,
  LogOut,
  Menu,
  X,
  ShieldCheck
} from 'lucide-react';

import { SalesService } from '../services/supabase/sales.service';
import { ReturnsService } from '../services/supabase/returns.service';
import { Sale, Return } from '../types';

const adminNavItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, isLink: true },
  { id: 'bars', label: 'Gestion des Bars', icon: Building2 },
  { id: 'users', label: 'Gestion des Utilisateurs', icon: Users },
  { path: '/admin/catalog', label: 'Catalogue Global', icon: Package, isLink: true },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: FileText, isLink: true },
  { path: '/admin/notifications', label: 'Notifications', icon: Bell, isLink: true },
];

function AdminLayoutContent() {
  const { isAuthenticated, currentSession, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [isBarsPanelOpen, setIsBarsPanelOpen] = useState(false);
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(false);

  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [allReturns, setAllReturns] = useState<Return[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Charger les données pour les panels qui en ont besoin (Bars)
  const loadDataForPanels = useCallback(async () => {
    if (currentSession?.role !== 'super_admin') return;
    try {
      setLoadingData(true);
      const [salesData, returnsData] = await Promise.all([
        SalesService.getAllSales(),
        ReturnsService.getAllReturns(),
      ]);
      setAllSales(salesData);
      setAllReturns(returnsData);
    } catch (error) {
      console.error("Erreur chargement données admin:", error);
    } finally {
      setLoadingData(false);
    }
  }, [currentSession]);

  useEffect(() => {
    loadDataForPanels();
  }, [loadDataForPanels]);

  const handleNavItemClick = (item: any) => {
    setIsSidebarOpen(false);
    if (item.id === 'bars') setIsBarsPanelOpen(true);
    else if (item.id === 'users') setIsUsersPanelOpen(true);
  };

  const isActiveRoute = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (currentSession && currentSession.role !== 'super_admin') return <Navigate to="/" replace />;
  
  // Note: On n'affiche le loader que si les panels ne gèrent pas leur propre chargement
  // if (loadingData) { return <LoadingFallback />; }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ... (Header) ... */}
      <div className="flex">
        {/* ... (Aside/Sidebar) ... */}
        <main className="flex-1 p-4 lg:p-8 min-h-screen">
          <Suspense fallback={<LoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
        
        <BarsManagementPanel 
          isOpen={isBarsPanelOpen} 
          onClose={() => setIsBarsPanelOpen(false)} 
          onShowBarStats={() => {}} 
        />
        
        <UsersManagementPanel
          isOpen={isUsersPanelOpen}
          onClose={() => setIsUsersPanelOpen(false)}
        />
      </div>
    </div>
  );
}

export function AdminLayout() {
  return <AdminLayoutContent />;
}
