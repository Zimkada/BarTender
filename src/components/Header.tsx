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
import { OfflineIndicator } from './OfflineIndicator';
import { NetworkIndicator } from './NetworkIndicator';
import { SyncButton } from './SyncButton';
import { useViewport } from '../hooks/useViewport';

interface HeaderProps {
  onShowSales: () => void;
  onShowSettings: () => void;
  onShowInventory: () => void;
  onShowServers: () => void;
  onShowCreateBar?: () => void;
  onSwitchToServer?: () => void;
  onShowDailyDashboard: () => void;
  onShowExcel: () => void;
  onShowReturns: () => void;
  onShowQuickSale: () => void;
  onShowStockAlerts?: () => void;
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
  onShowExcel,
  onShowReturns,
  onShowQuickSale,
  onShowStockAlerts = () => {},
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
      <header className="bg-gradient-to-r from-yellow-400 to-amber-400 shadow-lg sticky top-0 z-50">
        <div className="px-3 py-2">
          {/* Ligne 1: Hamburger + Logo + Actions */}
          <div className="flex items-center gap-2 mb-2">
            {/* Bouton Menu Hamburger */}
            <button
              onClick={onToggleMobileSidebar}
              className="p-1.5 bg-white/20 rounded-lg text-white active:scale-95 transition-transform flex-shrink-0"
              aria-label="Menu"
            >
              <Menu size={18} />
            </button>

            {/* Logo + Nom bar */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <h1 className="text-sm font-bold text-white truncate">
                🍺 {currentBar?.name || 'BarTender'}
              </h1>
            </div>

            {/* Indicateurs + Actions (compacts) */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <OfflineIndicator />
              <NetworkIndicator />
              <SyncButton />
              <button
                onClick={logout}
                className="p-1.5 bg-red-500/80 rounded-lg text-white active:scale-95 transition-transform"
                aria-label="Déconnexion"
              >
                <LogOut size={16} />
              </button>
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
    <header className="bg-gradient-to-r from-yellow-400 to-amber-400 shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Gauche: Logo + Indicateurs + Bar selector */}
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">🍺 BarTender Pro</h1>

            <div className="flex items-center gap-2">
              <OfflineIndicator />
              <NetworkIndicator />
              <SyncButton />
            </div>

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

          {/* Droite: Stats + User + Actions */}
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

            {/* Actions toolbar */}
            <div className="flex items-center gap-2">
              {/* Prévisions */}
              <RoleBasedComponent requiredPermission="canViewInventory">
                <button
                  onClick={onShowStockAlerts}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors relative"
                  title="Prévisions"
                >
                  <TrendingUp size={20} />
                  {alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {alertCount}
                    </span>
                  )}
                </button>
              </RoleBasedComponent>

              {/* Vente rapide */}
// ...
              <RoleBasedComponent requiredPermission="canManageInventory">
                <button
                  onClick={onShowExcel}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Import/Export"
                >
                  <FileSpreadsheet size={20} />
                </button>
              </RoleBasedComponent>

              {/* Inventaire */}
              <RoleBasedComponent requiredPermission="canViewInventory">
                <button
                  onClick={onShowInventory}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Inventaire"
                >
                  <Package size={20} />
                </button>
              </RoleBasedComponent>

              {/* Retours */}
              <RoleBasedComponent requiredPermission="canManageInventory">
                <button
                  onClick={onShowReturns}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Retours"
                >
                  <RotateCcw size={20} />
                </button>
              </RoleBasedComponent>

              {/* Consignations */}
              <RoleBasedComponent requiredPermission="canCreateConsignment">
                <button
                  onClick={onShowConsignment}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Consignations"
                >
                  <Archive size={20} />
                </button>
              </RoleBasedComponent>

              {/* Gestion équipe */}
              <RoleBasedComponent requiredPermission="canCreateServers">
                <button
                  onClick={onShowServers}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Gestion de l'équipe"
                >
                  <UserCog size={20} />
                </button>
              </RoleBasedComponent>

              {/* Paramètres */}
              <RoleBasedComponent requiredPermission="canManageSettings">
                <button
                  onClick={onShowSettings}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Paramètres"
                >
                  <Settings size={20} />
                </button>
              </RoleBasedComponent>

              {/* Comptabilité */}
              <RoleBasedComponent requiredPermission="canViewAccounting">
                <button
                  onClick={onShowAccounting}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Comptabilité"
                >
                  <DollarSign size={20} />
                </button>
              </RoleBasedComponent>

              {/* Mode serveur */}
              <RoleBasedComponent requiredPermission="canSwitchBars">
                {onSwitchToServer && (
                  <button
                    onClick={onSwitchToServer}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                    title="Mode Serveur"
                  >
                    <Users size={20} />
                  </button>
                )}
              </RoleBasedComponent>

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
      </div>
    </header>
  );
}
