import React from 'react';
import {
  BarChart3,
  Package,
  Zap,
  RotateCcw,
  TrendingUp,
  FileSpreadsheet,
  Home,
  User
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useViewport } from '../hooks/useViewport';

interface MobileNavigationProps {
  onShowSales: () => void;
  onShowInventory: () => void;
  onShowQuickSale: () => void;
  onShowReturns: () => void;
  onShowStockAlerts: () => void;
  onShowExcel: () => void;
}

interface NavItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
  roles: Array<'promoteur' | 'gerant' | 'serveur'>;
}

export function MobileNavigation({
  onShowSales,
  onShowInventory,
  onShowQuickSale,
  onShowReturns,
  onShowStockAlerts,
  onShowExcel
}: MobileNavigationProps) {
  const { currentSession } = useAuth();
  const { isMobile } = useViewport();

  if (!isMobile) {
    return null;
  }

  const allNavItems: NavItem[] = [
    {
      icon: <Zap size={24} />,
      label: 'Vente',
      onClick: onShowQuickSale,
      color: 'text-orange-600',
      roles: ['serveur', 'gerant', 'promoteur']
    },
    {
      icon: <BarChart3 size={24} />,
      label: 'Historique',
      onClick: onShowSales,
      color: 'text-orange-600',
      roles: ['gerant', 'promoteur']
    },
    {
      icon: <Package size={24} />,
      label: 'Inventaire',
      onClick: onShowInventory,
      color: 'text-orange-600',
      roles: ['gerant', 'promoteur']
    },
    {
      icon: <TrendingUp size={24} />,
      label: 'Prévisions',
      onClick: onShowStockAlerts,
      color: 'text-orange-600',
      roles: ['gerant', 'promoteur']
    },
    {
      icon: <RotateCcw size={24} />,
      label: 'Retours',
      onClick: onShowReturns,
      color: 'text-orange-600',
      roles: ['gerant', 'promoteur']
    },
    {
      icon: <FileSpreadsheet size={24} />,
      label: 'Import/Export',
      onClick: onShowExcel,
      color: 'text-orange-600',
      roles: ['gerant', 'promoteur']
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
            onClick={item.onClick}
            className="flex-1 flex flex-col items-center justify-center gap-1 h-full active:bg-orange-50 transition-colors"
            aria-label={item.label}
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