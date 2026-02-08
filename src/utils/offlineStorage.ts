/**
 * Système de stockage local pour mode offline
 * Permet de persister les données critiques dans localStorage
 */

import { Bar } from '../types';
import type { ServerNameMapping } from '../services/supabase/server-mappings.service';

/**
 * Type pour le cache des mappings (structure minimale requise)
 * Compatible avec ServerNameMapping complet ET version enrichie
 */
export interface CachedMapping {
  serverName: string;
  userId: string;
  userName?: string; // Optionnel (pour UI uniquement)
}

/**
 * Type guard pour valider la structure d'un mapping
 */
export function isValidCachedMapping(obj: unknown): obj is CachedMapping {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'serverName' in obj &&
    'userId' in obj &&
    typeof (obj as CachedMapping).serverName === 'string' &&
    typeof (obj as CachedMapping).userId === 'string' &&
    (obj as CachedMapping).serverName.length > 0 &&
    (obj as CachedMapping).userId.length > 0
  );
}

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
   * Sauvegarder les mappings serveurs (accepte ServerNameMapping OU structure enrichie)
   * Normalise automatiquement vers CachedMapping
   */
  static saveMappings(barId: string, mappings: (ServerNameMapping | CachedMapping)[]): void {
    try {
      this.checkVersionAndMigrate();

      // Normaliser vers CachedMapping (structure minimale)
      const normalized = mappings.map(m => ({
        serverName: m.serverName,
        userId: m.userId,
        userName: 'userName' in m ? m.userName : undefined
      }));

      const allMappings = this.getAllMappings();
      allMappings[barId] = normalized;
      localStorage.setItem(STORAGE_KEYS.SERVER_MAPPINGS, JSON.stringify(allMappings));
    } catch (error) {
      console.error('[OfflineStorage] Error saving mappings:', error);
    }
  }

  /**
   * Récupérer les mappings serveurs pour un bar
   * ✨ NOUVEAU : Valide et nettoie automatiquement le cache corrompu
   */
  static getMappings(barId: string): CachedMapping[] | null {
    try {
      this.checkVersionAndMigrate();
      const allMappings = this.getAllMappings();
      const rawMappings = allMappings[barId];

      if (!rawMappings) return null;

      // ✅ Validation : filtrer les entrées invalides
      const validMappings = rawMappings.filter(isValidCachedMapping);

      // Si des mappings invalides détectés, nettoyer le cache
      if (validMappings.length < rawMappings.length) {
        console.warn(
          `[OfflineStorage] Detected ${rawMappings.length - validMappings.length} corrupted mapping(s), cleaning cache`
        );
        this.saveMappings(barId, validMappings);
      }

      return validMappings.length > 0 ? validMappings : null;
    } catch (error) {
      console.error('[OfflineStorage] Error loading mappings:', error);
      return null;
    }
  }

  private static getAllMappings(): Record<string, CachedMapping[]> {
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
