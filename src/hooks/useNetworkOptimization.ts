import { useState, useEffect, useCallback } from 'react';

/**
 * ✅ Type-safe declarations for experimental Browser APIs
 */

/** Network Information API (experimental) */
interface NetworkInformationAPI {
  type?: 'bluetooth' | 'cellular' | 'ethernet' | 'wifi' | 'wimax' | 'none' | 'unknown';
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number;
  downlinkMax?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

/** Battery Status API (experimental) */
interface BatteryManager {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

/** Extended Navigator with experimental APIs */
interface NavigatorWithExperimentalAPIs extends Navigator {
  connection?: NetworkInformationAPI;
  mozConnection?: NetworkInformationAPI;
  webkitConnection?: NetworkInformationAPI;
  getBattery?: () => Promise<BatteryManager>;
}

interface NetworkInfo {
  isOnline: boolean;
  connectionType: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown';
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  downlink: number; // Mbps
  saveData: boolean; // User has enabled data saver
  isSlowConnection: boolean;
  batteryLevel?: number;
  isLowBattery: boolean;
}

interface PerformanceSettings {
  enableAnimations: boolean;
  enableImageLoading: boolean;
  enableAutoSync: boolean;
  reduceMotion: boolean;
  useLowPowerMode: boolean;
}

export function useNetworkOptimization() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({
    isOnline: navigator.onLine,
    connectionType: 'unknown',
    effectiveType: '4g',
    downlink: 10,
    saveData: false,
    isSlowConnection: false,
    isLowBattery: false
  });

  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({
    enableAnimations: true,
    enableImageLoading: true,
    enableAutoSync: true,
    reduceMotion: false,
    useLowPowerMode: false
  });

  // Détection des capacités réseau
  const updateNetworkInfo = useCallback(() => {
    const connection = (navigator as NavigatorWithExperimentalAPIs).connection ||
                      (navigator as NavigatorWithExperimentalAPIs).mozConnection ||
                      (navigator as NavigatorWithExperimentalAPIs).webkitConnection;

    const newNetworkInfo: NetworkInfo = {
      isOnline: navigator.onLine,
      connectionType: 'unknown',
      effectiveType: '4g',
      downlink: 10,
      saveData: false,
      isSlowConnection: false,
      isLowBattery: false
    };

    if (connection) {
      newNetworkInfo.connectionType = connection.type || 'unknown';
      newNetworkInfo.effectiveType = connection.effectiveType || '4g';
      newNetworkInfo.downlink = connection.downlink || 10;
      newNetworkInfo.saveData = connection.saveData || false;

      // Connexion lente si 2G ou downlink < 1.5 Mbps
      newNetworkInfo.isSlowConnection =
        connection.effectiveType === 'slow-2g' ||
        connection.effectiveType === '2g' ||
        connection.downlink < 1.5;
    }

    // Détection batterie
    if ('getBattery' in navigator) {
      const navWithBattery = navigator as NavigatorWithExperimentalAPIs;
      navWithBattery.getBattery?.().then((battery: BatteryManager) => {
        newNetworkInfo.batteryLevel = battery.level;
        newNetworkInfo.isLowBattery = battery.level < 0.2 || battery.charging === false;
        setNetworkInfo(newNetworkInfo);
      });
    } else {
      setNetworkInfo(newNetworkInfo);
    }
  }, []);

  // Ajustement automatique des performances
  const adjustPerformanceSettings = useCallback(() => {
    const isSlowOrLimited = networkInfo.isSlowConnection ||
                           networkInfo.saveData ||
                           networkInfo.isLowBattery;

    const newSettings: PerformanceSettings = {
      enableAnimations: !isSlowOrLimited,
      enableImageLoading: !networkInfo.saveData,
      enableAutoSync: networkInfo.isOnline && !networkInfo.isSlowConnection,
      reduceMotion: networkInfo.isLowBattery || networkInfo.saveData,
      useLowPowerMode: networkInfo.isLowBattery
    };

    // Respect des préférences système
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      newSettings.enableAnimations = false;
      newSettings.reduceMotion = true;
    }

    setPerformanceSettings(newSettings);

    // Appliquer les classes CSS
    const body = document.body;
    body.classList.toggle('slow-connection', networkInfo.isSlowConnection);
    body.classList.toggle('save-data', networkInfo.saveData);
    body.classList.toggle('low-battery', networkInfo.isLowBattery);
    body.classList.toggle('reduced-motion', newSettings.reduceMotion);

  }, [networkInfo]);

