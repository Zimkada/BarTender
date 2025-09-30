export interface QueuedOperation {
  id: string;
  type: 'CREATE_SALE' | 'UPDATE_PRODUCT' | 'CREATE_RETURN' | 'UPDATE_STOCK';
  payload: unknown;
  timestamp: Date;
  retries: number;
  barId: string;
}

class OfflineQueue {
  private readonly STORAGE_KEY = 'pendingOperations';
  private readonly MAX_RETRIES = 3;

  // Récupérer toutes les opérations en attente
  getAll(): QueuedOperation[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Ajouter une opération
  add(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): void {
    const operations = this.getAll();
    const newOperation: QueuedOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      retries: 0
    };
    
    operations.push(newOperation);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(operations));
    
    // Déclencher un événement pour mettre à jour le compteur
    window.dispatchEvent(new CustomEvent('queue-updated', { 
      detail: { count: operations.length } 
    }));
  }

  // Supprimer une opération
  remove(id: string): void {
    const operations = this.getAll().filter(op => op.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(operations));
    
    window.dispatchEvent(new CustomEvent('queue-updated', { 
      detail: { count: operations.length } 
    }));
  }

  // Incrémenter les tentatives
  incrementRetries(id: string): boolean {
    const operations = this.getAll();
    const index = operations.findIndex(op => op.id === id);
    
    if (index !== -1) {
      operations[index].retries++;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(operations));
      
      // Retourner false si max retries atteint
      return operations[index].retries < this.MAX_RETRIES;
    }
    
    return false;
  }

  // Vider la queue
  clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('queue-updated', { 
      detail: { count: 0 } 
    }));
  }
}

export const offlineQueue = new OfflineQueue();