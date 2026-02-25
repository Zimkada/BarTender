import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CapitalContribution, CapitalSource } from '../types';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errorHandler';

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
  const [loading, setLoading] = useState(true);
  const { currentSession } = useAuth();

  // Load from Supabase
  useEffect(() => {
    if (!barId) {
      setLoading(false);
      return;
    }

    const fetchContributions = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('capital_contributions')
          .select('*')
          .eq('bar_id', barId)
          .order('date', { ascending: false });

        if (error) {
          console.error('❌ Erreur chargement apports de capital:', error);
          return;
        }

        if (data) {
          const mapped = data.map((row: any) => ({
            id: row.id,
            barId: row.bar_id,
            amount: Number(row.amount),
            source: row.source as CapitalSource,
            sourceDetails: row.source_details || undefined,
            description: row.description || undefined,
            date: new Date(row.date),
            createdBy: row.created_by,
            createdAt: new Date(row.created_at),
          }));
          setContributions(mapped);
        }
      } catch (error) {
        console.error('❌ Erreur chargement apports de capital:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContributions();
  }, [barId]);

  // Add new capital contribution
  const addContribution = useCallback(
    async (contribution: Omit<CapitalContribution, 'id' | 'createdAt' | 'createdBy'>) => {
      if (!barId || !currentSession) {
        throw new Error('Bar ID or session missing');
      }

      try {
        const { data, error } = await supabase
          .from('capital_contributions')
          .insert([
            {
              bar_id: barId,
              amount: contribution.amount,
              source: contribution.source,
              source_details: contribution.sourceDetails,
              description: contribution.description,
              date: contribution.date.toISOString().split('T')[0],
              created_by: currentSession.userId,
            },
          ])
          .select()
          .single();

        if (error) {
          throw new Error(getErrorMessage(error));
        }

        if (data) {
          const newContribution: CapitalContribution = {
            id: data.id,
            barId: data.bar_id,
            amount: Number(data.amount),
            source: data.source,
            sourceDetails: data.source_details,
            description: data.description,
            date: new Date(data.date),
            createdBy: data.created_by,
            createdAt: new Date(data.created_at),
          };
          setContributions([newContribution, ...contributions]);
          return newContribution;
        }
      } catch (error) {
        console.error('❌ Erreur ajout apport de capital:', error);
        throw error;
      }
    },
    [barId, currentSession, contributions]
  );

  // Delete capital contribution
  const deleteContribution = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('capital_contributions')
          .delete()
          .eq('id', id);

        if (error) {
          throw new Error(getErrorMessage(error));
        }

        setContributions(contributions.filter(contrib => contrib.id !== id));
      } catch (error) {
        console.error('❌ Erreur suppression apport de capital:', error);
        throw error;
      }
    },
    [contributions]
  );

  // Get total contributions before a specific date
  const getTotalContributions = useCallback((beforeDate: Date) => {
    return contributions
      .filter(contrib => contrib.date <= beforeDate)
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
    loading,
    addContribution,
    deleteContribution,
    getTotalContributions,
    getContributionsBySource,
    getTotalBySource,
  };
}
