import React from 'react';
import { BarChart3, Cog, Clock, Warehouse, UserCheck, Users, ArrowLeft, Share } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {
  onShowSales?: () => void;
  onShowSettings?: () => void;
  onShowInventory?: () => void;
  onShowServers?: () => void;
  onSwitchToServer?: () => void;
  isServerMode?: boolean;
}

export function Header({ onShowSales, onShowSettings, onShowInventory, onSwitchToServer, onShowServers, isServerMode = false }: HeaderProps) {
  const { getTodayTotal, formatPrice, getLowStockProducts } = useAppContext();
  
  const todayTotal = getTodayTotal();
  const lowStockCount = getLowStockProducts().length;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-orange-100 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          
          <div>
            <h1 className="text-2xl font-bold text-gray-800">BarTender App</h1>
            <p className="text-gray-600 text-sm">
              Ventes du jour: <span className="text-orange-600 font-semibold">{formatPrice(todayTotal)}</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onSwitchToServer && (
  <button
    onClick={onSwitchToServer}
      className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors"
      title="Mode Serveur"
    >
      <UserCheck size={20} />
    </button>
  )}

  {!isServerMode && onShowServers && (
    <button
      onClick={onShowServers}
      className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors"
      title="Gestion des serveurs"
    >
      <Users size={20} />
    </button>
  )}

  {!isServerMode && onShowInventory && (
    <button
      onClick={onShowInventory}
      className="relative w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors"
      title="Inventaire & Stock"
    >
      <Warehouse size={20} />
      {lowStockCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {lowStockCount}
        </span>
      )}
    </button>
  )}

  {!isServerMode && onShowSales && (
    <button
      onClick={onShowSales}
      className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors"
      title="Historique des ventes"
    >
      <BarChart3 size={20} />
    </button>
  )}

  {!isServerMode && onShowSettings && (
    <button
      onClick={onShowSettings}
      className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors"
      title="Paramètres"
    >
      <Cog size={20} />
    </button>
  )}

  <button className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 hover:bg-amber-200 transition-colors">
    <Share size={20} />
  </button>
        </div>
      </div>
    </header>
  );
}