/**
 * stock-lifecycle.integration.test.tsx
 * Integration: Stock Hook ↔ Stock Queries ↔ Stock Mutations
 *
 * Tests complete stock workflows:
 * - Add product → Query appears → Adjust stock → Mutation reflects
 * - Consignment lifecycle: Create → Claim → Expire
 * - Supply intake with stock updates
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedStock } from '../../hooks/pivots/useUnifiedStock';

// Mock implementations - must be initialized with default values
const mockUseProducts = vi.fn(() => ({ data: [], isLoading: false }));
const mockUseSupplies = vi.fn(() => ({ data: [], isLoading: false }));
const mockUseConsignments = vi.fn(() => ({ data: [], isLoading: false }));
const mockUseCategories = vi.fn(() => ({ data: [], isLoading: false }));

vi.mock('../../hooks/queries/useStockQueries', () => ({
  useProducts: mockUseProducts,
  useSupplies: mockUseSupplies,
  useConsignments: mockUseConsignments,
  useCategories: mockUseCategories,
  stockKeys: { all: ['stock'] },
}));

const mockUseStockMutations = vi.fn(() => ({
  createProduct: { mutateAsync: vi.fn().mockResolvedValue(true) },
  updateProduct: { mutateAsync: vi.fn().mockResolvedValue(true) },
  deleteProduct: { mutateAsync: vi.fn().mockResolvedValue(true) },
  adjustStock: { mutateAsync: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../hooks/mutations/useStockMutations', () => ({
  useStockMutations: mockUseStockMutations,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'gérant' },
  })),
}));

vi.mock('../../services/offlineQueue', () => ({
  offlineQueue: {
    getOperations: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../services/SyncManager', () => ({
  syncManager: {
    getRecentlySyncedKeys: vi.fn(() => new Map()),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Stock Lifecycle Integration', () => {
  const barId = 'bar-123';
  let mockProducts: any[];
  let mockMutations: any;

  beforeEach(() => {
    mockProducts = [];
    mockMutations = {
      createProduct: { mutateAsync: vi.fn().mockResolvedValue(true) },
      updateProduct: { mutateAsync: vi.fn().mockResolvedValue(true) },
      deleteProduct: { mutateAsync: vi.fn().mockResolvedValue(true) },
      adjustStock: { mutateAsync: vi.fn().mockResolvedValue(true) },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('📦 Product Lifecycle', () => {
    it('should add product and reflect in queries', async () => {
      mockUseProducts.mockReturnValueOnce({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      // Initially empty
      expect(result.current.products.length).toBe(0);

      // Add product
      await expect(
        result.current.addProduct({
          name: 'Heineken',
          sku: 'HEIN-001',
          stock: 100,
          price: 5.5,
          barId,
        })
      ).resolves.toBeDefined();
    });

    it('should update product stock when adjusted', async () => {
      const { useProducts } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      const initialProduct = {
        id: 'prod-1',
        name: 'Heineken',
        stock: 100,
        barId,
      };

      (useProducts as any).mockReturnValue({
        data: [initialProduct],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      // Verify product loaded
      await waitFor(() => {
        expect(result.current.products.length).toBe(1);
      });

      // Adjust stock
      await result.current.increasePhysicalStock('prod-1', 10);

      expect(mockMutations.adjustStock.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          quantity: 10,
        })
      );
    });

    it('should delete product when requested', async () => {
      const { useProducts } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useProducts as any).mockReturnValue({
        data: [{ id: 'prod-1', name: 'Heineken', stock: 100, barId }],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await result.current.deleteProduct('prod-1');

      expect(mockMutations.deleteProduct.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'prod-1' })
      );
    });
  });

  describe('🎁 Consignment Lifecycle', () => {
    it('should create and track consignment', async () => {
      const { useConsignments } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useConsignments as any).mockReturnValue({
        data: [],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const consignmentData = {
        productId: 'prod-1',
        quantity: 50,
        expiryDate: '2025-12-31',
        supplierName: 'Distributor Inc',
        barId,
      };

      await result.current.createConsignment(consignmentData);

      expect(mockMutations.createProduct.mutateAsync).toHaveBeenCalled();
    });

    it('should claim consignment and reduce available quantity', async () => {
      const { useConsignments } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useConsignments as any).mockReturnValue({
        data: [
          {
            id: 'consign-1',
            productId: 'prod-1',
            quantity: 50,
            status: 'active',
            barId,
          },
        ],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await result.current.claimConsignment('consign-1', 30);

      expect(mockMutations.updateProduct.mutateAsync).toHaveBeenCalled();
    });

    it('should forfeit unclaimed consignment', async () => {
      const { useConsignments } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useConsignments as any).mockReturnValue({
        data: [
          {
            id: 'consign-1',
            status: 'active',
            barId,
          },
        ],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await result.current.forfeitConsignment('consign-1');

      expect(mockMutations.deleteProduct.mutateAsync).toHaveBeenCalled();
    });
  });

  describe('📥 Supply Processing', () => {
    it('should process supply and update stock', async () => {
      const { useSupplies } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useSupplies as any).mockReturnValue({
        data: [],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const supplyData = {
        items: [
          { productId: 'prod-1', quantity: 50, cost: 2.5 },
          { productId: 'prod-2', quantity: 100, cost: 1.2 },
        ],
        supplierName: 'Main Distributor',
        barId,
      };

      await result.current.processSupply(supplyData);

      expect(mockMutations.createProduct.mutateAsync).toHaveBeenCalled();
    });
  });

  describe('🔄 Batch Operations', () => {
    it('should add multiple products in batch', async () => {
      const { useProducts } = await import('../../hooks/queries/useStockQueries');
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useProducts as any).mockReturnValue({
        data: [],
        isLoading: false,
      });

      (useStockMutations as any).mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const products = [
        { name: 'Beer 1', sku: 'B1', stock: 100, price: 5, barId },
        { name: 'Beer 2', sku: 'B2', stock: 200, price: 6, barId },
        { name: 'Beer 3', sku: 'B3', stock: 150, price: 5.5, barId },
      ];

      await result.current.addProducts(products);

      expect(mockMutations.createProduct.mutateAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('⚠️ Error Handling', () => {
    it('should handle add product failure gracefully', async () => {
      const { useStockMutations } = await import('../../hooks/mutations/useStockMutations');

      (useStockMutations as any).mockReturnValue({
        createProduct: {
          mutateAsync: vi
            .fn()
            .mockRejectedValue(new Error('Database error')),
        },
        updateProduct: { mutateAsync: vi.fn() },
        deleteProduct: { mutateAsync: vi.fn() },
        adjustStock: { mutateAsync: vi.fn() },
      });

      const { useProducts } = await import('../../hooks/queries/useStockQueries');
      (useProducts as any).mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.addProduct({
          name: 'Beer',
          sku: 'B1',
          stock: 100,
          price: 5,
          barId,
        })
      ).rejects.toThrow();
    });
  });
});
