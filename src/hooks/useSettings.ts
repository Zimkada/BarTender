import { useLocalStorage } from './useLocalStorage';
import { AppSettings } from '../types';

const defaultSettings: AppSettings = {
  currency: 'FCFA',
  currencySymbol: 'FCFA',
  userRole: 'manager',
};

export function useSettings() {
  const [settings, setSettings] = useLocalStorage<AppSettings>('bar-settings', defaultSettings);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings({ ...settings, ...updates });
  };

  const formatPrice = (price: number) => {
    return `${price.toLocaleString()} ${settings.currencySymbol}`;
  };

  return {
    settings,
    updateSettings,
    formatPrice,
  };
}