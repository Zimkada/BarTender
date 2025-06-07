import React from 'react';
import { Users, Settings } from 'lucide-react';

interface RoleSelectorProps {
  onSelectRole: (role: 'manager' | 'server') => void;
}

export function RoleSelector({ onSelectRole }: RoleSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Bar POS</h1>
          <p className="text-gray-400">Choisissez votre interface</p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={() => onSelectRole('manager')}
            className="w-full p-6 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-all duration-200 hover:transform hover:scale-[1.02] group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-teal-600 rounded-lg group-hover:bg-teal-500 transition-colors">
                <Settings size={24} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-white">Interface Gérant</h3>
                <p className="text-gray-400 text-sm">Gestion complète du bar, inventaire, ventes</p>
              </div>
            </div>
          </button>
          
          <button
            onClick={() => onSelectRole('server')}
            className="w-full p-6 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-all duration-200 hover:transform hover:scale-[1.02] group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-600 rounded-lg group-hover:bg-orange-500 transition-colors">
                <Users size={24} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-white">Interface Serveur</h3>
                <p className="text-gray-400 text-sm">Prise de commande simplifiée</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}