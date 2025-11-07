import React from 'react';
import {
  BarChart3,
  Settings,
  Package,
  Users,
  UserCog,
  LogOut,
  Crown,
  Building2,
  DollarSign,
  RotateCcw,
  Zap,
  TrendingUp, // Pour les prévisions (anciennement AlertTriangle)
  FileSpreadsheet,
  Menu,
  Calendar,
  Archive // Pour les consignations
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useAuth } from "../context/AuthContext";
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { RoleBasedComponent } from './RoleBasedComponent';
import { BarSelector } from './BarSelector';
import { SyncStatusBadge } from './SyncStatusBadge'; // ✅ Badge sync unifié (remplace OfflineIndicator, NetworkIndicator, SyncButton)
import { useViewport } from '../hooks/useViewport';

interface HeaderProps {
  onShowSales: () => void;
  onShowSettings: () => void;
  onShowInventory: () => void;
  onShowServers: () => void;
  onShowCreateBar?: () => void;
  onSwitchToServer?: () => void;
  onShowDailyDashboard: () => void;
  onShowReturns: () => void;
  onShowQuickSale: () => void;
  onShowForecasting?: () => void;
  onToggleMobileSidebar?: () => void;
  onShowAccounting?: () => void;
  onShowConsignment?: () => void;
}

export function Header({
  onShowSales,
  onShowSettings,
  onShowInventory,
  onShowServers,
  onShowCreateBar,
  onSwitchToServer,
  onShowDailyDashboard,
  onShowReturns,
  onShowQuickSale,
  onShowForecasting = () => {},
  onToggleMobileSidebar = () => {},
  onShowAccounting = () => {},
  onShowConsignment = () => {}
}: HeaderProps) {
  const { getTodayTotal } = useAppContext();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession, logout } = useAuth();
  const { currentBar } = useBarContext();
  const { isMobile } = useViewport();

  const todayTotal = getTodayTotal();
  const alertCount = 0; // TODO: Implémenter compteur alertes réel

  const getRoleIcon = () => {
    switch (currentSession?.role) {
      case 'promoteur': return <Crown size={16} className="text-purple-600" />;
      case 'gerant': return <Settings size={16} className="text-orange-600" />;
      case 'serveur': return <Users size={16} className="text-amber-600" />;
      default: return null;
    }
  };

  const getRoleLabel = () => {
    switch (currentSession?.role) {
      case 'promoteur': return 'Promoteur';
      case 'gerant': return 'Gérant';
      case 'serveur': return 'Serveur';
      default: return '';
    }
  };

  // ==================== VERSION MOBILE (99% utilisateurs Bénin) ====================
  if (isMobile) {
    return (
      <header className="bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg sticky top-0 z-50">
        <div className="px-3 py-2">
          {/* Ligne 1: Hamburger (position absolue) + Logo + Actions */}
          <div className="relative flex items-center gap-2 mb-2">
            {/* Bouton Menu Hamburger - Position absolue garantit visibilité sur tous écrans */}
            <button
              onClick={onToggleMobileSidebar}
              className="absolute left-0 z-10 p-2 bg-gray-900/90 rounded-lg text-white active:scale-95 transition-all shadow-lg border-2 border-white/40"
              aria-label="Menu"
            >
              <Menu size={22} className="stroke-[2.5]" />
            </button>

            {/* Contenu avec padding-left pour éviter chevauchement avec hamburger */}
            <div className="flex items-center gap-2 pl-12 w-full">
              {/* Logo + Nom bar */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <h1 className="text-sm font-bold text-white truncate">
                  🍺 {currentBar?.name || 'BarTender'}
                </h1>
              </div>

              {/* Indicateurs + Actions (compacts) */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* ✅ Nouveau badge sync unifié (remplace OfflineIndicator + NetworkIndicator + SyncButton) */}
                <SyncStatusBadge compact position="header" />
                <button
                  onClick={logout}
                  className="p-1.5 bg-red-500/80 rounded-lg text-white active:scale-95 transition-transform"
                  aria-label="Déconnexion"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Ligne 2: Ventes du jour (info principale) */}
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-white/80 text-xs font-medium">Ventes du jour</p>
                <p className="text-white text-lg font-bold tracking-tight">
                  {formatPrice(todayTotal)}
                </p>
              </div>

              {/* Badge rôle */}
              <div className="flex items-center gap-1 bg-white/20 rounded-full px-3 py-1">
                {getRoleIcon()}
                <span className="text-white text-xs font-medium">{getRoleLabel()}</span>
              </div>
            </div>
          </div>

          {/* Ligne 3: Nom utilisateur (si espace) */}
          {currentSession?.userName && (
            <p className="text-white/90 text-xs mt-1 text-center font-medium">
              {currentSession.userName}
            </p>
          )}
        </div>
      </header>
    );
  }

  // ==================== VERSION DESKTOP (1% promoteurs avec PC) ====================
  return (
    <header className="bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Gauche: Hamburger + Logo + Indicateurs + Bar selector */}
          <div className="flex items-center gap-4">
            {/* Bouton Menu Hamburger */}
            <button
              onClick={onToggleMobileSidebar}
              className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
              aria-label="Menu"
            >
              <Menu size={24} />
            </button>

            <h1 className="text-2xl font-bold text-white">🍺 BarTender Pro</h1>

            {/* ✅ Nouveau badge sync unifié (remplace OfflineIndicator + NetworkIndicator + SyncButton) */}
            <SyncStatusBadge position="header" />

            {/* Sélecteur de bar pour promoteur */}
            {currentSession?.role === 'promoteur' && (
              <BarSelector onCreateNew={onShowCreateBar} />
            )}

            {/* Nom du bar pour gérants/serveurs */}
            {currentSession?.role !== 'promoteur' && currentBar && (
              <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1.5">
                <Building2 size={18} className="text-white" />
                <span className="text-white font-medium">{currentBar.name}</span>
              </div>
            )}
          </div>

          {/* Droite: Stats + User + Déconnexion */}
          <div className="flex items-center gap-6">
            {/* Ventes du jour */}
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-white/80 text-sm">Ventes du jour</p>
              <p className="text-white text-2xl font-bold">{formatPrice(todayTotal)}</p>
            </div>

            {/* User info */}
            <div className="text-right">
              <p className="text-white font-medium">{currentSession?.userName}</p>
              <p className="text-white/80 text-sm flex items-center justify-end gap-1">
                {getRoleIcon()}
                {getRoleLabel()}
              </p>
            </div>

            {/* Déconnexion */}
            <button
              onClick={logout}
              className="p-2 bg-red-500/80 rounded-lg text-white hover:bg-red-600/80 transition-colors"
              title="Déconnexion"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
