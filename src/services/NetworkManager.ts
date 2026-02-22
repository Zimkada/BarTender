// NetworkManager.ts - Gestion détection réseau et connectivité
// Architecture: Event-driven avec ping server pour validation réelle

import type { NetworkStatus } from '../types/sync';

/**
 * Type de callback pour les listeners
 */
type NetworkChangeListener = (status: NetworkStatus) => void;

/**
 * Décision réseau atomique (Expert Refinement)
 */
export interface NetworkDecision {
  shouldBlock: boolean;
  shouldShowBanner: boolean;
  reason: NetworkStatus;
}

/**
 * Configuration du NetworkManager
 */
interface NetworkManagerConfig {
  /** URL pour ping test (sera configurée après setup Supabase) */
  pingUrl?: string;

  /** Intervalle de vérification réseau en ms */
  checkInterval: number;

  /** Délai avant de passer en mode offline (ms) */
  gracePeriod?: number;

  /** Timeout pour le ping test en ms */
  pingTimeout: number;
}

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG: NetworkManagerConfig = {
  pingUrl: '/index.html', // App's own HTML - always served by dev/prod server, no CORS/auth issues
  checkInterval: 3000, // 3 secondes (plus réactif pour les tests)
  pingTimeout: 7000,    // 7 secondes (couvre le 95e percentile latence 2G AOF: 5-8s)
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
  private isPinging = false; // Guard: empêche les pings concurrents (checkInterval < pingTimeout)

  /** Grace period avant de considérer offline (par défaut 12s pour AOF) */
  private get gracePeriod(): number {
    return this.config.gracePeriod ?? 12000;
  }

  /** Timer pour transition unstable → offline */
  private offlineTimer: number | null = null;

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

    // Nettoyer le timer de grace period
    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }

    this.isInitialized = false;
    console.log('[NetworkManager] Cleaned up');
  }

  /**
   * Handler pour l'event window.online
   */
  private handleOnline = (): void => {
    console.log('[NetworkManager] Browser reports online');

    // Annuler le timer de grace period si connexion revenue
    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
      console.log('[NetworkManager] Grace period cancelled, connection restored');
    }

    // Vérifier la connectivité réelle
    this.checkConnectivity();
  };

  /**
   * Handler pour l'event window.offline
   */
  private handleOffline = (): void => {
    console.log('[NetworkManager] Browser reports offline');

    // Grace period: passer par 'unstable' avant 'offline'
    this.updateStatus('unstable');

    // Annuler un timer existant
    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
    }

    // Démarrer le timer de grace period
    this.offlineTimer = window.setTimeout(() => {
      console.log('[NetworkManager] Grace period elapsed, now truly offline');
      this.updateStatus('offline');
      this.offlineTimer = null;
    }, this.gracePeriod);
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
   * 3. Si offline, appliquer grace period
   */
  async checkConnectivity(): Promise<void> {
    // Guard: skip si un ping est déjà en cours (évite l'oscillation checkInterval < pingTimeout)
    if (this.isPinging) return;

    // Étape 1: Vérifier navigator.onLine (instantané)
    if (!navigator.onLine) {
      // Appliquer grace period avant offline
      if (this.status !== 'unstable' && this.status !== 'offline') {
        this.updateStatus('unstable');
        if (this.offlineTimer === null) {
          this.offlineTimer = window.setTimeout(() => {
            console.log('[NetworkManager] Grace period elapsed (check), now truly offline');
            this.updateStatus('offline');
            this.offlineTimer = null;
          }, this.gracePeriod);
        }
      }
      return;
    }

    // Si on revient online pendant grace period, annuler timer
    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
      console.log('[NetworkManager] Grace period cancelled (check), connection restored');
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
    if (isReachable) {
      this.updateStatus('online');
    } else {
      // Server injoignable: appliquer grace period
      if (this.status !== 'unstable' && this.status !== 'offline') {
        this.updateStatus('unstable');
        if (this.offlineTimer === null) {
          this.offlineTimer = window.setTimeout(() => {
            console.log('[NetworkManager] Grace period elapsed (ping fail), now truly offline');
            this.updateStatus('offline');
            this.offlineTimer = null;
          }, this.gracePeriod);
        }
      }
    }
  }

  /**
   * Ping le server pour vérifier connectivité réelle
   *
   * @returns true si le server répond, false sinon
   */
  private async pingServer(): Promise<boolean> {
    if (!this.config.pingUrl) return true;

    this.isPinging = true;
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
    } finally {
      this.isPinging = false; // Toujours libérer le guard
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
   * DISTINCTION CRITIQUE: Network decision states
   * - 'online': confirmed connectivity to server
   * - 'unstable': connection detected but degraded (grace period active)
   * - 'offline': no connectivity confirmed (after grace period expires)
   *
   * Visibility & Blocking Logic:
   * - shouldShowOfflineBanner(): only show UI when status === 'offline'
   * - shouldBlockNetworkOps(): only block when status === 'offline'
   *   (unstable allows attempts with degraded performance, not a complete block)
   */

  /** Doit-on montrer la bannière offline ? */
  shouldShowOfflineBanner(): boolean {
    return this.status === 'offline';
  }

  /** Doit-on bloquer les opérations réseau ?
   * IMPORTANT: 'unstable' ne bloque PAS — connexion dégradée mais présente.
   * On laisse les services tenter avec leurs timeouts propres.
   * Seul 'offline' = vrai blocage (aucune connectivité confirmée).
   */
  shouldBlockNetworkOps(): boolean {
    return this.status === 'offline';
  }

  /**
   * Retourne une décision atomique cohérente (Évite les incohérences d'état entre deux appels)
   */
  getDecision(): NetworkDecision {
    return {
      shouldBlock: this.shouldBlockNetworkOps(),
      shouldShowBanner: this.shouldShowOfflineBanner(),
      reason: this.status
    };
  }

  /**
   * Vérifie si actuellement online
   */
  isOnline(): boolean {
    return this.status === 'online';
  }

  /**
   * @deprecated Utiliser shouldBlockNetworkOps() ou shouldShowOfflineBanner()
   */
  isOffline(): boolean {
    return this.shouldBlockNetworkOps();
  }

  /**
   * Vérifie si connexion instable (grace period en cours)
   */
  isUnstable(): boolean {
    return this.status === 'unstable';
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
