import { supabase } from '../../lib/supabase';

/**
 * Service dédié au flux d'opt-in WhatsApp analyste (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4/§9).
 * Appelle les 2 Edge Functions qui encadrent le lien numéro WhatsApp -> bar :
 * - request-wa-bar-link : génère et envoie un code de vérification (session promoteur/gérant réelle)
 * - la vérification du code se fait côté WhatsApp (le webhook intercepte la réponse à 6 chiffres),
 *   pas ici — aucune RPC verify_wa_bar_link_code n'est appelée depuis le front.
 */

export type RequestWaBarLinkResult =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Demande un code de vérification pour lier un numéro WhatsApp au bar donné.
 * barId et phoneWaId sont transmis à l'Edge Function, qui appelle la RPC
 * SOUS LA SESSION DU PROMOTEUR APPELANT (jamais service_role) — auth.uid()
 * est résolu depuis le token, jamais transmis en paramètre applicatif.
 */
export async function requestWaBarLink(barId: string, phoneWaId: string): Promise<RequestWaBarLinkResult> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }

  const response = await supabase.functions.invoke('request-wa-bar-link', {
    body: { barId, phoneWaId },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    const edgeFunctionError = response.error.context?.body?.error || response.error.message;
    throw new Error(edgeFunctionError);
  }

  if (!response.data || typeof response.data.success !== 'boolean') {
    throw new Error("Réponse inattendue du serveur, veuillez réessayer.");
  }

  return response.data as RequestWaBarLinkResult;
}

export interface WaBarLinkStatus {
  phoneWaId: string;
  verified: boolean;
  isActiveLink: boolean;
  createdAt: string;
}

/**
 * Lit l'état du lien WhatsApp pour CE bar (pas la vue par numéro — un bar
 * peut n'avoir qu'un lien à la fois côté UI, un numéro pouvant en revanche
 * être lié à plusieurs bars, cf §4bis).
 *
 * CORRECTIF (code review multi-angle, 23/08/2026, bug confirmé indépendamment
 * par de nombreux angles convergents) : cette fonction faisait une lecture
 * directe .from('wa_bar_links') — impossible en pratique, la table a
 * REVOKE ALL FROM authenticated (20260821090000_create_wa_bar_links.sql) et
 * aucune policy RLS n'a jamais été ajoutée pour authenticated. Chaque appel
 * échouait avec "permission denied for table wa_bar_links", avalé
 * silencieusement par le catch de WaBarLinkSection — la section n'affichait
 * jamais aucun statut, et le RPC get_wa_bar_link_status (20260823090000),
 * écrit précisément pour fournir ce chemin de lecture, restait du code mort.
 * Fix : appeler ce RPC (SECURITY DEFINER, filtre is_bar_member en interne)
 * au lieu de contourner la table directement.
 */
export async function getWaBarLinkStatus(barId: string): Promise<WaBarLinkStatus | null> {
  const { data, error } = await supabase.rpc('get_wa_bar_link_status', { p_bar_id: barId });

  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;

  return {
    phoneWaId: row.phone_wa_id,
    verified: row.verified === true,
    isActiveLink: row.is_active_link === true,
    createdAt: row.created_at,
  };
}