  // Mise à jour automatique
  useEffect(() => {
    updateNetworkInfo();

    const handleOnline = () => updateNetworkInfo();
    const handleOffline = () => updateNetworkInfo();
    const handleConnectionChange = () => updateNetworkInfo();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as NavigatorWithExperimentalAPIs).connection;
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    // Vérification périodique (toutes les 30 secondes)
    const interval = setInterval(updateNetworkInfo, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
      clearInterval(interval);
    };
  }, [updateNetworkInfo]);

  // Ajuster les performances quand le réseau change
  useEffect(() => {
    adjustPerformanceSettings();
  }, [adjustPerformanceSettings]);

  // Actions d'optimisation
  const optimizeForSlowConnection = useCallback(() => {
    return {
      // Désactiver les animations coûteuses
      disableHeavyAnimations: () => {
        document.documentElement.style.setProperty('--animation-duration', '0.1s');
      },

      // Réduire la qualité des images
      optimizeImages: () => {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
          if (!img.hasAttribute('data-optimized')) {
            img.loading = 'lazy';
            img.setAttribute('data-optimized', 'true');
          }
        });
      },

      // Différer les opérations non critiques
      deferNonCritical: (callback: () => void, delay = 5000) => {
        if (networkInfo.isSlowConnection) {
          setTimeout(callback, delay);
        } else {
          callback();
        }
      },

      // Batch les requêtes
      batchRequests: (requests: Promise<any>[], batchSize = 2) => {
        const batches = [];
        for (let i = 0; i < requests.length; i += batchSize) {
          batches.push(requests.slice(i, i + batchSize));
        }
        return batches;
      }
    };
  }, [networkInfo.isSlowConnection]);

  // Stratégies d'économie de batterie
  const batteryOptimizations = useCallback(() => {
    return {
      // Réduire la fréquence des mises à jour
      getUpdateInterval: () => {
        if (networkInfo.isLowBattery) return 60000; // 1 minute
        if (networkInfo.isSlowConnection) return 30000; // 30 secondes
        return 10000; // 10 secondes par défaut
      },

      // Désactiver les fonctionnalités non essentielles
      disableNonEssential: () => {
        return {
          backgroundSync: false,
          notifications: false,
          autoSave: false,
          liveUpdates: false
        };
      },

      // Mode économie d'énergie
      enterPowerSaveMode: () => {
        document.body.classList.add('power-save-mode');
        // Réduire la luminosité CSS
        document.documentElement.style.filter = 'brightness(0.8)';
      },

      exitPowerSaveMode: () => {
        document.body.classList.remove('power-save-mode');
        document.documentElement.style.filter = '';
      }
    };
  }, [networkInfo.isLowBattery, networkInfo.isSlowConnection]);

  return {
    networkInfo,
    performanceSettings,
    updateNetworkInfo,
    optimizeForSlowConnection: optimizeForSlowConnection(),
    batteryOptimizations: batteryOptimizations(),

    // Getters utiles
    shouldReduceAnimations: performanceSettings.reduceMotion,
    shouldDelayNonCritical: networkInfo.isSlowConnection,
    shouldUseLowPowerMode: performanceSettings.useLowPowerMode,
    canUseHeavyFeatures: !networkInfo.isSlowConnection && !networkInfo.isLowBattery,

    // Actions manuelles
    forceSlowMode: () => setPerformanceSettings(prev => ({ ...prev, useLowPowerMode: true })),
    resetOptimizations: () => {
      document.body.className = document.body.className
        .replace(/slow-connection|save-data|low-battery|reduced-motion/g, '');
    }
  };
}

// Hook spécialisé pour les images optimisées
export function useOptimizedImages() {
  const { networkInfo, performanceSettings } = useNetworkOptimization();

  const getImageProps = useCallback((src: string, alt: string) => {
    const baseProps = {
      src,
      alt,
      loading: 'lazy' as const,
      decoding: 'async' as const
    };

    if (networkInfo.saveData || networkInfo.isSlowConnection) {
      return {
        ...baseProps,
        // Pas d'image sur connexion très lente
        src: networkInfo.effectiveType === 'slow-2g' ? '' : src,
        style: {
          filter: networkInfo.isLowBattery ? 'brightness(0.9)' : undefined,
          transition: performanceSettings.enableAnimations ? 'all 0.3s ease' : 'none'
        }
      };
    }

    return baseProps;
  }, [networkInfo, performanceSettings]);

  return { getImageProps };
}