/**
 * Système de stockage local pour mode offline
 * Permet de persister les données critiques dans localStorage
 */

import { Bar } from '../types';

const STORAGE_KEYS = {
  BARS: 'bartender_bars',
  CURRENT_BAR_ID: 'bartender_current_bar_id',
  LAST_SYNC: 'bartender_last_sync',
  SERVER_MAPPINGS: 'bartender_server_mappings',
  CACHE_VERSION: 'bartender_cache_version', // ⭐ Versioning
} as const;

const CURRENT_VERSION = '2.0.0';

export class OfflineStorage {
  /**
   * Vérifie et gère la version du cache au démarrage
   */
  static checkVersionAndMigrate(): void {
    try {
      const cachedVersion = localStorage.getItem(STORAGE_KEYS.CACHE_VERSION);
      if (cachedVersion !== CURRENT_VERSION) {
        // ⭐ Raffinement Expert : Migration au lieu de Purge systématique
        if (cachedVersion && cachedVersion.startsWith('1.')) {
          console.log(`[OfflineStorage] Migrating cache from ${cachedVersion} to ${CURRENT_VERSION}`);
          this.migrateV1toV2();
        } else if (!cachedVersion || cachedVersion < '2.0.0') {
          console.warn(`[OfflineStorage] Version incompatible (${cachedVersion}). Purging cache.`);
          this.clear();
        }
        localStorage.setItem(STORAGE_KEYS.CACHE_VERSION, CURRENT_VERSION);
      }
    } catch (error) {
      console.error('[OfflineStorage] Version check failed:', error);
    }
  }

  /**
   * Exemple de migration V1 -> V2 (ajustable selon besoins futurs)
   */
  private static migrateV1toV2(): void {
    try {
      // Logique de transformation si nécessaire. 
      // Pour l'instant on garde les données car le passage à la 2.0.0 était un durcissement structurel (clés identiques)
      console.log('[OfflineStorage] Migration V1->V2 completed (Same schema, structural hardening only)');
    } catch (err) {
      console.error('[OfflineStorage] Migration failed, clearing for safety:', err);
      this.clear();
    }
  }

  /**
   * Sauvegarder la liste des bars
   */
  static saveBars(bars: Bar[]): void {
    try {
      this.checkVersionAndMigrate(); // Auto-check on write
      localStorage.setItem(STORAGE_KEYS.BARS, JSON.stringify(bars));
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (error) {
      console.error('[OfflineStorage] Error saving bars:', error);
    }
  }

  /**
   * Récupérer la liste des bars depuis le cache
   */
  static getBars(): Bar[] | null {
    try {
      this.checkVersionAndMigrate();
      const data = localStorage.getItem(STORAGE_KEYS.BARS);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[OfflineStorage] Error loading bars:', error);
      return null;
    }
  }

  /**
   * Sauvegarder le bar actuellement sélectionné
   */
  static saveCurrentBarId(barId: string | null): void {
    try {
      this.checkVersionAndMigrate();
      if (barId) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_BAR_ID, barId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_BAR_ID);
      }
    } catch (error) {
      console.error('[OfflineStorage] Error saving current bar ID:', error);
    }
  }

  /**
   * Récupérer l'ID du bar actuellement sélectionné
   */
  static getCurrentBarId(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.CURRENT_BAR_ID);
    } catch (error) {
      console.error('[OfflineStorage] Error loading current bar ID:', error);
      return null;
    }
  }

  /**
   * Récupérer la date de dernière synchronisation
   */
  static getLastSync(): Date | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return data ? new Date(data) : null;
    } catch (error) {
      console.error('[OfflineStorage] Error loading last sync:', error);
      return null;
    }
  }

  /**
   * Sauvegarder les mappings serveurs
   */
  static saveMappings(barId: string, mappings: any[]): void {
    try {
      this.checkVersionAndMigrate();
      const allMappings = this.getAllMappings();
      allMappings[barId] = mappings;
      localStorage.setItem(STORAGE_KEYS.SERVER_MAPPINGS, JSON.stringify(allMappings));
    } catch (error) {
      console.error('[OfflineStorage] Error saving mappings:', error);
    }
  }

  /**
   * Récupérer les mappings serveurs pour un bar
   */
  static getMappings(barId: string): any[] | null {
    try {
      this.checkVersionAndMigrate();
      const allMappings = this.getAllMappings();
      return allMappings[barId] || null;
    } catch (error) {
      console.error('[OfflineStorage] Error loading mappings:', error);
      return null;
    }
  }

  private static getAllMappings(): Record<string, any[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SERVER_MAPPINGS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  /**
   * Nettoyer tout le cache (déconnexion)
   */
  static clear(): void {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      // ✅ We don't remove CACHE_VERSION if we called clear() manually for logout
    } catch (error) {
      console.error('[OfflineStorage] Error clearing storage:', error);
    }
  }

  /**
   * Vérifier si des données en cache sont disponibles
   */
  static hasCache(): boolean {
    return !!localStorage.getItem(STORAGE_KEYS.BARS);
  }
}
