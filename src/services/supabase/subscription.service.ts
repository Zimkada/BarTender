// subscription.service.ts — Abonnement côté BAR (promoteur/gérant).
// Distinct d'admin.service.ts (super_admin) : ici on lance le paiement FedaPay
// et on lit le statut de SON propre bar via des RPC accessibles aux membres.

import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { SubscriptionStatus } from '../../types';

export interface MySubscription {
  status: SubscriptionStatus;
  daysUntilDue: number | null;
  dueDate?: string;
  startDate?: string;
  plan: string;
  monthlyPrice: number;
  billingExempt: boolean;
  billingExemptReason?: string;
}

export class SubscriptionService {
  /**
   * Statut d'abonnement du bar courant (promoteur/gérant du bar uniquement).
   * Le RPC get_my_subscription_status calcule le même statut que la vue admin.
   *
   * Note typage : database.types.ts marque due_date/start_date/billing_exempt_reason
   * comme `string` non-nullable (limite de la génération de types Supabase sur les
   * colonnes nullable d'un RETURNS TABLE) — ils peuvent être NULL en runtime
   * (bar jamais payé, pas de motif d'exemption), d'où les `?? undefined` ci-dessous.
   */
  static async getMySubscription(barId: string): Promise<MySubscription> {
    try {
      const { data, error } = await supabase.rpc('get_my_subscription_status', {
        p_bar_id: barId,
      });

      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('Abonnement introuvable pour ce bar');

      return {
        status: row.subscription_status as SubscriptionStatus,
        daysUntilDue: row.days_until_due,
        dueDate: row.due_date ?? undefined,
        startDate: row.start_date ?? undefined,
        plan: row.plan,
        monthlyPrice: Number(row.monthly_price),
        billingExempt: row.billing_exempt,
        billingExemptReason: row.billing_exempt_reason ?? undefined,
      };
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Crée une transaction FedaPay (checkout hébergé) et retourne l'URL de paiement.
   * Le montant est calculé et validé CÔTÉ SERVEUR par l'Edge Function.
   */
  static async createCheckout(barId: string, monthsCovered: number): Promise<string> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée. Reconnectez-vous.');

      const response = await supabase.functions.invoke('create-subscription-checkout', {
        body: { barId, monthsCovered },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) {
        const message = response.error.context?.body?.error || response.error.message;
        throw new Error(message);
      }
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      const url = response.data?.checkout_url;
      if (!url) throw new Error('Lien de paiement non reçu');
      return url as string;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
