import React from 'react';
import {
  BarChart3,
  Package,
  Zap,
  RotateCcw,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';
import { motion } from 'framer-motion';

interface MobileNavigationProps {
  onShowSales: () => void;
  onShowInventory: () => void;
  onShowQuickSale: () => void;
  onShowReturns: () => void;
  onShowStockAlerts: () => void;
  onShowExcel: () => void;
}

export function MobileNavigation({
  onShowSales,
  onShowInventory,
  onShowQuickSale,
  onShowReturns,
  onShowStockAlerts,
  onShowExcel
}: MobileNavigationProps) {
  const navItems = [
    {
      icon: <Zap size={20} />,
      label: 'Vente',
      onClick: onShowQuickSale,
      color: 'text-orange-600'
    },
    {
      icon: <Package size={20} />,
      label: 'Stock',
      onClick: onShowInventory,
      color: 'text-blue-600'
    },
    {
      icon: <BarChart3 size={20} />,
      label: 'Ventes',
      onClick: onShowSales,
      color: 'text-green-600'
    },
    {
      icon: <AlertTriangle size={20} />,
      label: 'Alertes',
      onClick: onShowStockAlerts,
      color: 'text-red-600'
    },
    {
      icon: <RotateCcw size={20} />,
      label: 'Retours',
      onClick: onShowReturns,
      color: 'text-purple-600'
    },
    {
      icon: <FileSpreadsheet size={20} />,
      label: 'Excel',
      onClick: onShowExcel,
      color: 'text-indigo-600'
    }
  ];

  return (
    <nav className="compact-nav md:hidden z-40">
      {navItems.map((item, index) => (
        <motion.button
          key={index}
          onClick={item.onClick}
          className="compact-nav-item"
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <span className={item.color}>
            {item.icon}
          </span>
          <span className="text-xs font-medium">
            {item.label}
          </span>
        </motion.button>
      ))}
    </nav>
  );
}