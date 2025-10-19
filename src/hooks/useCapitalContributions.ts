import { useState, useEffect, useCallback } from 'react';
import type { CapitalContribution, CapitalSource } from '../types';

const STORAGE_KEY_PREFIX = 'capital_contributions_';

// Labels pour les sources d'apport (UI)
export const CAPITAL_SOURCE_LABELS: Record<CapitalSource, { label: string; icon: string; description: string }> = {
  owner: {
    label: 'Propriétaire',
    icon: '👤',
    description: 'Apport personnel du promoteur',
  },
  partner: {
    label: 'Associé',
    icon: '🤝',
    description: 'Apport d\'un associé du bar',
  },
  investor: {
    label: 'Investisseur',
    icon: '💼',
    description: 'Investissement externe',
  },
  loan: {
    label: 'Prêt',
    icon: '🏦',
    description: 'Prêt bancaire ou personnel',
  },
  other: {
    label: 'Autre',
    icon: '📋',
    description: 'Autre source d\'apport',
  },
};

export function useCapitalContributions(barId?: string) {
  const [contributions, setContributions] = useState<CapitalContribution[]>([]);

  // Load from localStorage
  useEffect(() => {
    if (!barId) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${barId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        const loadedContributions = parsed.map((contrib: any) => ({
          ...contrib,
          date: new Date(contrib.date),
          createdAt: new Date(contrib.createdAt),
        }));
        setContributions(loadedContributions);
      }
    } catch (error) {
      console.error('❌ Erreur chargement apports de capital:', error);
    }
  }, [barId]);

  // Save to localStorage
  const saveToStorage = useCallback((contribs: CapitalContribution[]) => {
    if (!barId) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${barId}`;
      localStorage.setItem(key, JSON.stringify(contribs));
    } catch (error) {
      console.error('❌ Erreur sauvegarde apports de capital:', error);
    }
  }, [barId]);

  // Add new capital contribution
  const addContribution = useCallback((contribution: Omit<CapitalContribution, 'id' | 'createdAt'>) => {
    const newContribution: CapitalContribution = {
      ...contribution,
      id: `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    const updated = [...contributions, newContribution];
    setContributions(updated);
    saveToStorage(updated);

    return newContribution;
  }, [contributions, saveToStorage]);

  // Delete capital contribution
  const deleteContribution = useCallback((id: string) => {
    const updated = contributions.filter(contrib => contrib.id !== id);
    setContributions(updated);
    saveToStorage(updated);
  }, [contributions, saveToStorage]);

  // Get total contributions before a specific date
  const getTotalContributions = useCallback((beforeDate: Date) => {
    return contributions
      .filter(contrib => new Date(contrib.date) <= beforeDate)
      .reduce((sum, contrib) => sum + contrib.amount, 0);
  }, [contributions]);

  // Get contributions by source
  const getContributionsBySource = useCallback((source: CapitalSource) => {
    return contributions.filter(contrib => contrib.source === source);
  }, [contributions]);

  // Get total by source
  const getTotalBySource = useCallback((source: CapitalSource) => {
    return getContributionsBySource(source).reduce((sum, contrib) => sum + contrib.amount, 0);
  }, [getContributionsBySource]);

  return {
    contributions,
    addContribution,
    deleteContribution,
    getTotalContributions,
    getContributionsBySource,
    getTotalBySource,
  };
}
