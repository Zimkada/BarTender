import React, { useState } from 'react';
import { X, Settings as SettingsIcon, DollarSign, User } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

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
  const [tempSettings, setTempSettings] = useState(settings);

  const handleSave = () => {
    updateSettings(tempSettings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <SettingsIcon size={20} />
            Paramètres
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              <DollarSign size={16} className="inline mr-2" />
              Devise
            </label>
            <div className="space-y-2">
              {currencyOptions.map((currency) => (
                <label key={currency.code} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
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
                    className="text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <div className="text-white font-medium">{currency.name}</div>
                    <div className="text-gray-400 text-sm">{currency.symbol}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <User size={16} className="inline mr-2" />
              Nom du serveur (optionnel)
            </label>
            <input
              type="text"
              value={tempSettings.serverName || ''}
              onChange={(e) => setTempSettings({
                ...tempSettings,
                serverName: e.target.value,
              })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="ex: Marie Dupont"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}