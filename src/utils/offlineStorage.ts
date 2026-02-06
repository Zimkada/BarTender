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
} as const;

export class OfflineStorage {
  /**
   * Sauvegarder la liste des bars
   */
  static saveBars(bars: Bar[]): void {
    try {
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
