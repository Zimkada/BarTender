/**
 * PWAInstallPrompt - Custom "Add to Home Screen" button
 *
 * Approche 1: Bouton custom élégant dans l'interface
 * - Détecte si l'app est installable
 * - Affiche un prompt élégant avec icône + texte
 * - Se cache automatiquement après installation ou rejet
 * - Position: Top banner (non-intrusif)
 */

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Vérifier si déjà installé
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInApp = (window.navigator as any).standalone === true;

    if (isStandalone || isInApp) {
      setIsInstalled(true);
      return;
    }

    // Vérifier si l'utilisateur a déjà rejeté l'installation
    const hasRejected = localStorage.getItem('pwa-install-rejected');
    if (hasRejected) {
      return;
    }

    // Capturer l'événement beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Empêcher le prompt natif par défaut
      e.preventDefault();

      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Attendre 3 secondes avant d'afficher le prompt (ne pas être trop agressif)
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    // Détecter l'installation réussie
    const handleAppInstalled = () => {
      console.log('[PWA] App installée avec succès!');
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.removeItem('pwa-install-rejected');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      // Afficher le prompt natif
      await deferredPrompt.prompt();

      // Attendre la réponse de l'utilisateur
      const { outcome } = await deferredPrompt.userChoice;

      console.log(`[PWA] Installation ${outcome === 'accepted' ? 'acceptée' : 'rejetée'}`);

      if (outcome === 'dismissed') {
        // Enregistrer le rejet pour ne pas être trop insistant
        localStorage.setItem('pwa-install-rejected', 'true');
      }

      // Cacher le prompt dans tous les cas
      setShowPrompt(false);
      setDeferredPrompt(null);

    } catch (error) {
      console.error('[PWA] Erreur lors de l\'installation:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Enregistrer le rejet temporaire (ne pas redemander dans cette session)
    localStorage.setItem('pwa-install-rejected', 'true');
  };

  // Ne rien afficher si:
  // - Déjà installé
  // - Pas de prompt disponible
  // - Prompt désactivé par l'utilisateur
  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg animate-slide-down">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Icône + Texte */}
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-white/20 p-2 rounded-lg">
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="font-semibold text-sm md:text-base">
                Installer BarTender
              </span>
              <p className="text-xs md:text-sm text-white/90">
                Accès rapide depuis votre écran d'accueil
              </p>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="bg-white text-amber-800 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-amber-50 transition-colors"
            >
              Installer
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
