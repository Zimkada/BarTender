import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Package,
  Zap,
  RotateCcw,
  FileSpreadsheet,
  LayoutDashboard
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useViewport } from '../hooks/useViewport';
import { networkManager } from '../services/NetworkManager';
import { useNotifications } from './Notifications';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path?: string;
  onClick?: () => void;
  color: string;
  roles: Array<'promoteur' | 'gerant' | 'serveur'>;
}

interface MobileNavigationProps {
  onShowQuickSale: () => void;
}

export function MobileNavigation({ onShowQuickSale }: MobileNavigationProps) {
  const { currentSession } = useAuth();
  const { isMobile } = useViewport();
  const navigate = useNavigate();
  const { showNotification } = useNotifications();

  // 🛡️ Monitor network status
  const [isOffline, setIsOffline] = React.useState(!networkManager.isOnline());

  React.useEffect(() => {
    return networkManager.subscribe(() => {
      setIsOffline(!networkManager.isOnline());
    });
  }, []);

  if (!isMobile) {
    return null;
  }

  const allNavItems: NavItem[] = [
    {
      icon: <Zap size={24} />,
      label: 'Vente',
      onClick: () => {
        if (isOffline) {
          showNotification('error', "Vente rapide indisponible hors connexion. Utilisez l'onglet Panier.");
          return;
        }
        onShowQuickSale();
      },
      color: isOffline ? 'text-gray-400 opacity-40' : 'text-brand-primary',
      roles: ['promoteur', 'gerant', 'serveur']
    },
    {
      icon: <LayoutDashboard size={24} />,
      // ... rest of the items ...
      label: 'Dashboard',
      path: '/dashboard',
      color: 'text-blue-600',
      roles: ['promoteur', 'gerant', 'serveur']
    },
    {
      icon: <BarChart3 size={24} />,
      label: 'Historique',
      path: '/sales',
      color: 'text-purple-600',
      roles: ['promoteur', 'gerant', 'serveur']
    },
    {
      icon: <Package size={24} />,
      label: 'Inventaire',
      path: '/inventory',
      color: 'text-green-600',
      roles: ['promoteur', 'gerant']
    },
    /* {
      icon: <TrendingUp size={24} />,
      label: 'Prévisions et IA',
      path: '/forecasting',
      color: 'text-indigo-600',
      roles: ['promoteur', 'gerant']
    }, */
    {
      icon: <RotateCcw size={24} />,
      label: 'Retours',
      path: '/returns',
      color: 'text-red-600',
      roles: ['promoteur', 'gerant', 'serveur']
    },
    {
      icon: <FileSpreadsheet size={24} />,
      label: 'Import/Export',
      path: '/settings',
      color: 'text-teal-600',
      roles: ['promoteur', 'gerant']
    }
  ];

  const navItems = allNavItems.filter(item =>
    item.roles.includes(currentSession?.role as any)
  );

  const displayedItems = navItems.slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 pb-safe">
      <div className="flex justify-around items-center h-16">
        {displayedItems.map((item, index) => (
          <button
            key={index}
            onClick={item.path ? () => navigate(item.path!) : item.onClick}
            className="flex-1 flex flex-col items-center justify-center gap-1 h-full active:bg-brand-primary/5 transition-colors"
            aria-label={item.label}
            {...(index === 0 ? { 'data-guide': 'quick-sale-btn' } : {})}
          >
            <span className={item.color}>
              {item.icon}
            </span>
            <span className="text-xs font-medium text-gray-700">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
