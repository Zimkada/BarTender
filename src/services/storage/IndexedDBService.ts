// IndexedDB Service - Stockage offline robuste pour Bénin
// Autonomie 7 jours + sync intelligente

import { Sale, Product, Category, Order, Supply } from '../../types';

interface BeninStorageData {
  sales: Sale[];
  products: Product[];
  categories: Category[];
  orders: Order[];
  supplies: Supply[];
  syncQueue: SyncOperation[];
  settings: BeninSettings;
  lastSync: Date;
}

interface SyncOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'sales' | 'products' | 'categories' | 'orders' | 'supplies';
  data: any;
  timestamp: Date;
  retryCount: number;
  priority: 'high' | 'normal' | 'low';
}

interface BeninSettings {
  currency: 'XOF';
  currencySymbol: ' FCFA';
  language: 'fr';
  barId: string;
  barName: string;
  timezone: 'Africa/Porto-Novo';
}

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'BarTenderBenin';
  private readonly dbVersion = 1;
  private readonly maxRetries = 5;

  constructor() {
    this.initializeDB();
  }

  // ===== INITIALISATION =====

  async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[IndexedDB] Erreur ouverture:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Base ouverte avec succès');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
      };
    });
  }

  private createStores(db: IDBDatabase): void {
    console.log('[IndexedDB] Création des stores...');

    // Store Sales - Ventes avec index sur date
    if (!db.objectStoreNames.contains('sales')) {
      const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
      salesStore.createIndex('date', 'date', { unique: false });
      salesStore.createIndex('barId', 'barId', { unique: false });
      salesStore.createIndex('processedBy', 'processedBy', { unique: false });
    }

    // Store Products - Inventaire avec index sur catégorie
    if (!db.objectStoreNames.contains('products')) {
      const productsStore = db.createObjectStore('products', { keyPath: 'id' });
      productsStore.createIndex('categoryId', 'categoryId', { unique: false });
      productsStore.createIndex('barId', 'barId', { unique: false });
      productsStore.createIndex('stock', 'stock', { unique: false });
    }

    // Store Categories
    if (!db.objectStoreNames.contains('categories')) {
      const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
      categoriesStore.createIndex('barId', 'barId', { unique: false });
    }

    // Store Orders - Commandes
    if (!db.objectStoreNames.contains('orders')) {
      const ordersStore = db.createObjectStore('orders', { keyPath: 'id' });
      ordersStore.createIndex('status', 'status', { unique: false });
      ordersStore.createIndex('barId', 'barId', { unique: false });
      ordersStore.createIndex('date', 'date', { unique: false });
    }

    // Store Supplies - Approvisionnements
    if (!db.objectStoreNames.contains('supplies')) {
      const suppliesStore = db.createObjectStore('supplies', { keyPath: 'id' });
      suppliesStore.createIndex('productId', 'productId', { unique: false });
      suppliesStore.createIndex('barId', 'barId', { unique: false });
      suppliesStore.createIndex('date', 'date', { unique: false });
    }

    // Store SyncQueue - File d'attente sync
    if (!db.objectStoreNames.contains('syncQueue')) {
      const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
      syncStore.createIndex('priority', 'priority', { unique: false });
      syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      syncStore.createIndex('retryCount', 'retryCount', { unique: false });
    }

    // Store Settings - Configuration locale
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }

    console.log('[IndexedDB] Stores créés avec succès');
  }

  // ===== CRUD OPERATIONS =====

  async save<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveMany<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let completed = 0;
      const total = items.length;

      if (total === 0) {
        resolve();
        return;
      }

      items.forEach((item) => {
        const request = store.put(item);

        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });
    });
  }

  async get<T>(storeName: string, id: string): Promise<T | null> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getByIndex<T>(
    storeName: string,
    indexName: string,
    value: any
  ): Promise<T[]> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== SALES OPERATIONS =====

  async saveSale(sale: Sale): Promise<void> {
    try {
      await this.save('sales', sale);

      // Ajouter à la queue de sync
      await this.addToSyncQueue({
        id: `sync_sale_${Date.now()}`,
        type: 'CREATE',
        entity: 'sales',
        data: sale,
        timestamp: new Date(),
        retryCount: 0,
        priority: 'high'
      });

      console.log('[IndexedDB] Vente sauvegardée:', sale.id);
    } catch (error) {
      console.error('[IndexedDB] Erreur sauvegarde vente:', error);
      throw error;
    }
  }

  async getTodaySales(barId: string): Promise<Sale[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const allSales = await this.getByIndex<Sale>('sales', 'barId', barId);

    return allSales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= today && saleDate < tomorrow;
    });
  }

  async getSalesByDateRange(
    barId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Sale[]> {
    const allSales = await this.getByIndex<Sale>('sales', 'barId', barId);

    return allSales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= startDate && saleDate <= endDate;
    });
  }

  // ===== INVENTORY OPERATIONS =====

  async updateProductStock(productId: string, newStock: number): Promise<void> {
    try {
      const product = await this.get<Product>('products', productId);
      if (!product) {
        throw new Error(`Produit ${productId} non trouvé`);
      }

      const updatedProduct = { ...product, stock: newStock };
      await this.save('products', updatedProduct);

      // Ajouter à la queue de sync
      await this.addToSyncQueue({
        id: `sync_stock_${Date.now()}`,
        type: 'UPDATE',
        entity: 'products',
        data: { id: productId, stock: newStock },
        timestamp: new Date(),
        retryCount: 0,
        priority: 'normal'
      });

      console.log('[IndexedDB] Stock mis à jour:', productId, newStock);
    } catch (error) {
      console.error('[IndexedDB] Erreur mise à jour stock:', error);
      throw error;
    }
  }

  async getLowStockProducts(barId: string): Promise<Product[]> {
    const products = await this.getByIndex<Product>('products', 'barId', barId);

    return products.filter(product =>
      product.stock <= product.alertThreshold
    );
  }

  // ===== SYNC QUEUE MANAGEMENT =====

  async addToSyncQueue(operation: SyncOperation): Promise<void> {
    try {
      await this.save('syncQueue', operation);
      console.log('[IndexedDB] Opération ajoutée à la queue:', operation.type, operation.entity);
    } catch (error) {
      console.error('[IndexedDB] Erreur ajout queue sync:', error);
    }
  }

  async getPendingSyncOperations(): Promise<SyncOperation[]> {
    const operations = await this.getAll<SyncOperation>('syncQueue');

    // Trier par priorité puis par timestamp
    return operations.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }

  async markSyncOperationCompleted(operationId: string): Promise<void> {
    try {
      await this.delete('syncQueue', operationId);
      console.log('[IndexedDB] Opération sync complétée:', operationId);
    } catch (error) {
      console.error('[IndexedDB] Erreur marquage sync:', error);
    }
  }

  async incrementSyncRetry(operationId: string): Promise<void> {
    try {
      const operation = await this.get<SyncOperation>('syncQueue', operationId);
      if (operation) {
        operation.retryCount++;

        if (operation.retryCount >= this.maxRetries) {
          // Trop de tentatives, supprimer ou archiver
          await this.delete('syncQueue', operationId);
          console.warn('[IndexedDB] Opération abandonnée après max retries:', operationId);
        } else {
          await this.save('syncQueue', operation);
          console.log('[IndexedDB] Retry count incrémenté:', operationId, operation.retryCount);
        }
      }
    } catch (error) {
      console.error('[IndexedDB] Erreur increment retry:', error);
    }
  }

  // ===== SETTINGS =====

  async saveSettings(settings: BeninSettings): Promise<void> {
    try {
      await this.save('settings', { key: 'beninConfig', ...settings });
      console.log('[IndexedDB] Configuration sauvegardée');
    } catch (error) {
      console.error('[IndexedDB] Erreur sauvegarde config:', error);
      throw error;
    }
  }

  async getSettings(): Promise<BeninSettings | null> {
    try {
      const result = await this.get<any>('settings', 'beninConfig');
      return result ? { ...result } : null;
    } catch (error) {
      console.error('[IndexedDB] Erreur récupération config:', error);
      return null;
    }
  }

  // ===== MAINTENANCE =====

  async clearOldData(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      // Nettoyer les ventes anciennes
      const oldSales = await this.getAll<Sale>('sales');
      const salesToDelete = oldSales.filter(sale =>
        new Date(sale.date) < cutoffDate
      );

      for (const sale of salesToDelete) {
        await this.delete('sales', sale.id);
      }

      console.log(`[IndexedDB] ${salesToDelete.length} ventes anciennes supprimées`);
    } catch (error) {
      console.error('[IndexedDB] Erreur nettoyage:', error);
    }
  }

  async getStorageSize(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }

    return { used: 0, quota: 0 };
  }

  // ===== BACKUP/RESTORE =====

  async exportData(): Promise<BeninStorageData> {
    try {
      const [sales, products, categories, orders, supplies, syncQueue, settings] = await Promise.all([
        this.getAll<Sale>('sales'),
        this.getAll<Product>('products'),
        this.getAll<Category>('categories'),
        this.getAll<Order>('orders'),
        this.getAll<Supply>('supplies'),
        this.getAll<SyncOperation>('syncQueue'),
        this.getSettings()
      ]);

      return {
        sales,
        products,
        categories,
        orders,
        supplies,
        syncQueue,
        settings: settings || {
          currency: 'XOF',
          currencySymbol: ' FCFA',
          language: 'fr',
          barId: '',
          barName: '',
          timezone: 'Africa/Porto-Novo'
        },
        lastSync: new Date()
      };
    } catch (error) {
      console.error('[IndexedDB] Erreur export:', error);
      throw error;
    }
  }

  async importData(data: BeninStorageData): Promise<void> {
    try {
      await Promise.all([
        this.saveMany('sales', data.sales),
        this.saveMany('products', data.products),
        this.saveMany('categories', data.categories),
        this.saveMany('orders', data.orders),
        this.saveMany('supplies', data.supplies),
        this.saveMany('syncQueue', data.syncQueue)
      ]);

      if (data.settings) {
        await this.saveSettings(data.settings);
      }

      console.log('[IndexedDB] Import des données complété');
    } catch (error) {
      console.error('[IndexedDB] Erreur import:', error);
      throw error;
    }
  }
}

// Export singleton
export const indexedDBService = new IndexedDBService();
export type { BeninStorageData, SyncOperation, BeninSettings };