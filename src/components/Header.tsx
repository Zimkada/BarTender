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
  AlertTriangle
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
import { FileSpreadsheet } from 'lucide-react';


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
  onShowStockAlerts = () => {} // Provide a default no-op function
}: HeaderProps) {
  const { getTodayTotal } = useAppContext();
  const formatPrice = useCurrencyFormatter();
  const { currentSession, logout } = useAuth();
  const { currentBar } = useBarContext();
  
  const todayTotal = getTodayTotal();

  // TODO: Replace this with actual alert count logic
  const alertCount = 0;

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

  return (
    <header className="bg-gradient-to-r from-yellow-400 to-amber-400 shadow-lg">
      <div className="container mx-auto px-2 md:px-4 py-2 md:py-4">
        {/* Version mobile ultra-compacte */}
        <div className="block md:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <h1 className="text-sm font-bold text-white">BarTender</h1>
              <OfflineIndicator />
              <NetworkIndicator />
            </div>

            <div className="flex items-center gap-1">
              <SyncButton />
              <motion.button
                onClick={onShowQuickSale}
                className="p-1.5 bg-white/20 rounded text-white"
                title="Vente rapide"
              >
                <Zap size={16} />
              </motion.button>
              <motion.button
                onClick={logout}
                className="p-1.5 bg-red-500/80 rounded text-white"
                title="Déconnexion"
              >
                <LogOut size={16} />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Version desktop */}
        <div className="hidden md:flex items-center justify-between mobile-header flex-wrap md:flex-nowrap">
          <div className="flex items-center gap-2 md:gap-4">
            <h1 className="text-lg md:text-2xl font-bold text-white">BarTender Pro</h1>
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
              <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1">
                <Building2 size={16} className="text-white" />
                <span className="text-white font-medium">{currentBar.name}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            {/* Ventes du jour */}
            <motion.div
              className="bg-white/20 backdrop-blur-sm rounded-lg px-2 md:px-4 py-1 md:py-2 hidden sm:block"
              whileHover={{ scale: 1.02 }}
            >
              <p className="text-white/80 text-sm">Ventes du jour</p>
              <p className="text-white text-xl font-bold">{formatPrice(todayTotal)}</p>
            </motion.div>

            {/* User info & Actions */}
            <div className="flex items-center gap-4">
              {/* User info */}
              <div className="text-right">
                <p className="text-white font-medium">{currentSession?.userName}</p>
                <p className="text-white/80 text-sm flex items-center justify-end gap-1">
                  {getRoleIcon()}
                  {getRoleLabel()}
                </p>
              </div>
              
              {/* Systeme alertes stock */}
              <RoleBasedComponent requiredPermission="canViewInventory">
                <motion.button
                  onClick={onShowStockAlerts}
                  className="bg-white/20 rounded-lg text-white hover:bg-white/30 relative touch-target thumb-friendly tap-zone"
                  title="Alertes stock"
                >
                  <AlertTriangle size={20} />
                  {alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {alertCount}
                    </span>
                  )}
                </motion.button>
              </RoleBasedComponent>

              <motion.button
                onClick={onShowQuickSale}
                className="bg-white/20 rounded-lg text-white hover:bg-white/30 touch-target thumb-friendly tap-zone"
                title="Vente rapide"
              >
                <Zap size={20} />
              </motion.button>

              {/* Action buttons */}
              <div className="flex items-center gap-1 md:gap-2">
                {/* Point du jour - visible pour tous */}
                <motion.button
                  onClick={onShowDailyDashboard}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                  title="Point du jour"
                >
                  <DollarSign size={20} />
                </motion.button>


                {/* Historique des ventes - pas pour serveurs */}
                <RoleBasedComponent requiredPermission="canViewAllSales">
                  <motion.button
                    onClick={onShowSales}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                    title="Historique des ventes"
                  >
                    <BarChart3 size={20} />
                  </motion.button>
                </RoleBasedComponent>

                {/* Import/Export Excel - visible pour tous */}
                <RoleBasedComponent requiredPermission="canManageInventory">
                  <motion.button
                    onClick={onShowExcel}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30"
                    title="Import/Export Excel"
                  >
                    <FileSpreadsheet size={20} />
                  </motion.button>
                </RoleBasedComponent>

                {/* Inventaire - gérants et promoteurs */}
                <RoleBasedComponent requiredPermission="canViewInventory">
                  <motion.button
                    onClick={onShowInventory}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                    title="Inventaire"
                  >
                    <Package size={20} />
                  </motion.button>
                </RoleBasedComponent>

                <RoleBasedComponent requiredPermission="canManageInventory">
                  <motion.button
                    onClick={onShowReturns}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30"
                    title="Retours"
                  >
                    <RotateCcw size={20} />
                  </motion.button>
                </RoleBasedComponent>



                {/* Gestion équipe - gérants et promoteurs */}
                <RoleBasedComponent requiredPermission="canCreateServers">
                  <motion.button
                    onClick={onShowServers}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                    title="Gestion de l'équipe"
                  >
                    <UserCog size={20} />
                  </motion.button>
                </RoleBasedComponent>

                {/* Paramètres - promoteurs uniquement */}
                <RoleBasedComponent requiredPermission="canManageSettings">
                  <motion.button
                    onClick={onShowSettings}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                    title="Paramètres"
                  >
                    <Settings size={20} />
                  </motion.button>
                </RoleBasedComponent>

                {/* Switch mode - pas pour serveurs */}
                <RoleBasedComponent requiredPermission="canSwitchBars">
                  {onSwitchToServer && (
                    <motion.button
                      onClick={onSwitchToServer}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
                      title="Mode Serveur"
                    >
                      <Users size={20} />
                    </motion.button>
                  )}
                </RoleBasedComponent>


                {/* Déconnexion */}
                <motion.button
                  onClick={logout}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-red-500/80 rounded-lg text-white hover:bg-red-600/80 transition-colors touch-target thumb-friendly tap-zone"
                  title="Déconnexion"
                >
                  <LogOut size={20} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}