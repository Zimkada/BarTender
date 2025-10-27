// hooks/useConsignments.ts - Hook de gestion des consignations avec stock séparé

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { calculateAvailableStock } from '../utils/calculations';
import type { Consignment, ConsignmentStatus, ConsignmentStock, ProductStockInfo } from '../types';

const STORAGE_KEY = 'consignments-v1';
const DEFAULT_EXPIRATION_DAYS = 7; // Défaut: 7 jours

interface UseConsignmentsReturn {
  // État
  consignments: Consignment[];

  // CRUD
  createConsignment: (data: Omit<Consignment, 'id' | 'barId' | 'createdAt' | 'createdBy' | 'status'> & { expirationDays?: number }) => Consignment | null;
  claimConsignment: (consignmentId: string) => boolean;
  forfeitConsignment: (consignmentId: string) => boolean;
  updateConsignment: (consignmentId: string, updates: Partial<Consignment>) => void;
  deleteConsignment: (consignmentId: string) => void;

  // Queries
  getConsignmentsBySale: (saleId: string) => Consignment[];
  getConsignmentsByProduct: (productId: string) => Consignment[];
  getActiveConsignments: () => Consignment[];
  getExpiredConsignments: () => Consignment[];
  getConsignmentById: (consignmentId: string) => Consignment | undefined;

  // Stock management
  getConsignedStockByProduct: (productId: string) => number;
  getProductStockInfo: (productId: string, physicalStock: number) => ProductStockInfo;
  getAllConsignmentStocks: () => ConsignmentStock[];

  // Utils
  checkAndExpireConsignments: () => void;
  getExpirationDate: (createdAt: Date) => Date;
}

