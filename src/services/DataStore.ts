// DataStore.ts - Couche d'abstraction pour le stockage de données
// Permet de passer facilement de localStorage à Supabase

/**
 * Interface générique pour le stockage de données
 * Implémentations : LocalStorageDataStore (actuel), SupabaseDataStore (futur)
 */
export interface DataStore {
  /**
   * Récupérer des données
   * @param key - Clé de stockage (ex: 'products-v3')
   * @returns Les données ou null si inexistant
   */
  get<T>(key: string): T | null;

  /**
   * Sauvegarder des données
   * @param key - Clé de stockage
   * @param value - Données à sauvegarder
   */
  set<T>(key: string, value: T): void;

  /**
   * Supprimer des données
   * @param key - Clé de stockage
   */
  remove(key: string): void;

  /**
   * Vérifier si une clé existe
   * @param key - Clé de stockage
   */
  has(key: string): boolean;

  /**
   * S'abonner aux changements d'une clé
   * @param key - Clé à surveiller
   * @param callback - Fonction appelée lors des changements
   * @returns Fonction de désabonnement
   */
  subscribe<T>(key: string, callback: (value: T | null) => void): () => void;
}

/**
 * Implémentation localStorage (actuelle)
 * Wrapper autour de localStorage avec gestion d'erreurs et événements
 */
export class LocalStorageDataStore implements DataStore {
  private listeners = new Map<string, Set<(value: any) => void>>();

  constructor() {
    // Écouter les changements storage (multi-onglets)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorageEvent);
    }
  }

  private handleStorageEvent = (event: StorageEvent) => {
    if (!event.key) return;

    const listeners = this.listeners.get(event.key);
    if (listeners) {
      const newValue = event.newValue ? this.parse(event.newValue) : null;
      listeners.forEach(callback => callback(newValue));
    }
  };

  private parse<T>(json: string): T | null {
    try {
      return JSON.parse(json);
    } catch (error) {
      console.error(`[DataStore] Parse error for JSON:`, error);
      return null;
    }
  }

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? this.parse<T>(item) : null;
    } catch (error) {
      console.error(`[DataStore] Error reading key "${key}":`, error);
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));

      // Notifier les listeners locaux
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.forEach(callback => callback(value));
      }
    } catch (error) {
      console.error(`[DataStore] Error writing key "${key}":`, error);
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);

      // Notifier les listeners
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.forEach(callback => callback(null));
      }
    } catch (error) {
      console.error(`[DataStore] Error removing key "${key}":`, error);
    }
  }

  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }

  subscribe<T>(key: string, callback: (value: T | null) => void): () => void {
    // Créer le Set de listeners si inexistant
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    const listeners = this.listeners.get(key)!;
    listeners.add(callback);

    // Retourner fonction de désabonnement
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Nettoyer les listeners (appelé lors du unmount)
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageEvent);
    }
    this.listeners.clear();
  }
}

/**
 * Instance globale du DataStore
 * Pour le moment : LocalStorageDataStore
 * Migration Supabase : remplacer par SupabaseDataStore
 */
export const dataStore = new LocalStorageDataStore();

/**
 * EXEMPLE FUTUR - SupabaseDataStore (à implémenter plus tard)
 *
 * export class SupabaseDataStore implements DataStore {
 *   constructor(private client: SupabaseClient) {}
 *
 *   async get<T>(key: string): Promise<T | null> {
 *     const { data } = await this.client
 *       .from(this.getTableName(key))
 *       .select('*')
 *       .eq('barId', this.getCurrentBarId());
 *     return data as T;
 *   }
 *
 *   async set<T>(key: string, value: T): Promise<void> {
 *     await this.client
 *       .from(this.getTableName(key))
 *       .upsert(value);
 *   }
 *
 *   subscribe<T>(key: string, callback: (value: T) => void): () => void {
 *     const channel = this.client
 *       .channel(`${key}-changes`)
 *       .on('postgres_changes', { event: '*' }, (payload) => {
 *         callback(payload.new as T);
 *       })
 *       .subscribe();
 *
 *     return () => channel.unsubscribe();
 *   }
 * }
 */
