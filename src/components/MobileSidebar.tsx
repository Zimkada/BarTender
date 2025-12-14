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
  Globe,
  Gift,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActingAs } from '../context/ActingAsContext';
import { useNavigate } from 'react-router-dom';

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
  const { isActingAs, stopActingAs } = useActingAs();
  const navigate = useNavigate();

  // Determine the role to use for menu filtering
  // If super_admin is in impersonation mode, show promoteur menus instead
  const displayRole = currentSession?.role === 'super_admin' && isActingAs()
    ? 'promoteur'
    : currentSession?.role;

  const handleLogout = () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      logout();
      onClose();
    }
  };

  const handleReturnToAdmin = () => {
    stopActingAs();
    navigate('/admin');
    onClose();
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
    { id: 'stockAlerts', label: 'Prévisions', icon: <TrendingUp size={20} />, roles: ['promoteur', 'gerant'], path: '/forecasting' },
    { id: 'returns', label: 'Retours', icon: <RotateCcw size={20} />, roles: ['promoteur', 'gerant'], path: '/returns' },
    { id: 'consignments', label: 'Consignations', icon: <Archive size={20} />, roles: ['promoteur', 'gerant'], path: '/consignments' },
    { id: 'teamManagement', label: "Gestion de l'Équipe", icon: <Users size={20} />, roles: ['promoteur', 'gerant'], path: '/team' },
    { id: 'promotions', label: 'Promotions', icon: <Gift size={20} />, roles: ['promoteur', 'gerant'], path: '/promotions' }, // Placeholder path
    { id: 'settings', label: 'Paramètres', icon: <Settings size={20} />, roles: ['promoteur', 'gerant'], path: '/settings' },
    { id: 'accounting', label: 'Comptabilité', icon: <DollarSign size={20} />, roles: ['promoteur'], path: '/accounting' }
  ];

  // Filtrer les menus selon le rôle (ou displayRole si en impersonation)
  const visibleMenus = menuItems.filter(item =>
    currentSession && item.roles.includes(displayRole as any)
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay sombre */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Barre latérale */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed top-0 left-0 bottom-0 w-72 shadow-2xl z-50 flex flex-col ${currentSession?.role === 'super_admin'
              ? 'bg-gradient-to-br from-purple-50 to-indigo-50'
              : 'bg-gradient-to-br from-amber-50 to-amber-50'
              }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${currentSession?.role === 'super_admin'
              ? 'border-purple-200 bg-gradient-to-r from-purple-600 to-indigo-600'
              : 'border-amber-200 bg-gradient-to-r from-amber-500 to-amber-500'
              }`}>
              <div>
                <h2 className="text-white font-bold text-lg">Menu</h2>
                <p className={currentSession?.role === 'super_admin' ? 'text-purple-100 text-xs' : 'text-amber-100 text-xs'}>
                  {currentSession?.userName} • {currentSession?.role}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Liste des menus */}
            <div className="flex-1 overflow-y-auto p-2">
              {visibleMenus.map((item) => (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    if (item.path) {
                      navigate(item.path);
                    } else if (item.action) {
                      item.action();
                    }
                    onClose();
                  }}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${currentMenu === item.id
                    ? currentSession?.role === 'super_admin'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-amber-500 text-white shadow-md'
                    : 'bg-white/60 text-gray-700 hover:bg-white hover:shadow-sm'
                    }`}
                >
                  <span className={currentMenu === item.id ? 'text-white' : (currentSession?.role === 'super_admin' ? 'text-purple-600' : 'text-amber-500')}>
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </motion.button>
              ))}
            </div>

            {/* Footer - Actions */}
            <div className="p-4 border-t border-amber-200 space-y-2">
              {/* Bouton retour à l'admin - visible seulement si en impersonation */}
              {currentSession?.role === 'super_admin' && isActingAs() && (
                <motion.button
                  onClick={handleReturnToAdmin}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-md"
                >
                  <ShieldCheck size={20} />
                  <span>Retour à l'Admin</span>
                </motion.button>
              )}

              {/* Bouton déconnexion */}
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

