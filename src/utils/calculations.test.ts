import {
  calculateSaleTotal,
  calculateSaleCost,
  calculateSaleProfit,
  calculateProfitMargin,
  calculateRevenue,
  calculateRefundedReturns,
  calculateNetRevenue,
  calculateUnitCost,
  calculateAvailableStock,
  isLowStock,
  calculateMarkup,
  calculateSellingPrice,
  calculateStockValue,
  calculateTotalItemsSold,
} from './calculations';
import type { Sale, Return, Product, SaleItem } from '../types';

describe('calculations', () => {
  // Mock data — champs alignés sur les types réels (snake_case pour SaleItem)
  const mockProducts: Product[] = [
    {
      id: 'prod1',
      barId: 'bar1',
      name: 'Heineken',
      categoryId: 'cat1',
      price: 1000,
      currentAverageCost: 600,
      stock: 50,
      alertThreshold: 10,
      volume: '33cl',
      createdAt: new Date(),
    },
    {
      id: 'prod2',
      barId: 'bar1',
      name: 'Coca-Cola',
      categoryId: 'cat2',
      price: 500,
      currentAverageCost: 300,
      stock: 100,
      alertThreshold: 20,
      volume: '33cl',
      createdAt: new Date(),
    },
  ];

  const mockSaleItems: SaleItem[] = [
    { product_id: 'prod1', product_name: 'Heineken', quantity: 2, unit_price: 1000, total_price: 2000 },
    { product_id: 'prod2', product_name: 'Coca-Cola', quantity: 3, unit_price: 500, total_price: 1500 },
  ];

  const mockSales: Sale[] = [
    {
      id: 'sale1',
      barId: 'bar1',
      items: mockSaleItems,
      total: 3500,
      currency: 'XOF',
      status: 'validated',
      createdBy: 'user1',
      soldBy: 'user1',
      createdAt: new Date().toISOString(),
      businessDate: new Date().toISOString(),
    },
    {
      id: 'sale2',
      barId: 'bar1',
      items: [{ product_id: 'prod1', product_name: 'Heineken', quantity: 5, unit_price: 1000, total_price: 5000 }],
      total: 5000,
      currency: 'XOF',
      status: 'validated',
      createdBy: 'user2',
      soldBy: 'user2',
      createdAt: new Date().toISOString(),
      businessDate: new Date().toISOString(),
    },
  ];

  const mockReturns: Return[] = [
    {
      id: 'ret1',
      barId: 'bar1',
      saleId: 'sale1',
      productId: 'prod1',
      productName: 'Heineken',
      productVolume: '33cl',
      quantitySold: 2,
      quantityReturned: 1,
      reason: 'defective',
      returnedBy: 'user1',
      returnedAt: new Date(),
      businessDate: new Date().toISOString(),
      refundAmount: 1000,
      isRefunded: true,
      autoRestock: false,
      manualRestockRequired: false,
      status: 'approved',
      notes: 'Produit défectueux',
    },
    {
      id: 'ret2',
      barId: 'bar1',
      saleId: 'sale2',
      productId: 'prod2',
      productName: 'Coca-Cola',
      productVolume: '33cl',
      quantitySold: 3,
      quantityReturned: 2,
      reason: 'customer_change',
      returnedBy: 'user1',
      returnedAt: new Date(),
      businessDate: new Date().toISOString(),
      refundAmount: 0,
      isRefunded: false,
      autoRestock: true,
      manualRestockRequired: false,
      status: 'approved',
      notes: 'Changement avis client',
    },
    {
      id: 'ret3',
      barId: 'bar1',
      saleId: 'sale2',
      productId: 'prod1',
      productName: 'Heineken',
      productVolume: '33cl',
      quantitySold: 5,
      quantityReturned: 1,
      reason: 'wrong_item',
      returnedBy: 'user2',
      returnedAt: new Date(),
      businessDate: new Date().toISOString(),
      refundAmount: 1000,
      isRefunded: true,
      autoRestock: true,
      manualRestockRequired: false,
      status: 'rejected',
      notes: 'Rejected return',
    },
  ];

  describe('calculateSaleTotal', () => {
    it('should calculate total from sale items', () => {
      const total = calculateSaleTotal(mockSaleItems);
      expect(total).toBe(3500); // (2 × 1000) + (3 × 500) = 3500
    });

    it('should return 0 for empty items', () => {
      expect(calculateSaleTotal([])).toBe(0);
    });

    it('should handle single item', () => {
      const items: SaleItem[] = [{ product_id: 'prod1', product_name: 'Heineken', quantity: 4, unit_price: 1000, total_price: 4000 }];
      expect(calculateSaleTotal(items)).toBe(4000);
    });
  });

  describe('calculateSaleCost', () => {
    it('should calculate cost from sale items and products', () => {
      const cost = calculateSaleCost(mockSaleItems, mockProducts);
      expect(cost).toBe(2100); // (2 × 600) + (3 × 300) = 2100
    });

    it('should return 0 for empty items', () => {
      expect(calculateSaleCost([], mockProducts)).toBe(0);
    });

    it('should handle missing costPrice', () => {
      const productsNoCost: Product[] = [
        { ...mockProducts[0], currentAverageCost: undefined },
      ];
      const items: SaleItem[] = [{ product_id: 'prod1', product_name: 'Heineken', quantity: 2, unit_price: 1000, total_price: 2000 }];
      expect(calculateSaleCost(items, productsNoCost)).toBe(0);
    });

    it('should handle unknown product', () => {
      const items: SaleItem[] = [{ product_id: 'unknown', product_name: 'Unknown', quantity: 2, unit_price: 1000, total_price: 2000 }];
      expect(calculateSaleCost(items, mockProducts)).toBe(0);
    });
  });

  describe('calculateSaleProfit', () => {
    it('should calculate profit (total - cost)', () => {
      const profit = calculateSaleProfit(mockSaleItems, mockProducts);
      expect(profit).toBe(1400); // 3500 - 2100 = 1400
    });

    it('should return total if no cost', () => {
      const productsNoCost: Product[] = mockProducts.map(p => ({ ...p, currentAverageCost: undefined }));
      const profit = calculateSaleProfit(mockSaleItems, productsNoCost);
      expect(profit).toBe(3500);
    });

    it('should handle zero profit', () => {
      const items: SaleItem[] = [{ product_id: 'prod1', product_name: 'Heineken', quantity: 1, unit_price: 600, total_price: 600 }];
      const profit = calculateSaleProfit(items, mockProducts);
      expect(profit).toBe(0); // 600 - 600 = 0
    });
  });

  describe('calculateProfitMargin', () => {
    it('should calculate margin percentage', () => {
      const margin = calculateProfitMargin(1400, 3500);
      expect(margin).toBeCloseTo(40, 1); // (1400 / 3500) * 100 = 40%
    });

    it('should return 0 for zero total', () => {
      expect(calculateProfitMargin(100, 0)).toBe(0);
    });

    it('should handle 100% margin', () => {
      const margin = calculateProfitMargin(1000, 1000);
      expect(margin).toBe(100);
    });

    it('should handle negative margin (loss)', () => {
      const margin = calculateProfitMargin(-500, 2000);
      expect(margin).toBe(-25);
    });
  });

  describe('calculateRevenue', () => {
    it('should sum all sales totals', () => {
      const revenue = calculateRevenue(mockSales);
      expect(revenue).toBe(8500); // 3500 + 5000
    });

    it('should return 0 for empty sales', () => {
      expect(calculateRevenue([])).toBe(0);
    });

    it('should handle single sale', () => {
      expect(calculateRevenue([mockSales[0]])).toBe(3500);
    });
  });

  describe('calculateRefundedReturns', () => {
    it('should sum only refunded and non-rejected returns', () => {
      const refunded = calculateRefundedReturns(mockReturns);
      expect(refunded).toBe(1000); // ret1 (1000) + ret2 (0, not refunded) + ret3 (rejected)
    });

    it('should return 0 for empty returns', () => {
      expect(calculateRefundedReturns([])).toBe(0);
    });

    it('should exclude non-refunded returns', () => {
      const returns: Return[] = [
        { ...mockReturns[1], status: 'approved', isRefunded: false, refundAmount: 500 },
      ];
      expect(calculateRefundedReturns(returns)).toBe(0);
    });

    it('should exclude rejected returns', () => {
      const returns: Return[] = [
        { ...mockReturns[2], status: 'rejected', isRefunded: true, refundAmount: 1000 },
      ];
      expect(calculateRefundedReturns(returns)).toBe(0);
    });
  });

  describe('calculateNetRevenue', () => {
    it('should calculate net revenue (sales - refunded returns)', () => {
      const netRevenue = calculateNetRevenue(mockSales, mockReturns);
      expect(netRevenue).toBe(7500); // 8500 - 1000
    });

    it('should return sales total if no returns', () => {
      expect(calculateNetRevenue(mockSales, [])).toBe(8500);
    });

    it('should handle zero sales', () => {
      expect(calculateNetRevenue([], mockReturns)).toBe(-1000);
    });
  });


  describe('calculateUnitCost', () => {
    it('should calculate unit cost (lotPrice / lotSize)', () => {
      const unitCost = calculateUnitCost(12000, 24);
      expect(unitCost).toBe(500);
    });

    it('should return 0 for zero lotSize', () => {
      expect(calculateUnitCost(1000, 0)).toBe(0);
    });

    it('should handle decimal result', () => {
      const unitCost = calculateUnitCost(1000, 3);
      expect(unitCost).toBeCloseTo(333.33, 2);
    });
  });

  describe('calculateAvailableStock', () => {
    it('should calculate available stock (physical - consigned)', () => {
      const available = calculateAvailableStock(50, 10);
      expect(available).toBe(40);
    });

    it('should return 0 if consigned exceeds physical', () => {
      const available = calculateAvailableStock(30, 50);
      expect(available).toBe(0);
    });

    it('should handle zero consigned stock', () => {
      expect(calculateAvailableStock(100, 0)).toBe(100);
    });

    it('should handle equal stocks', () => {
      expect(calculateAvailableStock(20, 20)).toBe(0);
    });
  });

  describe('isLowStock', () => {
    it('should return true when stock at or below minimum', () => {
      expect(isLowStock(10, 10)).toBe(true);
      expect(isLowStock(5, 10)).toBe(true);
    });

    it('should return false when stock above minimum', () => {
      expect(isLowStock(15, 10)).toBe(false);
    });

    it('should handle zero minimum', () => {
      expect(isLowStock(0, 0)).toBe(true);
      expect(isLowStock(1, 0)).toBe(false);
    });
  });

  describe('calculateMarkup', () => {
    it('should calculate markup percentage', () => {
      const markup = calculateMarkup(1000, 600);
      expect(markup).toBeCloseTo(66.67, 2); // ((1000 - 600) / 600) * 100
    });

    it('should return 0 for zero cost', () => {
      expect(calculateMarkup(1000, 0)).toBe(0);
    });

    it('should handle equal prices (0% markup)', () => {
      expect(calculateMarkup(500, 500)).toBe(0);
    });

    it('should handle negative markup (loss)', () => {
      const markup = calculateMarkup(400, 600);
      expect(markup).toBeCloseTo(-33.33, 2);
    });
  });

  describe('calculateSellingPrice', () => {
    it('should calculate selling price with target markup', () => {
      const price = calculateSellingPrice(600, 66.67);
      expect(price).toBeCloseTo(1000, 0); // 600 × (1 + 66.67/100) ≈ 1000
    });

    it('should handle 0% markup', () => {
      expect(calculateSellingPrice(500, 0)).toBe(500);
    });

    it('should handle 100% markup (double price)', () => {
      expect(calculateSellingPrice(500, 100)).toBe(1000);
    });

    it('should handle zero cost', () => {
      expect(calculateSellingPrice(0, 50)).toBe(0);
    });
  });

  describe('calculateStockValue', () => {
    it('should calculate total stock value', () => {
      const value = calculateStockValue(mockProducts);
      expect(value).toBe(60000); // (50 × 600) + (100 × 300) = 60000
    });

    it('should return 0 for empty products', () => {
      expect(calculateStockValue([])).toBe(0);
    });

    it('should handle missing costPrice', () => {
      const products: Product[] = [
        { ...mockProducts[0], currentAverageCost: undefined },
      ];
      expect(calculateStockValue(products)).toBe(0);
    });

    it('should handle zero stock', () => {
      const products: Product[] = [
        { ...mockProducts[0], stock: 0 },
      ];
      expect(calculateStockValue(products)).toBe(0);
    });
  });

  describe('calculateTotalItemsSold', () => {
    it('should count all items across sales', () => {
      const total = calculateTotalItemsSold(mockSales);
      expect(total).toBe(10); // sale1: (2 + 3) + sale2: (5) = 10
    });

    it('should return 0 for empty sales', () => {
      expect(calculateTotalItemsSold([])).toBe(0);
    });

    it('should handle single item sale', () => {
      const sales: Sale[] = [{
        id: 'sale1',
        barId: 'bar1',
        items: [{ product_id: 'prod1', product_name: 'Heineken', quantity: 7, unit_price: 1000, total_price: 7000 }],
        total: 7000,
        currency: 'XOF',
        status: 'validated',
        createdBy: 'user1',
        soldBy: 'user1',
        createdAt: new Date().toISOString(),
        businessDate: new Date().toISOString(),
      }];
      expect(calculateTotalItemsSold(sales)).toBe(7);
    });
  });
});
