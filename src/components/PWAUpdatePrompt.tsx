/**
 * PWAUpdatePrompt - Gestion des mises à jour du Service Worker
 *
 * Affiche un prompt élégant quand une nouvelle version est disponible
 * Permet à l'utilisateur de choisir quand recharger (registerType: 'prompt')
 */

import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      console.log('[PWA] Service Worker enregistré:', registration);
    },
    onRegisterError(error) {
      console.error('[PWA] Erreur d\'enregistrement SW:', error);
    },
    onOfflineReady() {
      console.log('[PWA] App prête à fonctionner hors ligne');
      // Afficher notification temporaire
      setShowPrompt(true);
      setTimeout(() => {
        setOfflineReady(false);
      }, 5000);
    },
    onNeedRefresh() {
      console.log('[PWA] Nouvelle version disponible');
      setShowPrompt(true);
    },
  });

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
    setShowPrompt(false);
  };

  // Ne rien afficher si pas de mise à jour et pas offline-ready
  if (!showPrompt || (!needRefresh && !offlineReady)) {
    return null;
  }

  // Prompt pour mise à jour disponible
  if (needRefresh) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-w-sm animate-slide-up">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
              <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">
                Mise à jour disponible
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Une nouvelle version de l'application est prête à être installée
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-blue-700 transition-colors"
                >
                  Mettre à jour
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Plus tard
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Notification offline-ready (temporaire)
  if (offlineReady) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-green-600 text-white rounded-lg shadow-xl max-w-sm animate-slide-up">
        <div className="p-4 flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              L'application est prête à fonctionner hors ligne
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
