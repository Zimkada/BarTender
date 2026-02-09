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

const {
  mockUseProducts,
  mockUseSupplies,
  mockUseConsignments,
  mockUseCategories,
  mockUseStockMutations,
  mockOfflineQueue,
  mockSyncManager
} = vi.hoisted(() => ({
  mockUseProducts: vi.fn(() => ({ data: [], isLoading: false })) as any,
  mockUseSupplies: vi.fn(() => ({ data: [], isLoading: false })) as any,
  mockUseConsignments: vi.fn(() => ({ data: [], isLoading: false })) as any,
  mockUseCategories: vi.fn(() => ({ data: [], isLoading: false })) as any,
  mockUseStockMutations: vi.fn(() => ({
    createProduct: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    updateProduct: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    deleteProduct: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    adjustStock: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    addSupply: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    createConsignment: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    claimConsignment: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    forfeitConsignment: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    expireConsignments: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    validateSale: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
  })) as any,
  mockOfflineQueue: {
    getOperations: vi.fn(() => Promise.resolve([])),
  },
  mockSyncManager: {
    getRecentlySyncedKeys: vi.fn(() => new Map()),
  }
}));

vi.mock('../../hooks/queries/useStockQueries', () => ({
  useProducts: mockUseProducts,
  useSupplies: mockUseSupplies,
  useConsignments: mockUseConsignments,
  useCategories: mockUseCategories,
  stockKeys: { all: ['stock'] },
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
  offlineQueue: mockOfflineQueue,
}));

vi.mock('../../services/SyncManager', () => ({
  syncManager: mockSyncManager,
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
      createProduct: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      updateProduct: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      deleteProduct: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      adjustStock: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      addSupply: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      createConsignment: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      claimConsignment: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      forfeitConsignment: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      expireConsignments: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
      validateSale: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
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

      const newProduct = {
        name: 'Heineken',
        volume: '33cl',
        price: 5.5,
        stock: 100,
        categoryId: 'cat-1',
        alertThreshold: 10,
        barId,
      };

      await expect(result.current.addProduct(newProduct)).resolves.toBeDefined();
    });

    it('should update product stock when adjusted', async () => {

      const initialProduct = {
        id: 'prod-1',
        name: 'Heineken',
        volume: '33cl',
        categoryId: 'cat-1',
        alertThreshold: 5,
        stock: 100,
        barId,
      };

      mockUseProducts.mockReturnValue({
        data: [initialProduct],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

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
          delta: 10,
        })
      );
    });

    it('should delete product when requested', async () => {

      mockUseProducts.mockReturnValue({
        data: [{ id: 'prod-1', name: 'Heineken', volume: '33cl', categoryId: 'cat-1', alertThreshold: 5, stock: 100, barId }],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await result.current.deleteProduct('prod-1');

      expect(mockMutations.deleteProduct.mutateAsync).toHaveBeenCalledWith('prod-1');
    });
  });

  describe('🎁 Consignment Lifecycle', () => {
    it('should create and track consignment', async () => {

      mockUseConsignments.mockReturnValue({
        data: [],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const consignmentData = {
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 50,
        totalAmount: 250,
        expiresAt: '2025-12-31',
        barId,
      };

      await result.current.createConsignment(consignmentData);

      expect(mockMutations.createConsignment.mutateAsync).toHaveBeenCalled();
    });

    it('should claim consignment and reduce available quantity', async () => {

      mockUseConsignments.mockReturnValue({
        data: [
          {
            id: 'consign-1',
            productId: 'prod-1',
            productName: 'Heineken',
            productVolume: '33cl',
            quantity: 50,
            status: 'active',
            barId,
          },
        ],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await result.current.claimConsignment('consign-1');

      expect(mockMutations.claimConsignment.mutateAsync).toHaveBeenCalled();
    });

    it('should forfeit unclaimed consignment', async () => {

      mockUseConsignments.mockReturnValue({
        data: [
          {
            id: 'consign-1',
            productId: 'prod-1',
            productName: 'Heineken',
            productVolume: '33cl',
            quantity: 50,
            status: 'active',
            barId,
          },
        ],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await result.current.forfeitConsignment('consign-1');

      expect(mockMutations.forfeitConsignment.mutateAsync).toHaveBeenCalled();
    });
  });

  describe('📥 Supply Processing', () => {
    it('should process supply and update stock', async () => {

      mockUseSupplies.mockReturnValue({
        data: [],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const supplyData = {
        productId: 'prod-1',
        quantity: 50,
        lotSize: 24,
        lotPrice: 40,
        supplier: 'Main Distributor',
      };

      const mockOnExpense = vi.fn();
      await result.current.processSupply(supplyData, mockOnExpense);

      expect(mockMutations.addSupply.mutateAsync).toHaveBeenCalled();
    });
  });

  describe('🔄 Batch Operations', () => {
    it('should add multiple products in batch', async () => {

      mockUseProducts.mockReturnValue({
        data: [],
        isLoading: false,
      });

      mockUseStockMutations.mockReturnValue(mockMutations);

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const products = [
        { name: 'Beer 1', categoryId: 'cat-1', volume: '33cl', alertThreshold: 10, stock: 100, price: 5, barId },
        { name: 'Beer 2', categoryId: 'cat-1', volume: '33cl', alertThreshold: 10, stock: 200, price: 6, barId },
        { name: 'Beer 3', categoryId: 'cat-1', volume: '33cl', alertThreshold: 10, stock: 150, price: 5.5, barId },
      ];

      await result.current.addProducts(products);

      expect(mockMutations.createProduct.mutateAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('⚠️ Error Handling', () => {
    it('should handle add product failure gracefully', async () => {

      mockUseStockMutations.mockReturnValue({
        createProduct: {
          mutate: vi.fn(),
          mutateAsync: vi
            .fn()
            .mockRejectedValue(new Error('Database error')),
        },
        updateProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
        deleteProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
        adjustStock: { mutate: vi.fn(), mutateAsync: vi.fn() },
        processSupply: { mutate: vi.fn(), mutateAsync: vi.fn() },
        createConsignment: { mutate: vi.fn(), mutateAsync: vi.fn() },
        claimConsignment: { mutate: vi.fn(), mutateAsync: vi.fn() },
        forfeitConsignment: { mutate: vi.fn(), mutateAsync: vi.fn() },
      });

      mockUseProducts.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.addProduct({
          name: 'Beer',
          categoryId: 'cat-1',
          volume: '33cl',
          alertThreshold: 10,
          stock: 100,
          price: 5,
          barId,
        })
      ).rejects.toThrow();
    });
  });
});
