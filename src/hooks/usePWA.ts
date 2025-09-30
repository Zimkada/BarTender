// Hook PWA - Gestion PWA optimisée pour Bénin/Afrique
import { useState, useEffect, useCallback } from 'react';

interface PWAInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  isUpdateAvailable: boolean;
  installPrompt: PWAInstallPrompt | null;
}

interface PWAActions {
  install: () => Promise<boolean>;
  update: () => Promise<void>;
  registerForUpdates: () => void;
  skipWaiting: () => void;
}

export function usePWA(): PWAState & PWAActions {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<PWAInstallPrompt | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // ===== INSTALLATION PWA =====

  useEffect(() => {
    // Vérifier si déjà installé
    const checkInstalled = () => {
      // Chrome/Edge
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        return;
      }

      // Safari
      if ((window.navigator as any).standalone === true) {
        setIsInstalled(true);
        return;
      }

      // Autres navigateurs
      if (document.referrer.includes('android-app://')) {
        setIsInstalled(true);
      }
    };

    checkInstalled();

    // Écouter l'événement d'installation
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA] Prompt d\'installation disponible');
      e.preventDefault();
      setInstallPrompt(e as any);
      setIsInstallable(true);
    };

    // Écouter installation réussie
    const handleAppInstalled = () => {
      console.log('[PWA] Application installée avec succès');
      setIsInstalled(true);
      setIsInstallable(false);
      setInstallPrompt(null);

      // Analytics installation
      if (typeof gtag !== 'undefined') {
        (window as any).gtag('event', 'pwa_install', {
          event_category: 'engagement',
          event_label: 'bartender_benin'
        });
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // ===== GESTION CONNEXION =====

  useEffect(() => {
    const handleOnline = () => {
      console.log('[PWA] Connexion rétablie');
      setIsOnline(true);

      // Déclencher sync background si disponible
      if (registration && 'sync' in window.ServiceWorkerRegistration.prototype) {
        registration.sync.register('sync-sales').catch(console.error);
        registration.sync.register('sync-inventory').catch(console.error);
      }
    };

    const handleOffline = () => {
      console.log('[PWA] Connexion perdue - Mode offline activé');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [registration]);

  // ===== SERVICE WORKER =====

  useEffect(() => {
    const registerServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          console.log('[PWA] Enregistrement Service Worker...');

          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none' // Toujours vérifier les mises à jour
          });

          setRegistration(registration);

          // Vérifier mises à jour immédiatement
          await registration.update();

          // Écouter nouveaux service workers
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              console.log('[PWA] Mise à jour Service Worker détectée');

              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] Mise à jour prête à installer');
                  setIsUpdateAvailable(true);
                }
              });
            }
          });

          // Message du service worker
          navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('[PWA] Message du SW:', event.data);

            if (event.data?.type === 'CACHE_UPDATED') {
              setIsUpdateAvailable(true);
            }
          });

          console.log('[PWA] Service Worker enregistré avec succès');

        } catch (error) {
          console.error('[PWA] Erreur enregistrement Service Worker:', error);
        }
      } else {
        console.warn('[PWA] Service Worker non supporté');
      }
    };

    registerServiceWorker();
  }, []);

  // ===== ACTIONS =====

  const install = useCallback(async (): Promise<boolean> => {
    if (!installPrompt) {
      console.warn('[PWA] Pas de prompt d\'installation disponible');
      return false;
    }

    try {
      console.log('[PWA] Déclenchement installation...');

      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        console.log('[PWA] Installation acceptée par l\'utilisateur');
        setIsInstallable(false);
        setInstallPrompt(null);
        return true;
      } else {
        console.log('[PWA] Installation refusée par l\'utilisateur');
        return false;
      }
    } catch (error) {
      console.error('[PWA] Erreur installation:', error);
      return false;
    }
  }, [installPrompt]);

  const update = useCallback(async (): Promise<void> => {
    if (!registration) {
      console.warn('[PWA] Pas de registration disponible pour mise à jour');
      return;
    }

    try {
      console.log('[PWA] Vérification mises à jour...');

      await registration.update();

      if (registration.waiting) {
        // Nouveau service worker en attente
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Recharger la page pour appliquer la mise à jour
      window.location.reload();

    } catch (error) {
      console.error('[PWA] Erreur mise à jour:', error);
    }
  }, [registration]);

  const skipWaiting = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setIsUpdateAvailable(false);

      // Recharger après un délai
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }, [registration]);

  const registerForUpdates = useCallback(() => {
    if (!registration) return;

    // Vérifier les mises à jour toutes les heures
    const checkForUpdates = async () => {
      try {
        await registration.update();
      } catch (error) {
        console.error('[PWA] Erreur vérification mise à jour:', error);
      }
    };

    // Vérification initiale
    checkForUpdates();

    // Vérification périodique
    const interval = setInterval(checkForUpdates, 60 * 60 * 1000); // 1 heure

    return () => clearInterval(interval);
  }, [registration]);

  return {
    // État
    isInstallable,
    isInstalled,
    isOnline,
    isUpdateAvailable,
    installPrompt,

    // Actions
    install,
    update,
    registerForUpdates,
    skipWaiting
  };
}

// ===== HOOK COMPLÉMENTAIRES =====

// Hook pour les notifications PWA
export function usePWANotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('Notification' in window);
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('[PWA] Erreur demande permission notifications:', error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(async (
    title: string,
    options?: NotificationOptions
  ): Promise<void> => {
    if (permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Notification via service worker pour persistance
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          payload: { title, options }
        });
      } else {
        // Notification directe
        new Notification(title, {
          icon: '/icon-192x192.png',
          badge: '/badge-72x72.png',
          ...options
        });
      }
    } catch (error) {
      console.error('[PWA] Erreur affichage notification:', error);
    }
  }, [permission]);

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification
  };
}

// Hook pour le partage PWA
export function usePWAShare() {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('share' in navigator);
  }, []);

  const share = useCallback(async (data: ShareData): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      await navigator.share(data);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Utilisateur a annulé
        return false;
      }

      console.error('[PWA] Erreur partage:', error);
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    share
  };
}