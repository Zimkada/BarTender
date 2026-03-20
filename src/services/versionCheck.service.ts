/**
 * Service de vérification de mise à jour
 * Détecte les nouvelles versions déployées sur Vercel et force le rechargement
 */

import { networkManager } from './NetworkManager';

export class VersionCheckService {
  private static readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static readonly VERSION_FILE = '/version.json';
  private static currentVersion: string | null = null;
  private static checkIntervalId: NodeJS.Timeout | null = null;
  private static updateCallbacks: ((version: string) => void)[] = [];

  /**
   * Initialiser la vérification de version
   */
  static async initialize(): Promise<void> {
    console.log('[VersionCheckService] Initialisation');

    // Charger la version actuelle (skip si offline — sera récupérée au premier check périodique)
    if (!networkManager.getDecision().shouldBlock) {
      this.currentVersion = await this.getCurrentVersion();
      console.log('[VersionCheckService] Version actuelle:', this.currentVersion);
    } else {
      console.log('[VersionCheckService] Offline — initialisation différée');
    }

    // Démarrer la vérification périodique
    this.startPeriodicCheck();
  }

  /**
   * Obtenir la version actuelle depuis le fichier de version
   */
  private static async getCurrentVersion(): Promise<string> {
    try {
      // Si on a déjà une version en cache, la retourner
      if (this.currentVersion) {
        return this.currentVersion;
      }

      // Fetch avec cache-busting pour éviter le cache navigateur
      const response = await fetch(this.VERSION_FILE + '?t=' + Date.now(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.version || 'unknown';
    } catch (err) {
      console.warn('[VersionCheckService] Erreur lors de la récupération de la version:', err);
      return 'unknown';
    }
  }

  /**
   * Démarrer la vérification périodique de version
   */
  private static startPeriodicCheck(): void {
    if (this.checkIntervalId) return; // Déjà en cours

    console.log('[VersionCheckService] Vérification périodique démarrée (toutes les 5 min)');

    this.checkIntervalId = setInterval(async () => {
      // Ne pas vérifier si hors-ligne (évite des fetch inutiles)
      if (networkManager.getDecision().shouldBlock) return;
      await this.checkForUpdates();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Vérifier s'il y a une mise à jour disponible
   */
  private static async checkForUpdates(): Promise<void> {
    try {
      const latestVersion = await this.getCurrentVersion();

      if (latestVersion !== this.currentVersion && latestVersion !== 'unknown') {
        console.warn('[VersionCheckService] 🔄 Nouvelle version détectée:', latestVersion);
        console.warn('[VersionCheckService] Version actuelle:', this.currentVersion);

        // Notifier tous les listeners
        this.updateCallbacks.forEach(callback => {
          try {
            callback(latestVersion);
          } catch (err) {
            console.error('[VersionCheckService] Erreur dans callback:', err);
          }
        });

        // Mettre à jour la version actuelle
        this.currentVersion = latestVersion;
      }
    } catch (err) {
      console.warn('[VersionCheckService] Erreur lors de la vérification:', err);
    }
  }

  /**
   * S'abonner aux mises à jour
   */
  static onUpdateAvailable(callback: (version: string) => void): () => void {
    this.updateCallbacks.push(callback);

    // Retourner une fonction pour se désabonner
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Recharger la page (hard refresh)
   */
  static reloadPage(): void {
    console.log('[VersionCheckService] Rechargement de la page...');
    // Hard refresh pour éviter le cache navigateur
    window.location.href = window.location.href;
  }

  /**
   * Arrêter la vérification périodique
   */
  static stopChecking(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
      console.log('[VersionCheckService] Vérification arrêtée');
    }
  }

  /**
   * Vérifier immédiatement (pour testing)
   */
  static async checkNow(): Promise<void> {
    if (networkManager.getDecision().shouldBlock) {
      console.log('[VersionCheckService] Vérification immédiate skippée (offline)');
      return;
    }
    console.log('[VersionCheckService] Vérification immédiate');
    await this.checkForUpdates();
  }
}
