// services/supabase/coPromoteur.service.ts
// Nomination et retrait du rôle co_promoteur - Phase 2 (21/09/2026).
//
// 🛡️ Wrappe EXCLUSIVEMENT les RPC add_co_promoteur / remove_co_promoteur
// (migration 20260901100000, en prod depuis le 01/09/2026). Toute écriture
// visant une ligne bar_members de rôle co_promoteur DOIT passer par ces RPC :
// les 3 policies RESTRICTIVES de l'étape 4a (20260901130000) filtrent la ligne
// au lieu de refuser - un .update() direct affecterait 0 ligne SANS lever
// d'erreur. Voir docs/roadmaps/PLAN_CO_PROMOTEUR_PHASE2.md §3.4.
//
// ⚠️ DETTE CONNUE : add_co_promoteur et remove_co_promoteur sont ABSENTS de
// database.types.ts - les types Supabase n'ont jamais été régénérés depuis
// leur création (01/09/2026). `supabase.rpc(...)` est donc appelé avec un
// typage manuel ci-dessous, contournant le typage généré via un cast ciblé.
// Cette dette doit être résolue par `npm run gen:types` dès que possible ;
// une fois fait, retirer le cast `as unknown as ...` et laisser le typage
// généré prendre le relais.

import { supabase } from '../../lib/supabase';
import { getErrorMessage } from '../../utils/errorHandler';

/** Réponse commune aux deux RPC - reflète jsonb_build_object côté SQL. */
interface CoPromoteurAddResult {
  success: boolean;
  member_id?: string;
  user_name?: string;
  previous_role?: string;
  message?: string;
  error?: string;
}

interface CoPromoteurRemoveResult {
  success: boolean;
  user_name?: string;
  message?: string;
  error?: string;
}

/**
 * Fonctions RPC non présentes dans database.types.ts (dette documentée
 * ci-dessus). Le client Supabase typé refuse ces noms au niveau TypeScript ;
 * ce type isole précisément le contournement, sans l'étendre à tout le fichier.
 */
type UntypedRpcClient = {
  rpc(
    fn: 'add_co_promoteur' | 'remove_co_promoteur',
    args: { p_bar_id: string; p_user_id: string }
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export class CoPromoteurService {
  /**
   * Nomme un co-promoteur. SuperAdmin uniquement - le RPC lui-même applique
   * ce garde (is_super_admin()), ce wrapper ne fait que relayer l'appel et
   * normaliser l'erreur.
   *
   * Refus attendus du RPC (à afficher tels quels à l'utilisateur, ils sont
   * déjà rédigés en français par la migration) :
   *   - appelant non SuperAdmin
   *   - bar ou utilisateur introuvable
   *   - cible = propriétaire du bar
   *   - cible déjà promoteur / super_admin / co_promoteur
   *   - cible = serveur (promotion directe refusée, cf. plan §3.3)
   *   - quota de membres du plan atteint
   */
  static async addCoPromoteur(
    barId: string,
    userId: string
  ): Promise<CoPromoteurAddResult> {
    try {
      const { data, error } = await (supabase as unknown as UntypedRpcClient).rpc(
        'add_co_promoteur',
        { p_bar_id: barId, p_user_id: userId }
      );

      if (error) throw error;

      return data as CoPromoteurAddResult;
    } catch (error) {
      console.error('[CoPromoteurService] addCoPromoteur error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Retire un co-promoteur (désactivation, jamais suppression - le RPC fait
   * is_active = FALSE pour préserver la traçabilité). Autorisé au SuperAdmin,
   * au propriétaire du bar, et au promoteur du bar. JAMAIS à un autre
   * co-promoteur (pas de révocation hostile entre associés).
   *
   * 📋 DETTE RELEVEE (code review du 21/09/2026, NON corrigee ici) :
   * remove_co_promoteur ne verifie pas GET DIAGNOSTICS ... ROW_COUNT apres
   * son UPDATE (20260901100000:54-58) - il retourne success=true sans
   * s'assurer qu'une ligne a bien ete affectee. Il controle l'existence du
   * membre actif juste avant, mais par une LECTURE : entre les deux, rien ne
   * garantit l'ecriture.
   *
   * Risque attenue en pratique : le RPC est SECURITY DEFINER, donc les 3
   * policies RESTRICTIVE de l'etape 4a - la cause classique d'un UPDATE a 0
   * ligne sur ce projet - ne s'appliquent pas a lui. Un success=true sans
   * desactivation reelle reste neanmoins possible, et ferait ecrire une
   * entree MEMBER_REMOVED contredisant l'etat de la base. A corriger dans
   * une passe SQL dediee, pas au detour d'un chantier front (lecon du
   * 01/09 : ne jamais durcir une fonction au passage d'un autre chantier).
   */
  static async removeCoPromoteur(
    barId: string,
    userId: string
  ): Promise<CoPromoteurRemoveResult> {
    try {
      const { data, error } = await (supabase as unknown as UntypedRpcClient).rpc(
        'remove_co_promoteur',
        { p_bar_id: barId, p_user_id: userId }
      );

      if (error) throw error;

      return data as CoPromoteurRemoveResult;
    } catch (error) {
      console.error('[CoPromoteurService] removeCoPromoteur error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  }
}
