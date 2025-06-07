import React from 'react';
import { BarChart3, Cog, Clock, Warehouse, UserCheck, Users } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {
  onShowSales: () => void;
  onShowSettings: () => void;
  onShowInventory: () => void;
  onShowServers: () => void;  
  onSwitchToServer?: () => void;
}

export function Header({ onShowSales, onShowSettings, onShowInventory, onSwitchToServer, onShowServers}: HeaderProps) {
  const { getTodayTotal, formatPrice, getLowStockProducts } = useAppContext();
  
  const todayTotal = getTodayTotal();
  const lowStockCount = getLowStockProducts().length;

  return (
    <header className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bar POS</h1>
          <p className="text-gray-400 text-sm">
            Ventes du jour: <span className="text-teal-400 font-semibold">{formatPrice(todayTotal)}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {onSwitchToServer && (
            <button
              onClick={onSwitchToServer}
              className="p-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-all duration-200"
              title="Mode Serveur"
            >
              <UserCheck size={20} />
            </button>
          )}
          
          <button
            onClick={onShowServers}
            className="p-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-all duration-200"
            title="Gestion des serveurs"
          >
            <Users size={20} />
          </button>

          <button
            onClick={onShowInventory}
            className="relative p-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-all duration-200"
            title="Inventaire & Stock"
          >
            <Warehouse size={20} />
            {lowStockCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {lowStockCount}
              </span>
            )}
          </button>
          
          <button
            onClick={onShowSales}
            className="p-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-all duration-200"
            title="Historique des ventes"
          >
            <BarChart3 size={20} />
          </button>
          
          <button
            onClick={onShowSettings}
            className="p-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-all duration-200"
            title="Paramètres"
          >
            <Cog size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}