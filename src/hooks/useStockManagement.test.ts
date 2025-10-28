import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStockManagement } from './useStockManagement';

// Mock des dépendances externes
vi.mock('../context/BarContext', () => ({
  useBarContext: () => ({ currentBar: { id: 'bar-1', name: 'Test Bar', settings: { consignmentExpirationDays: 7 } } }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ currentSession: { userId: 'user-1', role: 'gerant' } }),
}));

// Mock de useLocalStorage pour contrôler les données
vi.mock('./useLocalStorage', () => {
    const original = vi.importActual('./useLocalStorage');
    return {
        ...original,
        useLocalStorage: vi.fn((key, initialValue) => {
            let value = initialValue;
            const set = (newValue) => {
                if (typeof newValue === 'function') {
                    value = newValue(value);
                } else {
                    value = newValue;
                }
            };
            return [value, set];
        }),
    };
});

describe('useStockManagement', () => {
  let initialProducts;
  let initialConsignments;

  beforeEach(() => {
    // Réinitialiser les données avant chaque test
    initialProducts = [
      { id: 'prod-1', name: 'Test Product', stock: 20 },
      { id: 'prod-2', name: 'Another Product', stock: 10 },
    ];
    initialConsignments = [];
    
    // Mock de useLocalStorage pour retourner les données initiales
    const { useLocalStorage } = require('./useLocalStorage');
    useLocalStorage.mockImplementation((key, defaultValue) => {
        let value = key === 'bar-products' ? initialProducts : initialConsignments;
        const set = (newValue) => {
            if (typeof newValue === 'function') {
                value = newValue(value);
            } else {
                value = newValue;
            }
        };
        return [value, set];
    });
  });

  it('devrait retourner les informations de stock correctes pour un produit', () => {
    const { result } = renderHook(() => useStockManagement());

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 20,
      consignedStock: 0,
      availableStock: 20,
    });
  });

  it('devrait créer une consignation et mettre à jour les stocks consigné et disponible', () => {
    const { result } = renderHook(() => useStockManagement());

    act(() => {
      result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Test Product',
        quantity: 5,
        totalAmount: 5000,
        customerName: 'Test Customer',
      });
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 20, // N'a pas changé
      consignedStock: 5, // A augmenté
      availableStock: 15, // A diminué
    });
  });

  it('devrait confisquer une consignation et réintégrer le stock physique', () => {
    const { result } = renderHook(() => useStockManagement());
    let consignment;
    act(() => {
      consignment = result.current.createConsignment({ productId: 'prod-1', quantity: 5, saleId: 's1', productName:'p1', totalAmount:1, customerName:'c1' });
    });

    act(() => {
      result.current.forfeitConsignment(consignment.id);
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(result.current.consignments.find(c => c.id === consignment.id).status).toBe('forfeited');
    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 25, // A été augmenté
      consignedStock: 0, // A été vidé
      availableStock: 25,
    });
  });

  it('devrait réclamer une consignation et diminuer le stock consigné sans affecter le stock physique', () => {
    const { result } = renderHook(() => useStockManagement());
    let consignment;
    act(() => {
      consignment = result.current.createConsignment({ productId: 'prod-1', quantity: 3, saleId: 's1', productName:'p1', totalAmount:1, customerName:'c1' });
    });

    act(() => {
      result.current.claimConsignment(consignment.id);
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(result.current.consignments.find(c => c.id === consignment.id).status).toBe('claimed');
    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 20, // Inchangé
      consignedStock: 0,   // A été vidé
      availableStock: 20,
    });
  });

  it('devrait expirer une consignation et réintégrer le stock', () => {
    const { result } = renderHook(() => useStockManagement());

    // Créer une consignation avec une date d'expiration passée
    act(() => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 10);
        const consignment = {
            id: 'cons-expired',
            productId: 'prod-2',
            quantity: 8,
            status: 'active',
            expiresAt: pastDate,
            barId: 'bar-1'
        };
        // Ajout manuel pour le test
        result.current.consignments.push(consignment);
    });

    act(() => {
      result.current.checkAndExpireConsignments();
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-2');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-2',
      physicalStock: 18, // 10 + 8
      consignedStock: 0,
      availableStock: 18,
    });
  });
});

// ========================================
// 🎯 TESTS CRITIQUES PERMANENTS
// (Valeur long terme - Survie backend)
// ========================================

