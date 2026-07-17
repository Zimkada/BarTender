// useSubscriptions.ts — Actions de suivi des abonnements (admin super_admin)
// Wrap AdminService avec état loading/error. Cohérent avec le pattern des pages admin
// (useState + service direct) plutôt que React Query.

import { useState, useCallback } from 'react';
import { AdminService } from '../services/supabase/admin.service';
import type { SubscriptionOverview, SubscriptionPayment, SubscriptionPaymentMethod, SubscriptionStatus } from '../types';

export interface RecordPaymentInput {
  barId: string;
  amount: number;
  monthsCovered: number;
  method: SubscriptionPaymentMethod;
  notes?: string;
}

export function useSubscriptions() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getOverview = useCallback(async (params: {
    page: number;
    limit: number;
    searchQuery?: string;
    statusFilter?: 'all' | SubscriptionStatus;
  }): Promise<SubscriptionOverview> => {
    return AdminService.getSubscriptionOverview(params);
  }, []);

  const recordPayment = useCallback(async (input: RecordPaymentInput): Promise<SubscriptionPayment> => {
    setIsRecording(true);
    setError(null);
    try {
      return await AdminService.recordSubscriptionPayment(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement du paiement';
      setError(message);
      throw err;
    } finally {
      setIsRecording(false);
    }
  }, []);

  const getHistory = useCallback(async (barId: string): Promise<SubscriptionPayment[]> => {
    return AdminService.getSubscriptionPayments(barId);
  }, []);

  const setBillingExempt = useCallback(async (input: {
    barId: string;
    exempt: boolean;
    reason?: string;
  }): Promise<void> => {
    setIsRecording(true);
    setError(null);
    try {
      await AdminService.setBarBillingExempt(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la modification de l\'exemption';
      setError(message);
      throw err;
    } finally {
      setIsRecording(false);
    }
  }, []);

  return { getOverview, recordPayment, getHistory, setBillingExempt, isRecording, error };
}
