/**
 * Mock for Web Locks API
 * Simulates navigator.locks for testing sync coordination
 */

export interface MockLockRequest {
  name: string;
  options?: { ifAvailable?: boolean; steal?: boolean };
  callback: (lock: LockInfo | null) => Promise<void>;
}

export interface LockInfo {
  name: string;
  mode: 'exclusive' | 'shared';
}

/**
 * Simulated Web Locks manager
 */
export class MockLocks {
  private activeLocks: Map<string, LockInfo> = new Map();
  private lockQueue: MockLockRequest[] = [];
  private requestDelay = 0; // For testing timing issues

  /**
   * Request a lock (simulates navigator.locks.request)
   */
  async request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean } | undefined,
    callback: (lock: LockInfo | null) => Promise<void>
  ): Promise<void> {
    // Simulate async behavior
    await new Promise(resolve => setTimeout(resolve, this.requestDelay));

    const ifAvailable = options?.ifAvailable ?? false;

    // If lock is available, acquire it
    if (!this.activeLocks.has(name)) {
      const lockInfo: LockInfo = { name, mode: 'exclusive' };
      this.activeLocks.set(name, lockInfo);

      try {
        await callback(lockInfo);
      } finally {
        // Release lock
        this.activeLocks.delete(name);
        // Process queue
        this.processQueue();
      }
      return;
    }

    // Lock is held
    if (ifAvailable) {
      // Don't wait, call with null (skip) - immediately
      await new Promise(resolve => setTimeout(resolve, 0));
      await callback(null);
      return;
    }

    // Wait for lock to be available
    return new Promise<void>(resolve => {
      this.lockQueue.push({
        name,
        options,
        callback: async (lock) => {
          await callback(lock);
          resolve();
        },
      });
    });
  }

  /**
   * Simulate lock release and process queue
   */
  private processQueue(): void {
    const nextRequest = this.lockQueue.shift();
    if (!nextRequest) return;

    this.request(nextRequest.name, nextRequest.options, nextRequest.callback).then(() => {
      this.processQueue();
    });
  }

  /**
   * Test utility: check if lock is held
   */
  isLockHeld(name: string): boolean {
    return this.activeLocks.has(name);
  }

  /**
   * Test utility: set artificial delay (for race condition testing)
   */
  setRequestDelay(ms: number): void {
    this.requestDelay = ms;
  }

  /**
   * Test utility: reset all locks
   */
  reset(): void {
    this.activeLocks.clear();
    this.lockQueue = [];
    this.requestDelay = 0;
  }
}

/**
 * Setup Web Locks mock in global scope
 */
export function setupWebLocksMock(): MockLocks {
  const mockLocks = new MockLocks();

  (global.navigator as any).locks = mockLocks;

  return mockLocks;
}

export function cleanupWebLocksMock(): void {
  delete (global.navigator as any).locks;
}