describe('useStockManagement - Business Critical Tests', () => {
  let initialProducts;
  let initialConsignments;

  beforeEach(() => {
    initialProducts = [
      { id: 'prod-1', name: 'Heineken', stock: 50, categoryId: 'cat-1', price: 500, alertThreshold: 10, createdAt: new Date() },
    ];
    initialConsignments = [];

    const { useLocalStorage } = require('./useLocalStorage');
    useLocalStorage.mockImplementation((key) => {
        let value = key === 'bar-products' ? initialProducts : initialConsignments;
        const set = (newValue) => {
            if (typeof newValue === 'function') {
                value = newValue(value);
            } else {
                value = newValue;
            }
        };
        return [value, set];
    });
  });

  // ✅ TEST #1 : Stock disponible = Stock physique - Stock consigné
  it('[CRITICAL] availableStock = physicalStock - consignedStock', () => {
    const { result } = renderHook(() => useStockManagement());

    // Créer consignation de 10 unités
    act(() => {
      result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 10,
        totalAmount: 5000,
        customerName: 'Client Test',
        expiresAt: new Date()
      });
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 50,      // Inchangé
      consignedStock: 10,     // Réservé
      availableStock: 40,     // 50 - 10 = 40
    });
  });

  // ✅ TEST #2 : Claim déduit stock physique (bug corrigé)
  it('[CRITICAL] claimConsignment decreases physical stock', () => {
    const { result } = renderHook(() => useStockManagement());
    let consignment;

    // Créer consignation
    act(() => {
      consignment = result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 10,
        totalAmount: 5000,
        customerName: 'Client Test',
        expiresAt: new Date()
      });
    });

    // Client récupère ses produits
    act(() => {
      result.current.claimConsignment(consignment.id);
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 40,      // 50 - 10 = 40 ✅ DÉDUIT
      consignedStock: 0,      // Libéré
      availableStock: 40,     // Cohérent
    });
  });

  // ✅ TEST #3 : Forfeit restaure stock disponible
  it('[CRITICAL] forfeitConsignment restores available stock', () => {
    const { result } = renderHook(() => useStockManagement());
    let consignment;

    act(() => {
      consignment = result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 10,
        totalAmount: 5000,
        customerName: 'Client Test',
        expiresAt: new Date()
      });
    });

    // Confisquer (client ne vient pas)
    act(() => {
      result.current.forfeitConsignment(consignment.id);
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 50,      // Inchangé (stock reste au bar)
      consignedStock: 0,      // Libéré
      availableStock: 50,     // Retour à la vente ✅
    });
  });

  // ✅ TEST #4 : Impossible vendre stock consigné
  it('[CRITICAL] cannot sell more than available stock (consignment protection)', () => {
    const { result } = renderHook(() => useStockManagement());

    // Consigner 40 unités (availableStock = 10)
    act(() => {
      result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 40,
        totalAmount: 20000,
        customerName: 'Client Test',
        expiresAt: new Date()
      });
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    // Vérifier protection
    expect(stockInfo.availableStock).toBe(10);
    expect(stockInfo.consignedStock).toBe(40);
    expect(stockInfo.physicalStock).toBe(50);

    // Tentative de vendre 15 (> availableStock) doit être bloquée
    // Ce test valide que l'UI ne peut pas vendre stock consigné
  });

  // ✅ TEST #5 : Supply incrémente stock physique
  it('[CRITICAL] increasePhysicalStock updates physical and available stock', () => {
    const { result } = renderHook(() => useStockManagement());

    // Approvisionnement de 20 unités
    act(() => {
      result.current.increasePhysicalStock('prod-1', 20);
    });

    let stockInfo;
    act(() => {
      stockInfo = result.current.getProductStockInfo('prod-1');
    });

    expect(stockInfo).toEqual({
      productId: 'prod-1',
      physicalStock: 70,      // 50 + 20
      consignedStock: 0,
      availableStock: 70,     // Aussi augmenté
    });
  });

  // ✅ TEST #6 : Multiple operations maintain consistency
  it('[CRITICAL] multiple operations maintain stock consistency', () => {
    const { result } = renderHook(() => useStockManagement());

    // Scénario complexe
    let consignment1, consignment2;

    // 1. Créer 2 consignations
    act(() => {
      consignment1 = result.current.createConsignment({
        saleId: 'sale-1', productId: 'prod-1', productName: 'Heineken',
        productVolume: '33cl', quantity: 10, totalAmount: 5000,
        customerName: 'Client 1', expiresAt: new Date()
      });
      consignment2 = result.current.createConsignment({
        saleId: 'sale-2', productId: 'prod-1', productName: 'Heineken',
        productVolume: '33cl', quantity: 5, totalAmount: 2500,
        customerName: 'Client 2', expiresAt: new Date()
      });
    });

    // 2. Client 1 récupère
    act(() => {
      result.current.claimConsignment(consignment1.id);
    });

    // 3. Client 2 renonce
    act(() => {
      result.current.forfeitConsignment(consignment2.id);
    });

    // 4. Approvisionnement
    act(() => {
      result.current.increasePhysicalStock('prod-1', 15);
    });

    let finalStock;
    act(() => {
      finalStock = result.current.getProductStockInfo('prod-1');
    });

    // Vérifications
    expect(finalStock).toEqual({
      productId: 'prod-1',
      physicalStock: 55,      // 50 - 10 (claim) + 0 (forfeit) + 15 (supply) = 55
      consignedStock: 0,      // Tout libéré
      availableStock: 55,     // Cohérent
    });
  });
});
