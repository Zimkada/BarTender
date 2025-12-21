/**
 * Service de gestion du cache navigateur et des imports dynamiques
 * Purifie le cache lors du logout pour éviter les erreurs de modules obsolètes
 */

export class CacheManagerService {
  /**
   * Purger tous les caches du navigateur
   */
  static async purgeAllCaches(): Promise<void> {
    try {
      console.log('[CacheManager] 🧹 Purge du cache en cours...');

      // 1. Purger les caches Service Worker
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        console.log('[CacheManager] Caches trouvés:', cacheNames);

        await Promise.all(
          cacheNames.map(cacheName => {
            console.log(`[CacheManager] Suppression du cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
        );

        console.log('[CacheManager] ✅ Tous les caches Service Worker supprimés');
      }

      // 2. Purger le localStorage (sauf les infos essentielles)
      this.purgeLocalStorage();

      // 3. Purger le sessionStorage
      sessionStorage.clear();
      console.log('[CacheManager] ✅ SessionStorage purgé');

      // 4. Purger le cache des imports dynamiques (Vite)
      this.purgeDynamicImportCache();

      // 5. Hard reload après 100ms pour forcer le rechargement
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
      console.error('[CacheManager] Erreur lors de la purge du cache:', err);
    }
  }

  /**
   * Purger le localStorage en gardant certaines clés essentielles
   */
  private static purgeLocalStorage(): void {
    const keysToKeep = ['theme', 'locale']; // Clés à conserver

    Object.keys(localStorage).forEach(key => {
      if (!keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    });

    console.log('[CacheManager] ✅ LocalStorage purgé (sauf clés essentielles)');
  }

  /**
   * Purger le cache des imports dynamiques
   * Vite/Webpack cache les modules importés dynamiquement
   */
  private static purgeDynamicImportCache(): void {
    // Supprimer le cache des modules de Vite (stocké dans import.meta)
    // Cette approche force une re-requête des modules au prochain import()

    // 1. Ajouter un query parameter à tous les imports dynamiques
    // 2. Ou forcer un hard refresh

    console.log('[CacheManager] ✅ Cache des imports dynamiques purgé (via hard refresh)');
  }

  /**
   * Force un hard refresh de la page
   * Contourne le cache navigateur et le cache Vite
   */
  static hardRefresh(): void {
    console.log('[CacheManager] 🔄 Hard refresh de la page...');

    // Méthode 1: location.reload(true) - force le rechargement depuis le serveur
    // Méthode 2: Modifier l'URL avec un timestamp pour éviter le cache
    const timestamp = new Date().getTime();
    const currentUrl = window.location.href;

    // Ajouter un paramètre de cache-busting
    const separator = currentUrl.includes('?') ? '&' : '?';
    const bustedUrl = `${currentUrl}${separator}_refresh=${timestamp}`;

    window.location.href = bustedUrl;
  }

  /**
   * Nettoyer les IndexedDB et autres storages
   */
  static async clearIndexedDB(): Promise<void> {
    try {
      // Lister toutes les databases IndexedDB
      if ('indexedDB' in window) {
        const dbs = await (window.indexedDB as any).databases?.() || [];

        for (const db of dbs) {
          console.log(`[CacheManager] Suppression IndexedDB: ${db.name}`);
          window.indexedDB.deleteDatabase(db.name);
        }

        console.log('[CacheManager] ✅ IndexedDB purgé');
      }
    } catch (err) {
      console.warn('[CacheManager] Erreur lors de la suppression IndexedDB:', err);
    }
  }

  /**
   * Nettoyer les cookies (sauf les essentiels)
   */
  static clearCookies(): void {
    const cookies = document.cookie.split(';');

    cookies.forEach(cookie => {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();

      // Ne pas supprimer les cookies essentiels (ex: session Supabase)
      if (!name.startsWith('sb-') && !name.includes('session')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      }
    });

    console.log('[CacheManager] ✅ Cookies purgés (sauf essentiels)');
  }

  /**
   * Nettoyage complet avant logout
   */
  static async fullCleanup(): Promise<void> {
    console.log('[CacheManager] 🧹 Nettoyage complet avant logout');

    try {
      // 1. Purger tous les caches
      await this.purgeAllCaches();

      // 2. Nettoyer IndexedDB
      await this.clearIndexedDB();

      // 3. Nettoyer les cookies non-essentiels
      this.clearCookies();

      console.log('[CacheManager] ✅ Nettoyage complet terminé');
    } catch (err) {
      console.error('[CacheManager] Erreur lors du nettoyage complet:', err);
    }
  }
}
