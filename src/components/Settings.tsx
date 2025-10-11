import React, { useState } from 'react';
import { X, Settings as SettingsIcon, DollarSign, Clock, Users, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const currencyOptions = [
  { code: 'FCFA', symbol: 'FCFA', name: 'Franc CFA' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dollar US' },
  { code: 'GBP', symbol: '£', name: 'Livre Sterling' },
];

export function Settings({ isOpen, onClose }: SettingsProps) {
  const { settings, updateSettings } = useSettings();
  const { currentBar, updateBar } = useBarContext();
  const { currentSession } = useAuth();
  const [tempSettings, setTempSettings] = useState(settings);
  const [tempCloseHour, setTempCloseHour] = useState(currentBar?.settings?.businessDayCloseHour ?? 6);
  const [tempConsignmentExpirationDays, setTempConsignmentExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);
  const [tempOperatingMode, setTempOperatingMode] = useState<'full' | 'simplified'>(
    currentBar?.settings?.operatingMode ?? 'full'
  );
  const [tempServersList, setTempServersList] = useState<string[]>(
    currentBar?.settings?.serversList ?? []
  );
  const [newServerName, setNewServerName] = useState('');

  const handleAddServer = () => {
    if (newServerName.trim() && !tempServersList.includes(newServerName.trim())) {
      setTempServersList([...tempServersList, newServerName.trim()]);
      setNewServerName('');
    }
  };

  const handleRemoveServer = (serverName: string) => {
    setTempServersList(tempServersList.filter(s => s !== serverName));
  };

  const handleSave = () => {
    updateSettings(tempSettings);

    // Mettre à jour les paramètres du bar actuel
    if (currentBar) {
      updateBar(currentBar.id, {
        settings: {
          ...currentBar.settings,
          businessDayCloseHour: tempCloseHour,
          consignmentExpirationDays: tempConsignmentExpirationDays,
          operatingMode: tempOperatingMode,
          serversList: tempOperatingMode === 'simplified' ? tempServersList : undefined,
        }
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-lg w-full max-w-md max-h-[85vh] md:max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-orange-100">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <SettingsIcon size={20} className="text-orange-500" />
                Paramètres
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </motion.button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <DollarSign size={16} className="text-orange-500" />
                  Devise
                </label>
                <div className="space-y-2">
                  {currencyOptions.map((currency) => (
                    <motion.label 
                      key={currency.code} 
                      whileHover={{ scale: 1.02 }}
                      className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl cursor-pointer hover:bg-orange-100 transition-colors border border-orange-100"
                    >
                      <input
                        type="radio"
                        name="currency"
                        value={currency.code}
                        checked={tempSettings.currency === currency.code}
                        onChange={(e) => setTempSettings({
                          ...tempSettings,
                          currency: e.target.value,
                          currencySymbol: currency.symbol,
                        })}
                        className="text-orange-500 focus:ring-orange-400"
                      />
                      <div>
                        <div className="text-gray-800 font-medium">{currency.name}</div>
                        <div className="text-gray-600 text-sm">{currency.symbol}</div>
                      </div>
                    </motion.label>
                  ))}
                </div>
              </div>

              {/* Heure de clôture de la journée commerciale */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Clock size={16} className="text-orange-500" />
                  Heure de clôture de la journée commerciale
                </label>
                <p className="text-xs text-gray-600 mb-3">
                  Les ventes après minuit seront comptabilisées dans la journée précédente jusqu'à cette heure.
                </p>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <input
                    type="range"
                    min="0"
                    max="23"
                    value={tempCloseHour}
                    onChange={(e) => setTempCloseHour(Number(e.target.value))}
                    className="flex-1 h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-orange-200 min-w-[80px] justify-center">
                    <Clock size={18} className="text-orange-500" />
                    <span className="text-lg font-bold text-gray-800">
                      {tempCloseHour.toString().padStart(2, '0')}h
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Exemple : Si vous fermez à {tempCloseHour}h, une vente à {tempCloseHour === 0 ? '23' : (tempCloseHour - 1).toString().padStart(2, '0')}h sera comptée dans la journée précédente.
                </p>
              </div>

              {/* Durée d'expiration des consignations */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Clock size={16} className="text-orange-500" />
                  Durée d'expiration des consignations
                </label>
                <p className="text-xs text-gray-600 mb-3">
                  Durée par défaut avant qu'un produit consigné non réclamé ne redevienne disponible à la vente.
                </p>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={tempConsignmentExpirationDays}
                    onChange={(e) => setTempConsignmentExpirationDays(Number(e.target.value))}
                    className="flex-1 h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-orange-200 min-w-[90px] justify-center">
                    <span className="text-lg font-bold text-gray-800">
                      {tempConsignmentExpirationDays} jour(s)
                    </span>
                  </div>
                </div>
              </div>

              {/* Mode de fonctionnement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Users size={16} className="text-orange-500" />
                  Mode de fonctionnement
                </label>
                <div className="space-y-3">
                  <motion.label
                    whileHover={{ scale: 1.02 }}
                    className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl cursor-pointer hover:bg-orange-100 transition-colors border border-orange-100"
                  >
                    <input
                      type="radio"
                      name="operatingMode"
                      value="full"
                      checked={tempOperatingMode === 'full'}
                      onChange={() => setTempOperatingMode('full')}
                      className="mt-1 text-orange-500 focus:ring-orange-400"
                    />
                    <div className="flex-1">
                      <div className="text-gray-800 font-medium">Mode Complet</div>
                      <div className="text-gray-600 text-xs mt-1">
                        Chaque serveur a son propre compte et enregistre ses ventes. Système complet avec commandes et validation.
                      </div>
                    </div>
                  </motion.label>

                  <motion.label
                    whileHover={{ scale: 1.02 }}
                    className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl cursor-pointer hover:bg-orange-100 transition-colors border border-orange-100"
                  >
                    <input
                      type="radio"
                      name="operatingMode"
                      value="simplified"
                      checked={tempOperatingMode === 'simplified'}
                      onChange={() => setTempOperatingMode('simplified')}
                      className="mt-1 text-orange-500 focus:ring-orange-400"
                    />
                    <div className="flex-1">
                      <div className="text-gray-800 font-medium">Mode Simplifié</div>
                      <div className="text-gray-600 text-xs mt-1">
                        Le gérant/promoteur enregistre toutes les ventes et sélectionne le serveur concerné. Idéal si vos serveurs n'ont pas de smartphone.
                      </div>
                    </div>
                  </motion.label>
                </div>
              </div>

              {/* Liste des serveurs (mode simplifié uniquement) */}
              {tempOperatingMode === 'simplified' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Users size={16} className="text-orange-500" />
                    Liste des serveurs
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Ajoutez les noms de vos serveurs. Vous pourrez attribuer les ventes à chacun lors de l'enregistrement.
                  </p>

                  {/* Input pour ajouter un serveur */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddServer()}
                      placeholder="Nom du serveur (ex: Marie)"
                      className="flex-1 px-3 py-2 bg-white border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
                    />
                    <motion.button
                      onClick={handleAddServer}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Ajouter
                    </motion.button>
                  </div>

                  {/* Liste des serveurs */}
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tempServersList.length === 0 ? (
                      <p className="text-gray-500 text-xs text-center py-4">
                        Aucun serveur ajouté. {currentSession?.userName} sera utilisé par défaut.
                      </p>
                    ) : (
                      tempServersList.map((serverName, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center justify-between p-2 bg-white rounded-lg border border-orange-100"
                        >
                          <span className="text-sm text-gray-700">{serverName}</span>
                          <button
                            onClick={() => handleRemoveServer(serverName)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                >
                  Annuler
                </motion.button>
                <motion.button
                  onClick={handleSave}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
                >
                  Enregistrer
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}