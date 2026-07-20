// useWhatsappAgent.ts — Actions de supervision de l'agent WhatsApp (admin super_admin)
// Wrap WhatsappAgentService avec état loading/error. Cohérent avec le pattern des
// pages admin (useState + service direct) — cf useSubscriptions.ts.

import { useState, useCallback } from 'react';
import { WhatsappAgentService } from '../services/supabase/whatsappAgent.service';
import type { WaConversation, WaLead, WaMode, WaLeadStatut } from '../services/supabase/whatsappAgent.service';

export function useWhatsappAgent() {
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listConversations = useCallback(async (
    modeFilter?: WaMode | 'a_traiter' | 'all',
  ): Promise<WaConversation[]> => {
    return WhatsappAgentService.listConversations({ modeFilter });
  }, []);

  const getConversation = useCallback(async (id: string): Promise<WaConversation | undefined> => {
    return WhatsappAgentService.getConversation(id);
  }, []);

  const resumeBot = useCallback(async (id: string): Promise<void> => {
    setIsMutating(true);
    setError(null);
    try {
      await WhatsappAgentService.resumeBot(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la reprise du bot';
      setError(message);
      throw err;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const listLeads = useCallback(async (
    statutFilter?: WaLeadStatut | 'all',
  ): Promise<WaLead[]> => {
    return WhatsappAgentService.listLeads({ statutFilter });
  }, []);

  const updateLeadStatut = useCallback(async (id: string, statut: WaLeadStatut): Promise<void> => {
    setIsMutating(true);
    setError(null);
    try {
      await WhatsappAgentService.updateLeadStatut(id, statut);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour du lead';
      setError(message);
      throw err;
    } finally {
      setIsMutating(false);
    }
  }, []);

  return {
    listConversations, getConversation, resumeBot,
    listLeads, updateLeadStatut,
    isMutating, error,
  };
}
