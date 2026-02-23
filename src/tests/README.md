# Test Suite Documentation

## Overview

Comprehensive test suite for BarTender's offline-first architecture, with focus on Phase 2 (Background Sync API) critical functionality.

## Test Structure

```
src/tests/
├── mocks/
│   ├── supabase.mock.ts          (Supabase API mocking)
│   ├── webLocks.mock.ts          (Web Locks API simulation)
│   └── serviceWorker.mock.ts     (Service Worker API simulation)
├── unit/
│   ├── useUnifiedStock.test.tsx
│   ├── useUnifiedSales.test.tsx
│   ├── useUnifiedReturns.test.tsx
│   └── useUnifiedStock.parity.test.tsx
├── integration/
│   ├── offline-resilience.integration.test.tsx
│   ├── sales-sync.integration.test.tsx
│   ├── stock-lifecycle.integration.test.tsx
│   ├── batching-sync.integration.test.ts
│   ├── rbac-filtering.integration.test.tsx
│   ├── syncManager.backgroundSync.test.ts     (NEW)
│   └── syncManager.rescue.test.ts             (NEW)
└── setup.ts                       (Global test setup)
```

## Phase 2 Test Coverage

### 1. Background Sync Tests (`syncManager.backgroundSync.test.ts`)

#### Web Locks Coordination
- ✅ Exclusive lock acquisition
- ✅ Lock skipping with `ifAvailable: true`
- ✅ Prevent concurrent syncs across tabs

#### Background Sync Registration
- ✅ Sync tag registration
- ✅ Graceful handling of missing BG Sync API

#### Service Worker Message Communication
- ✅ Receive `SYNC_REQUEST` messages
- ✅ Ignore invalid message types

#### Multi-Tab Synchronization
- ✅ Broadcast sync completion
- ✅ Handle batch operations
- ✅ Remove sync keys

#### Race Condition Prevention
- ✅ Prevent concurrent `syncAll()` calls
- ✅ Handle rapid BG Sync events

#### Browser Compatibility
- ✅ Fallback to online event
- ✅ Handle missing Service Worker

### 2. Rescue System Tests (`syncManager.rescue.test.ts`)

#### Stuck Operations Recovery
- ✅ Detect operations stuck in `syncing` state
- ✅ Reset stuck operations to `pending`
- ✅ Rescue all stuck operations on sync start

#### Error Operations Recovery
- ✅ Identify operations in `error` state
- ✅ Reset errors for retry
- ✅ Preserve operation data

#### Browser Crash Recovery
- ✅ Handle app crash during sale sync
- ✅ Prevent data loss
- ✅ Prevent duplicates with idempotency keys

#### Performance
- ✅ Handle 100+ stuck operations
- ✅ Non-blocking UI during rescue

#### Data Consistency
- ✅ Maintain operation order
- ✅ Prevent data loss during batch processing

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test File
```bash
npm test src/tests/integration/syncManager.backgroundSync.test.ts
```

### With UI
```bash
npm test:ui
```

### Coverage Report
```bash
npm test:coverage
```

## Mock Usage

### Web Locks Mock
```typescript
import { setupWebLocksMock, cleanupWebLocksMock, MockLocks } from '../mocks/webLocks.mock';

beforeEach(() => {
  mockLocks = setupWebLocksMock();
});

afterEach(() => {
  cleanupWebLocksMock();
});

// Use navigator.locks as normal
```

### Service Worker Mock
```typescript
import { setupServiceWorkerMock, cleanupServiceWorkerMock, MockServiceWorkerContainer } from '../mocks/serviceWorker.mock';

beforeEach(() => {
  mockSW = setupServiceWorkerMock();
});

afterEach(() => {
  cleanupServiceWorkerMock();
});

// Test utilities
mockSW.simulateMessage({ type: 'SYNC_REQUEST', ... });
mockSW.simulateSyncEvent('sync-tag');
```

## Test Patterns

### Unit Test Pattern
```typescript
describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange
    const input = ...;

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Integration Test Pattern
```typescript
describe('Feature Integration', () => {
  beforeEach(() => {
    // Setup mocks and state
  });

  it('should handle scenario X', async () => {
    // Arrange: Setup state and mocks
    // Act: Execute functionality
    // Assert: Verify behavior and side effects
  });

  afterEach(() => {
    // Cleanup
  });
});
```

## Critical Test Areas

### 1. Offline Data Persistence
- IndexedDB operations
- Local storage persistence
- Cache invalidation

### 2. Sync Reliability
- Idempotency key handling
- Duplicate prevention
- Retry logic

### 3. Network Resilience
- Timeout handling
- Connection transitions
- Graceful degradation

### 4. Data Integrity
- Operation ordering
- Transactional consistency
- Error recovery

### 5. Performance
- Large dataset handling
- Memory leak prevention
- UI responsiveness

## Known Limitations

1. **BroadcastChannel Mock**: Simplified implementation for testing
   - Real API behavior may differ in edge cases
   - Consider E2E tests for cross-tab scenarios

2. **Web Locks Mock**: Synchronous in some operations
   - Real API is fully asynchronous
   - Queue processing may behave differently

3. **Service Worker Mock**: Limited event simulation
   - Actual SW lifecycle more complex
   - Background Sync events may vary by browser

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Add performance benchmarks
- [ ] Add memory profiling tests
- [ ] Add visual regression tests
- [ ] Add accessibility tests
- [ ] Add security tests (CORS, CSP)

## Contributing

When adding new tests:

1. Follow AAA pattern (Arrange, Act, Assert)
2. Use descriptive test names
3. Keep tests focused and independent
4. Mock external dependencies
5. Add comments for non-obvious logic
6. Ensure tests are deterministic (no flakiness)

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Testing Library](https://testing-library.com)
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Lock)
- [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Sync_API)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
