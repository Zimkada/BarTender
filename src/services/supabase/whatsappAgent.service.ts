// whatsappAgent.service.ts — Lecture des conversations et leads de l'agent WhatsApp.
//
// 🛡️ Ces tables (wa_conversations, wa_leads) sont réservées super_admin (RLS,
// cf migration 20260719000000). Ce service est donc utilisable UNIQUEMENT depuis
// des écrans admin — jamais depuis un contexte bar user.
//
// Page V1 en LECTURE SEULE (sauf changement de statut lead et retour au bot) :
// la réponse aux clients se fait via l'app/Business Suite WhatsApp de l'éditeur,
// pas depuis BarTender (cf décision produit — pas de centralisation de la
// messagerie dans l'app).

import { supabase, handleSupabaseError } from '../../lib/supabase';

export type WaMode = 'bot' | 'humain' | 'escalade_pending';
export type WaProfil = 'inconnu' | 'prospect' | 'client';
export type WaLeadStatut = 'nouveau' | 'contacte' | 'demo_donnee' | 'converti' | 'perdu';
export type WaLeadInteret = 'froid' | 'tiede' | 'chaud';

export interface WaMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  wamid?: string;
  delivered?: boolean;
}

export interface WaEscalade {
  motif: string;
  resume: string;
  urgence: 'normale' | 'haute';
  ts: string;
}

export interface WaConversation {
  id: string;
  phone: string;
  waName: string | null;
  profil: WaProfil;
  mode: WaMode;
  messages: WaMessage[];
  escalade: WaEscalade | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaLead {
  id: string;
  conversationId: string | null;
  phone: string;
  nomContact: string | null;
  nomBar: string | null;
  ville: string | null;
  role: 'promoteur' | 'gerant' | 'autre' | 'inconnu' | null;
  tailleEquipe: number | null;
  volumeActivite: string | null;
  besoinPrincipal: string | null;
  niveauInteret: WaLeadInteret;
  statut: WaLeadStatut;
  createdAt: string;
  updatedAt: string;
}

function mapConversation(row: Record<string, unknown>): WaConversation {
  return {
    id: row.id as string,
    phone: row.phone as string,
    waName: (row.wa_name as string) ?? null,
    profil: row.profil as WaProfil,
    mode: row.mode as WaMode,
    messages: (row.messages as WaMessage[]) ?? [],
    escalade: (row.escalade as WaEscalade) ?? null,
    lastMessageAt: (row.last_message_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapLead(row: Record<string, unknown>): WaLead {
  return {
    id: row.id as string,
    conversationId: (row.conversation_id as string) ?? null,
    phone: row.phone as string,
    nomContact: (row.nom_contact as string) ?? null,
    nomBar: (row.nom_bar as string) ?? null,
    ville: (row.ville as string) ?? null,
    role: (row.role as WaLead['role']) ?? null,
    tailleEquipe: (row.taille_equipe as number) ?? null,
    volumeActivite: (row.volume_activite as string) ?? null,
    besoinPrincipal: (row.besoin_principal as string) ?? null,
    niveauInteret: row.niveau_interet as WaLeadInteret,
    statut: row.statut as WaLeadStatut,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class WhatsappAgentService {
  /**
   * Liste des conversations, triées : celles à traiter (mode ≠ bot) d'abord, puis
   * par dernier message. Le tri "à traiter d'abord" est appliqué côté client après
   * le fetch (PostgREST ne trie pas simplement sur une expression booléenne) — sans
   * incidence car le volume est borné à `limit`. Filtre optionnel par mode.
   */
  static async listConversations(params?: {
    modeFilter?: WaMode | 'a_traiter' | 'all';
    limit?: number;
  }): Promise<WaConversation[]> {
    let query = supabase
      .from('wa_conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(params?.limit ?? 100);

    if (params?.modeFilter === 'a_traiter') {
      query = query.neq('mode', 'bot');
    } else if (params?.modeFilter && params.modeFilter !== 'all') {
      query = query.eq('mode', params.modeFilter);
    }

    const { data, error } = await query;
    if (error) throw new Error(handleSupabaseError(error));

    // Priorité "à traiter" : mode ≠ bot remonte en tête (l'ordre par
    // last_message_at DESC est préservé au sein de chaque groupe car sort() est stable).
    return (data ?? [])
      .map(mapConversation)
      .sort((a, b) => Number(a.mode === 'bot') - Number(b.mode === 'bot'));
  }

  static async getConversation(id: string): Promise<WaConversation | undefined> {
    const { data, error } = await supabase
      .from('wa_conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(handleSupabaseError(error));
    return data ? mapConversation(data) : undefined;
  }

  /**
   * Redonne la main au bot sur une conversation (après une intervention manuelle
   * terminée). Seule mutation de ce service en V1 — le contenu des messages
   * reste géré exclusivement par l'Edge Function wa-webhook (service_role).
   */
  static async resumeBot(id: string): Promise<void> {
    const { error } = await supabase
      .from('wa_conversations')
      .update({ mode: 'bot' })
      .eq('id', id);
    if (error) throw new Error(handleSupabaseError(error));
  }

  static async listLeads(params?: {
    statutFilter?: WaLeadStatut | 'all';
    limit?: number;
  }): Promise<WaLead[]> {
    let query = supabase
      .from('wa_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(params?.limit ?? 100);

    if (params?.statutFilter && params.statutFilter !== 'all') {
      query = query.eq('statut', params.statutFilter);
    }

    const { data, error } = await query;
    if (error) throw new Error(handleSupabaseError(error));
    return (data ?? []).map(mapLead);
  }

  static async updateLeadStatut(id: string, statut: WaLeadStatut): Promise<void> {
    const { error } = await supabase
      .from('wa_leads')
      .update({ statut })
      .eq('id', id);
    if (error) throw new Error(handleSupabaseError(error));
  }
}
