/**
 * Mock for Service Worker API
 * Simulates navigator.serviceWorker for testing BG Sync and message passing
 */

export interface MockServiceWorkerClient {
  postMessage(message: any): void;
  url: string;
}

/**
 * Mock Service Worker Registration
 */
export class MockServiceWorkerRegistration {
  sync: {
    register: (tag: string) => Promise<void>;
  };
  installing: ServiceWorker | null = null;
  waiting: ServiceWorker | null = null;
  active: ServiceWorker | null = null;

  constructor() {
    this.sync = {
      register: async (tag: string) => {
        // Simulate registration
        await new Promise(resolve => setTimeout(resolve, 10));
      },
    };
  }

  async update(): Promise<void> {
    // Simulate SW update check
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    // Mock addEventListener
  }
}

/**
 * Mock Service Worker Container
 */
export class MockServiceWorkerContainer extends EventTarget {
  controller: ServiceWorker | null = null;
  ready: Promise<ServiceWorkerRegistration>;
  private registration: MockServiceWorkerRegistration;
  private messageListeners: ((event: MessageEvent) => void)[] = [];
  private syncListeners: ((event: any) => void)[] = [];

  constructor() {
    super();
    this.registration = new MockServiceWorkerRegistration();
    this.ready = Promise.resolve(this.registration as any);
  }

  async register(scriptURL: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration> {
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.registration as any;
  }

  async getRegistration(clientURL?: string): Promise<ServiceWorkerRegistration | undefined> {
    return this.registration as any;
  }

  async getRegistrations(): Promise<ReadonlyArray<ServiceWorkerRegistration>> {
    return [this.registration as any];
  }

  /**
   * Override addEventListener for message handling
   */
  addEventListener(type: string, listener: (event: MessageEvent) => void, options?: boolean | AddEventListenerOptions): void {
    if (type === 'message') {
      this.messageListeners.push(listener);
    } else if (type === 'sync') {
      this.syncListeners.push(listener);
    }
    super.addEventListener(type, listener, options);
  }

  /**
   * Test utility: simulate message from SW
   */
  simulateMessage(message: any): void {
    const event = new MessageEvent('message', { data: message });
    this.messageListeners.forEach(listener => listener(event));
  }

  /**
   * Test utility: simulate sync event
   */
  simulateSyncEvent(tag: string): void {
    const event = {
      tag,
      waitUntil: (promise: Promise<any>) => {
        return promise;
      },
    };
    this.syncListeners.forEach(listener => listener(event));
  }

  /**
   * Test utility: get message history
   */
  getMessageHistory(): MessageEvent[] {
    return [];
  }

  /**
   * Test utility: reset
   */
  reset(): void {
    this.controller = null;
    this.messageListeners = [];
    this.syncListeners = [];
  }
}

/**
 * Setup Service Worker mock in global scope
 */
export function setupServiceWorkerMock(): MockServiceWorkerContainer {
  const swContainer = new MockServiceWorkerContainer();

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: swContainer,
  });

  return swContainer;
}

export function cleanupServiceWorkerMock(): void {
  delete (navigator as any).serviceWorker;
}
