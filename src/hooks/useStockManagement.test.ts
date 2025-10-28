import { describe, it, expect, beforeEach } from 'vitest';
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
