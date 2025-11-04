import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStockManagement } from './useStockManagement';
import type { Product, Consignment } from '../types';

// Mock des dépendances externes
vi.mock('../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: {
      id: 'bar-1',
      name: 'Test Bar',
      settings: { consignmentExpirationDays: 7 }
    }
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: {
      userId: 'user-1',
      role: 'gerant'
    }
  }),
}));

// Mock DataStore avec store partagé
vi.mock('../services/DataStore', () => {
    // Créer le store dans la factory pour qu'il soit partagé
    const store: Record<string, any> = {};

    return {
        dataStore: {
            get: (key: string) => store[key] ?? null,
            set: (key: string, value: any) => {
                store[key] = value;
            },
            remove: (key: string) => {
                delete store[key];
            },
            has: (key: string) => key in store,
            subscribe: () => () => {}, // Pas de subscription dans les tests
        },
    };
});

// ========================================
// 🎯 TESTS CRITIQUES PERMANENTS
// (Valeur long terme - Survie backend)
// ========================================

describe('useStockManagement - Business Critical Tests', () => {

  beforeEach(() => {
    // Réinitialiser via le dataStore mocké
    const initialProducts: Product[] = [
      {
        id: 'prod-1',
        barId: 'bar-1',
        name: 'Heineken',
        volume: '33cl',
        stock: 50,
        categoryId: 'cat-1',
        price: 500,
        alertThreshold: 10,
        createdAt: new Date()
      },
    ];
    const { dataStore } = require('../services/DataStore');
    dataStore.set('products-v3', initialProducts);
    dataStore.set('consignments-v1', []);
    dataStore.set('supplies-v3', []);
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
        expiresAt: new Date(),
        originalSeller: 'user-1'
      });
    });

    const stockInfo = result.current.getProductStockInfo('prod-1');

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

    // Créer consignation
    const consignment = act(() => {
      return result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 10,
        totalAmount: 5000,
        customerName: 'Client Test',
        expiresAt: new Date(),
        originalSeller: 'user-1'
      });
    });

    // Client récupère ses produits
    act(() => {
      result.current.claimConsignment(consignment!.id);
    });

    const stockInfo = result.current.getProductStockInfo('prod-1');

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

    const consignment = act(() => {
      return result.current.createConsignment({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Heineken',
        productVolume: '33cl',
        quantity: 10,
        totalAmount: 5000,
        customerName: 'Client Test',
        expiresAt: new Date(),
        originalSeller: 'user-1'
      });
    });

    // Confisquer (client ne vient pas)
    act(() => {
      result.current.forfeitConsignment(consignment!.id);
    });

    const stockInfo = result.current.getProductStockInfo('prod-1');

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
        expiresAt: new Date(),
        originalSeller: 'user-1'
      });
    });

    const stockInfo = result.current.getProductStockInfo('prod-1');

    // Vérifier protection
    expect(stockInfo!.availableStock).toBe(10);
    expect(stockInfo!.consignedStock).toBe(40);
    expect(stockInfo!.physicalStock).toBe(50);

    // ✅ L'UI doit utiliser availableStock pour vérifier si vente possible
    // Ce test valide que le système retourne la bonne valeur
  });

  // ✅ TEST #5 : Supply incrémente stock physique
  it('[CRITICAL] increasePhysicalStock updates physical and available stock', () => {
    const { result } = renderHook(() => useStockManagement());

    // Approvisionnement de 20 unités
    act(() => {
      result.current.increasePhysicalStock('prod-1', 20);
    });

    const stockInfo = result.current.getProductStockInfo('prod-1');

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
        customerName: 'Client 1', expiresAt: new Date(), originalSeller: 'user-1'
      });
      consignment2 = result.current.createConsignment({
        saleId: 'sale-2', productId: 'prod-1', productName: 'Heineken',
        productVolume: '33cl', quantity: 5, totalAmount: 2500,
        customerName: 'Client 2', expiresAt: new Date(), originalSeller: 'user-1'
      });
    });

    // 2. Client 1 récupère
    act(() => {
      result.current.claimConsignment(consignment1!.id);
    });

    // 3. Client 2 renonce
    act(() => {
      result.current.forfeitConsignment(consignment2!.id);
    });

    // 4. Approvisionnement
    act(() => {
      result.current.increasePhysicalStock('prod-1', 15);
    });

    const finalStock = result.current.getProductStockInfo('prod-1');

    // Vérifications
    expect(finalStock).toEqual({
      productId: 'prod-1',
      physicalStock: 55,      // 50 - 10 (claim) + 0 (forfeit) + 15 (supply) = 55
      consignedStock: 0,      // Tout libéré
      availableStock: 55,     // Cohérent
    });
  });
});