export const useConsignments = (): UseConsignmentsReturn => {
  const [consignments, setConsignments] = useLocalStorage<Consignment[]>(STORAGE_KEY, []);
  const { currentBar } = useBarContext();
  const { currentSession: session } = useAuth();

  // Filtrer par bar actuel
  const barConsignments = useMemo(() => {
    if (!currentBar) return [];
    return consignments.filter(c => c.barId === currentBar.id);
  }, [consignments, currentBar]);

  // Calculer date d'expiration
  const getExpirationDate = useCallback((createdAt: Date, overrideDays?: number): Date => {
    const expirationDays = overrideDays ?? currentBar?.settings?.consignmentExpirationDays ?? DEFAULT_EXPIRATION_DAYS;
    const expiresAt = new Date(createdAt);
    expiresAt.setDate(expiresAt.getDate() + expirationDays);
    return expiresAt;
  }, [currentBar]);

  // Créer une consignation
  const createConsignment = useCallback((
    data: Omit<Consignment, 'id' | 'barId' | 'createdAt' | 'createdBy' | 'status'> & { expirationDays?: number }
  ): Consignment | null => {
    if (!currentBar || !session) {
      console.error('❌ Impossible de créer consignation: bar ou session manquant');
      return null;
    }

    // ✅ Vérification permission (seuls promoteur/gérant peuvent créer)
    if (session.role !== 'promoteur' && session.role !== 'gerant') {
      console.error('❌ Permission refusée: seuls promoteur/gérant peuvent créer des consignations');
      return null;
    }

    const now = new Date();
    const { expirationDays, ...consignmentData } = data;

    const newConsignment: Consignment = {
      ...consignmentData,
      id: `consignment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      barId: currentBar.id,
      createdAt: now,
      expiresAt: getExpirationDate(now, expirationDays),
      createdBy: session.userId,
      status: 'active',
    };

    setConsignments(prev => [...prev, newConsignment]);
    console.log('✅ Consignation créée:', newConsignment.id);
    return newConsignment;
  }, [currentBar, session, setConsignments, getExpirationDate]);

  // Récupérer une consignation (client vient chercher)
  const claimConsignment = useCallback((consignmentId: string): boolean => {
    if (!session) {
      console.error('❌ Session manquante');
      return false;
    }

    const consignment = barConsignments.find(c => c.id === consignmentId);
    if (!consignment) {
      console.error('❌ Consignation introuvable:', consignmentId);
      return false;
    }

    if (consignment.status !== 'active') {
      console.error('❌ Consignation non active:', consignment.status);
      return false;
    }

    setConsignments(prev =>
      prev.map(c =>
        c.id === consignmentId
          ? {
              ...c,
              status: 'claimed' as ConsignmentStatus,
              claimedAt: new Date(),
              claimedBy: session.userId,
            }
          : c
      )
    );

    console.log('✅ Consignation récupérée:', consignmentId);
    return true;
  }, [barConsignments, session, setConsignments]);

  // Confisquer une consignation (client renonce)
  const forfeitConsignment = useCallback((consignmentId: string): boolean => {
    const consignment = barConsignments.find(c => c.id === consignmentId);
    if (!consignment) {
      console.error('❌ Consignation introuvable:', consignmentId);
      return false;
    }

    if (consignment.status !== 'active') {
      console.error('❌ Consignation non active:', consignment.status);
      return false;
    }

    setConsignments(prev =>
      prev.map(c =>
        c.id === consignmentId
          ? { ...c, status: 'forfeited' as ConsignmentStatus }
          : c
      )
    );

    console.log('✅ Consignation confisquée:', consignmentId);
    return true;
  }, [barConsignments, setConsignments]);

  // Mettre à jour une consignation
  const updateConsignment = useCallback((consignmentId: string, updates: Partial<Consignment>) => {
    setConsignments(prev =>
      prev.map(c => (c.id === consignmentId ? { ...c, ...updates } : c))
    );
  }, [setConsignments]);

  // Supprimer une consignation
  const deleteConsignment = useCallback((consignmentId: string) => {
    setConsignments(prev => prev.filter(c => c.id !== consignmentId));
    console.log('✅ Consignation supprimée:', consignmentId);
  }, [setConsignments]);

  // Queries
  const getConsignmentsBySale = useCallback((saleId: string): Consignment[] => {
    return barConsignments.filter(c => c.saleId === saleId);
  }, [barConsignments]);

  const getConsignmentsByProduct = useCallback((productId: string): Consignment[] => {
    return barConsignments.filter(c => c.productId === productId);
  }, [barConsignments]);

  const getActiveConsignments = useCallback((): Consignment[] => {
    return barConsignments.filter(c => c.status === 'active');
  }, [barConsignments]);

  const getExpiredConsignments = useCallback((): Consignment[] => {
    const now = new Date();
    return barConsignments.filter(
      c => c.status === 'active' && new Date(c.expiresAt) < now
    );
  }, [barConsignments]);

  const getConsignmentById = useCallback((consignmentId: string): Consignment | undefined => {
    return barConsignments.find(c => c.id === consignmentId);
  }, [barConsignments]);

  // ===== GESTION STOCK SÉPARÉ =====

  // Obtenir stock consigné pour un produit (UNIQUEMENT status='active')
  const getConsignedStockByProduct = useCallback((productId: string): number => {
    return barConsignments
      .filter(c => c.productId === productId && c.status === 'active')
      .reduce((sum, c) => sum + c.quantity, 0);
  }, [barConsignments]);

  // Obtenir informations stock enrichies (physique, consigné, disponible)
  const getProductStockInfo = useCallback(
    (productId: string, physicalStock: number): ProductStockInfo => {
      const consignedStock = getConsignedStockByProduct(productId);
      // ✅ Utilise fonction centralisée pour cohérence
      const availableStock = calculateAvailableStock(physicalStock, consignedStock);

      return {
        productId,
        physicalStock,
        consignedStock,
        availableStock,
      };
    },
    [getConsignedStockByProduct]
  );

  // Obtenir tous les stocks consignés (pour dashboard)
  const getAllConsignmentStocks = useCallback((): ConsignmentStock[] => {
    if (!currentBar) return [];

    const stockMap = new Map<string, number>();

    // Calculer total consigné par produit
    barConsignments
      .filter(c => c.status === 'active')
      .forEach(c => {
        const current = stockMap.get(c.productId) || 0;
        stockMap.set(c.productId, current + c.quantity);
      });

    // Convertir en tableau
    return Array.from(stockMap.entries()).map(([productId, quantity]) => ({
      productId,
      barId: currentBar.id,
      quantityConsigned: quantity,
      lastUpdated: new Date(),
    }));
  }, [currentBar, barConsignments]);

  // ===== EXPIRATION AUTOMATIQUE =====

  // Vérifier et expirer les consignations dépassées
  const checkAndExpireConsignments = useCallback(() => {
    const now = new Date();
    let expiredCount = 0;

    setConsignments(prev =>
      prev.map(c => {
        if (c.barId !== currentBar?.id) return c;
        if (c.status !== 'active') return c;
        if (new Date(c.expiresAt) > now) return c;

        expiredCount++;
        return { ...c, status: 'expired' as ConsignmentStatus };
      })
    );

    if (expiredCount > 0) {
      console.log(`✅ ${expiredCount} consignation(s) expirée(s)`);
    }
  }, [currentBar, setConsignments]);

  // Auto-expiration au chargement et toutes les minutes
  useEffect(() => {
    checkAndExpireConsignments();
    const interval = setInterval(checkAndExpireConsignments, 60000); // 1 min
    return () => clearInterval(interval);
  }, [checkAndExpireConsignments]);

  return {
    consignments: barConsignments,
    createConsignment,
    claimConsignment,
    forfeitConsignment,
    updateConsignment,
    deleteConsignment,
    getConsignmentsBySale,
    getConsignmentsByProduct,
    getActiveConsignments,
    getExpiredConsignments,
    getConsignmentById,
    getConsignedStockByProduct,
    getProductStockInfo,
    getAllConsignmentStocks,
    checkAndExpireConsignments,
    getExpirationDate,
  };
};
