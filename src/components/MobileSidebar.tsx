import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Zap,
  BarChart3,
  Calendar,
  Package,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  X,
  DollarSign,
  RotateCcw,
  Archive,
  ShieldCheck,
  Bell,
  FileText,
  Building2,
  UserCog,
  User,
  Globe,
  Gift,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './ui/IconButton';
import { networkManager } from '../services/NetworkManager';
import { useNotifications } from './Notifications';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentMenu?: string;
  onShowQuickSale: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles: ('super_admin' | 'promoteur' | 'gerant' | 'serveur')[];
  action?: () => void;
  path?: string;
}

export function MobileSidebar({
  isOpen,
  onClose,
  currentMenu,
  onShowQuickSale,
}: MobileSidebarProps) {
  const { currentSession, logout } = useAuth();
  const navigate = useNavigate();
  const { showNotification } = useNotifications();

  // 🛡️ Monitor network status
  const [isOffline, setIsOffline] = React.useState(!networkManager.isOnline());

  React.useEffect(() => {
    return networkManager.subscribe(() => {
      setIsOffline(!networkManager.isOnline());
    });
  }, []);

  const handleLogout = () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      logout();
      onClose();
    }
  };

  const menuItems: MenuItem[] = [
    // Super Admin menus
    { id: 'adminDashboard', label: 'Dashboard Admin', icon: <ShieldCheck size={20} />, roles: ['super_admin'], path: '/admin' },
    { id: 'globalCatalog', label: 'Catalogue Global', icon: <Globe size={20} />, roles: ['super_admin'], path: '/admin/catalog' },
    { id: 'barsManagement', label: 'Gestion des Bars', icon: <Building2 size={20} />, roles: ['super_admin'], path: '/admin/bars' },
    { id: 'usersManagement', label: 'Gestion des Utilisateurs', icon: <UserCog size={20} />, roles: ['super_admin'], path: '/admin/users' },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={20} />, roles: ['super_admin'], path: '/admin/notifications' },
    { id: 'auditLogs', label: 'Audit Logs', icon: <FileText size={20} />, roles: ['super_admin'], path: '/admin/audit-logs' },

    // Regular menus
    { id: 'home', label: 'Accueil', icon: <Home size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/' },
    { id: 'quickSale', label: 'Vente rapide', icon: <Zap size={20} />, roles: ['promoteur', 'gerant', 'serveur'], action: onShowQuickSale },
    { id: 'dailyDashboard', label: 'Tableau de bord', icon: <Calendar size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/dashboard' },
    { id: 'history', label: 'Historique', icon: <BarChart3 size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/sales' },
    { id: 'inventory', label: 'Inventaire', icon: <Package size={20} />, roles: ['promoteur', 'gerant'], path: '/inventory' },
    { id: 'stockAlerts', label: 'Prévisions et IA', icon: <TrendingUp size={20} />, roles: ['promoteur', 'gerant'], path: '/forecasting' },
    { id: 'returns', label: 'Retours', icon: <RotateCcw size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/returns' },
    { id: 'consignments', label: 'Consignations', icon: <Archive size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/consignments' },
    { id: 'teamManagement', label: "Gestion de l'Équipe", icon: <Users size={20} />, roles: ['promoteur', 'gerant'], path: '/team' },
    { id: 'promotions', label: 'Promotions', icon: <Gift size={20} />, roles: ['promoteur', 'gerant'], path: '/promotions' },
    { id: 'settings', label: 'Paramètres', icon: <Settings size={20} />, roles: ['promoteur', 'gerant'], path: '/settings' },
    { id: 'profile', label: 'Mon Profil', icon: <User size={20} />, roles: ['super_admin', 'promoteur', 'gerant', 'serveur'], path: '/profil' },
    { id: 'accounting', label: 'Comptabilité', icon: <DollarSign size={20} />, roles: ['promoteur'], path: '/accounting' }
  ];

  const visibleMenus = menuItems.filter(item =>
    currentSession && item.roles.includes(currentSession.role as any)
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110]"
          />

          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed top-0 left-0 bottom-0 w-72 shadow-2xl z-[120] flex flex-col ${currentSession?.role === 'super_admin'
              ? 'bg-gradient-to-br from-purple-50 to-indigo-50'
              : 'bg-brand-subtle'
              }`}
          >
            <div className={`flex items-center justify-between p-4 border-b ${currentSession?.role === 'super_admin'
              ? 'border-purple-200 bg-gradient-to-r from-purple-600 to-indigo-600'
              : 'border-brand-subtle bg-brand-gradient'
              }`}>
              <div className="flex items-center gap-2">
                {currentSession?.role === 'super_admin' && (
                  <img src="/icons/icon-48x48.png" alt="BarTender" className="w-6 h-6 flex-shrink-0 rounded" />
                )}
                <h2 className="text-white font-bold text-lg">
                  {currentSession?.role === 'super_admin' ? 'BarTender Pro Administration' : 'Menu'}
                </h2>
              </div>
              <IconButton onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors" aria-label="Fermer le menu">
                <X size={24} />
              </IconButton>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {visibleMenus.map((item) => {
                const isQuickSale = item.id === 'quickSale';
                const isDisabled = isQuickSale && isOffline;

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => {
                      if (isDisabled) {
                        showNotification('error', "Vente rapide indisponible hors connexion. Utilisez l'onglet Accueil (Panier).");
                        return;
                      }
                      if (item.path) {
                        navigate(item.path);
                      } else if (item.action) {
                        item.action();
                      }
                      onClose();
                    }}
                    whileHover={isDisabled ? {} : { scale: 1.02, x: 4 }}
                    whileTap={isDisabled ? {} : { scale: 0.98 }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${currentMenu === item.id
                      ? currentSession?.role === 'super_admin'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-brand-primary text-white shadow-md'
                      : isDisabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        : 'bg-white/60 text-gray-700 hover:bg-white hover:shadow-sm'
                      }`}
                  >
                    <span className={currentMenu === item.id ? 'text-white' : (isDisabled ? 'text-gray-300' : (currentSession?.role === 'super_admin' ? 'text-purple-600' : 'text-brand-primary'))}>
                      {item.icon}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className={`p-4 border-t space-y-2 ${currentSession?.role === 'super_admin' ? 'border-purple-200' : 'border-brand-subtle'}`}>
              <motion.button
                onClick={handleLogout}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors shadow-md"
              >
                <LogOut size={20} />
                <span>Déconnexion</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
