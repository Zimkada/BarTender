import React from 'react';
import { Users, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

interface RoleSelectorProps {
  onSelectRole: (role: 'manager' | 'server') => void;
}

export function RoleSelector({ onSelectRole }: RoleSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-br from-yellow-100 to-amber-100 backdrop-blur-sm border border-gray-700 rounded-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">BarTender App</h1>
          <p className="text-gray-600">Choisissez votre interface</p>
        </div>
        
        <div className="space-y-4">
          <motion.button
            onClick={() => onSelectRole('manager')}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="w-full p-6 bg-white hover:bg-orange-50 border border-orange-200 rounded-xl transition-all duration-200 group shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-500 rounded-xl group-hover:bg-orange-600 transition-colors">
                <Settings size={24} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-800">Interface Gérant</h3>
                <p className="text-gray-600 text-sm">Gestion complète du bar, inventaire, ventes</p>
              </div>
            </div>
          </motion.button>
          
          <motion.button
            onClick={() => onSelectRole('server')}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="w-full p-6 bg-white hover:bg-orange-50 border border-orange-200 rounded-xl transition-all duration-200 group shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500 rounded-xl group-hover:bg-amber-600 transition-colors">
                <Users size={24} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-800">Interface Serveur</h3>
                <p className="text-gray-600 text-sm">Prise de commande simplifiée</p>
              </div>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}