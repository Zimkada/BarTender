// Vitest setup file
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock BroadcastChannel if not available
if (typeof BroadcastChannel === 'undefined') {
  global.BroadcastChannel = class BroadcastChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;

    constructor(name: string) {
      this.name = name;
    }

    postMessage(message: any) {
      // Mock implementation
    }

    close() {
      // Mock implementation
    }

    addEventListener(type: string, listener: any) {
      // Mock implementation
    }

    removeEventListener(type: string, listener: any) {
      // Mock implementation
    }

    dispatchEvent(event: Event) {
      return true;
    }
  } as any;
}
