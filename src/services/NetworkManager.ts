// NetworkManager.ts - Gestion détection réseau et connectivité
// Architecture: Event-driven avec ping server pour validation réelle

import type { NetworkStatus } from '../types/sync';

/**
 * Type de callback pour les listeners
 */
type NetworkChangeListener = (status: NetworkStatus) => void;

/**
 * Configuration du NetworkManager
 */
interface NetworkManagerConfig {
  /** URL pour ping test (sera configurée après setup Supabase) */
  pingUrl?: string;

  /** Intervalle de vérification réseau en ms */
  checkInterval: number;

  /** Timeout pour le ping test en ms */
  pingTimeout: number;
}

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG: NetworkManagerConfig = {
  pingUrl: undefined, // Sera ajouté lors de la migration Supabase
  checkInterval: 30000, // 30 secondes
  pingTimeout: 5000,    // 5 secondes
};

/**
 * Service de gestion de la connectivité réseau
 *
 * Responsabilités:
 * - Détecter online/offline via navigator.onLine
 * - Valider connectivité réelle via ping server
 * - Notifier les listeners des changements
 * - Polling périodique pour détecter changements
 *
 * Pattern: Singleton avec pub/sub
 */
class NetworkManagerService {
  private status: NetworkStatus = 'checking';
  private listeners: Set<NetworkChangeListener> = new Set();
  private config: NetworkManagerConfig;
  private checkIntervalId: number | null = null;
  private isInitialized = false;

  constructor(config?: Partial<NetworkManagerConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Initialise le service (à appeler au démarrage de l'app)
   */
  init(): void {
    if (this.isInitialized) {
      console.warn('[NetworkManager] Already initialized');
      return;
    }

    // Vérification initiale
    this.checkConnectivity();

    // Écouter les events natifs du browser
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Polling périodique pour validation
    this.startPeriodicCheck();

    this.isInitialized = true;
    console.log('[NetworkManager] Initialized');
  }

  /**
   * Nettoie les listeners (à appeler avant unmount)
   */
  cleanup(): void {
    if (!this.isInitialized) return;

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.stopPeriodicCheck();

    this.isInitialized = false;
    console.log('[NetworkManager] Cleaned up');
  }

  /**
   * Handler pour l'event window.online
   */
  private handleOnline = (): void => {
    console.log('[NetworkManager] Browser reports online');
    // Vérifier la connectivité réelle
    this.checkConnectivity();
  };

  /**
   * Handler pour l'event window.offline
   */
  private handleOffline = (): void => {
    console.log('[NetworkManager] Browser reports offline');
    this.updateStatus('offline');
  };

  /**
   * Démarre le polling périodique
   */
  private startPeriodicCheck(): void {
    this.checkIntervalId = window.setInterval(() => {
      this.checkConnectivity();
    }, this.config.checkInterval);
  }

  /**
   * Arrête le polling périodique
   */
  private stopPeriodicCheck(): void {
    if (this.checkIntervalId !== null) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  /**
   * Met à jour le statut et notifie les listeners si changement
   */
  private updateStatus(newStatus: NetworkStatus): void {
    if (this.status !== newStatus) {
      const oldStatus = this.status;
      this.status = newStatus;
      console.log(`[NetworkManager] Status changed: ${oldStatus} → ${newStatus}`);
      this.notifyListeners();
    }
  }

  /**
   * Notifie tous les listeners du statut actuel
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.status));
  }

  /**
   * Vérifie la connectivité réseau
   *
   * Étapes:
   * 1. Vérifier navigator.onLine
   * 2. Si online, ping le server pour validation réelle
   * 3. Si offline, rester offline
   */
  async checkConnectivity(): Promise<void> {
    // Étape 1: Vérifier navigator.onLine (instantané)
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return;
    }

    // Étape 2: Si online selon le browser, valider avec ping
    this.updateStatus('checking');

    // Si pas de pingUrl configurée (avant Supabase), supposer online
    if (!this.config.pingUrl) {
      this.updateStatus('online');
      return;
    }

    // Ping le server pour validation réelle
    const isReachable = await this.pingServer();
    this.updateStatus(isReachable ? 'online' : 'offline');
  }

  /**
   * Ping le server pour vérifier connectivité réelle
   *
   * @returns true si le server répond, false sinon
   */
  private async pingServer(): Promise<boolean> {
    if (!this.config.pingUrl) return true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.pingTimeout);

      const response = await fetch(this.config.pingUrl, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('[NetworkManager] Ping failed:', error);
      return false;
    }
  }

  /**
   * Force une vérification immédiate
   */
  forceCheck(): void {
    this.checkConnectivity();
  }

  /**
   * Récupère le statut actuel
   */
  getStatus(): NetworkStatus {
    return this.status;
  }

  /**
   * Vérifie si actuellement online
   */
  isOnline(): boolean {
    return this.status === 'online';
  }

  /**
   * Vérifie si actuellement offline
   */
  isOffline(): boolean {
    return this.status === 'offline';
  }

  /**
   * Vérifie si vérification en cours
   */
  isChecking(): boolean {
    return this.status === 'checking';
  }

  /**
   * S'abonne aux changements de statut réseau
   *
   * @param listener - Fonction appelée à chaque changement
   * @returns Fonction pour se désabonner
   */
  subscribe(listener: NetworkChangeListener): () => void {
    this.listeners.add(listener);

    // Notifier immédiatement avec le statut actuel
    listener(this.status);

    // Retourner fonction de désabonnement
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Configure l'URL de ping (à appeler après setup Supabase)
   */
  setPingUrl(url: string): void {
    this.config.pingUrl = url;
    console.log(`[NetworkManager] Ping URL configured: ${url}`);

    // Vérifier immédiatement avec la nouvelle URL
    this.checkConnectivity();
  }
}

/**
 * Instance singleton du service
 */
export const networkManager = new NetworkManagerService();
