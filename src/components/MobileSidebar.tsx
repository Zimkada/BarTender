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
  Archive
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (menu: string) => void;
  currentMenu?: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles: ('promoteur' | 'gerant' | 'serveur')[];
  action: () => void;
}

export function MobileSidebar({ isOpen, onClose, onNavigate, currentMenu }: MobileSidebarProps) {
  const { currentSession, logout } = useAuth();

  const handleLogout = () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      logout();
      onClose();
    }
  };

  const menuItems: MenuItem[] = [
    {
      id: 'home',
      label: 'Accueil',
      icon: <Home size={20} />,
      roles: ['promoteur', 'gerant', 'serveur'],
      action: () => {
        onNavigate('home');
        onClose();
      }
    },
    {
      id: 'quickSale',
      label: 'Vente rapide',
      icon: <Zap size={20} />,
      roles: ['promoteur', 'gerant', 'serveur'],
      action: () => {
        onNavigate('quickSale');
        onClose();
      }
    },
    {
      id: 'dailyDashboard',
              label: 'Tableau de bord',      icon: <Calendar size={20} />,
      roles: ['promoteur', 'gerant', 'serveur'],
      action: () => {
        onNavigate('dailyDashboard');
        onClose();
      }
    },
    {
      id: 'history',
      label: 'Historique',
      icon: <BarChart3 size={20} />,
      roles: ['promoteur', 'gerant', 'serveur'],
      action: () => {
        onNavigate('history');
        onClose();
      }
    },
    {
      id: 'inventory',
      label: 'Inventaire',
      icon: <Package size={20} />,
      roles: ['promoteur', 'gerant'],
      action: () => {
        onNavigate('inventory');
        onClose();
      }
    },
    {
      id: 'stockAlerts',
      label: 'Prévisions',
      icon: <TrendingUp size={20} />,
      roles: ['promoteur', 'gerant'],
      action: () => {
        onNavigate('stockAlerts');
        onClose();
      }
    },
    {
      id: 'returns',
      label: 'Retours',
      icon: <RotateCcw size={20} />,
      roles: ['promoteur', 'gerant'],
      action: () => {
        onNavigate('returns');
        onClose();
      }
    },
    {
      id: 'consignments',
      label: 'Consignations',
      icon: <Archive size={20} />,
      roles: ['promoteur', 'gerant'],
      action: () => {
        onNavigate('consignments');
        onClose();
      }
    },
    {
      id: 'teamManagement',
      label: "Gestion de l'Équipe",
      icon: <Users size={20} />,
      roles: ['promoteur', 'gerant'],
      action: () => {
        onNavigate('teamManagement');
        onClose();
      }
    },
    {
      id: 'settings',
      label: 'Paramètres',
      icon: <Settings size={20} />,
      roles: ['promoteur', 'gerant'],
      action: () => {
        onNavigate('settings');
        onClose();
      }
    },
    {
      id: 'accounting',
      label: 'Comptabilité',
      icon: <DollarSign size={20} />,
      roles: ['promoteur'],
      action: () => {
        onNavigate('accounting');
        onClose();
      }
    }
  ];

  // Filtrer les menus selon le rôle
  const visibleMenus = menuItems.filter(item =>
    currentSession && item.roles.includes(currentSession.role)
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
            className="fixed top-0 left-0 bottom-0 w-72 bg-gradient-to-br from-yellow-50 to-amber-50 shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-orange-200 bg-gradient-to-r from-orange-500 to-amber-500">
              <div>
                <h2 className="text-white font-bold text-lg">Menu</h2>
                <p className="text-orange-100 text-xs">
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
                  onClick={item.action}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${
                    currentMenu === item.id
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-white/60 text-gray-700 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  <span className={currentMenu === item.id ? 'text-white' : 'text-orange-500'}>
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </motion.button>
              ))}
            </div>

            {/* Footer - Déconnexion */}
            <div className="p-4 border-t border-orange-200">
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
