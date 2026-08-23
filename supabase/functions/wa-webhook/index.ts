// wa-webhook — Agent commercial + support WhatsApp (Meta Cloud API → Claude → réponse).
//
// 🛡️ Sécurité :
// - verify_jwt = false (Meta ne peut pas envoyer de JWT Supabase). L'authentification
//   repose sur DEUX mécanismes Meta : le handshake GET (verify_token) et la signature
//   HMAC-SHA256 de chaque POST (header X-Hub-Signature-256, secret = META_APP_SECRET).
//   Rien n'est parsé avant que la signature passe.
// - DB via service_role (bypass RLS) : les tables wa_* sont réservées super_admin
//   côté UI, l'Edge Function est leur unique chemin d'écriture automatique.
// - Le bot est MUET dès que mode <> 'bot' (humain a repris la main / escalade en
//   attente) : le message entrant est archivé mais aucune réponse n'est envoyée.
//
// 💰 Coûts :
// - System prompt commercial (~10k tokens) avec cache_control ephemeral → cache
//   read ~0.1x. Mode analyste : prompt SÉPARÉ (~1,6k tokens), son propre
//   breakpoint de cache - jamais mélangé (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §7).
// - max_tokens 300 (réponses WhatsApp courtes par design).
// - Médias non pris en charge → réponse standard SANS appel Claude (coût zéro).
// - Historique envoyé à Claude borné à HISTORY_LIMIT messages (la DB garde tout).
//
// Flux POST :
//   signature OK → dédup wamid → archive message user → si mode='bot' :
//   Claude (boucle tools ≤ MAX_TOOL_ROUNDS) → envoi réponse WhatsApp → persistance.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SYSTEM_PROMPT, SYSTEM_PROMPT_ANALYST } from './prompt.ts'

// =====================================================
// Configuration
// =====================================================

const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5'
// Mode analyste (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §7) : Sonnet, jamais
// Haiku - nuance de raisonnement sur des chiffres réels, faible volume par
// construction (seuls les promoteurs/gérants liés - §4). Secret dédié séparé
// de ANTHROPIC_MODEL (mode commercial) pour pouvoir changer l'un sans l'autre.
const ANTHROPIC_MODEL_ANALYST = Deno.env.get('ANTHROPIC_MODEL_ANALYST') ?? 'claude-sonnet-5'
const MAX_TOKENS = 300
const HISTORY_LIMIT = 24 // messages envoyés à Claude (le JSONB en DB garde tout)
const MAX_TOOL_ROUNDS = 4
const WHATSAPP_API_VERSION = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v20.0'

const FALLBACK_TECH = 'Petit souci technique de notre côté 🙏 Pouvez-vous renvoyer votre message dans un instant ?'
const FALLBACK_ESCALADE = 'Je transmets votre demande à notre équipe, vous serez recontacté rapidement 👍'
const FALLBACK_MEDIA = 'Je ne peux pas encore écouter les notes vocales ni ouvrir les fichiers 🙏 Pouvez-vous écrire votre question en texte ?'

// Schémas des tools — garder alignés avec whatsapp-agent/README.md
//
// ⚠️ DEUX ensembles DISTINCTS, jamais fusionnés (§4ter de l'étude) : la
// résolution d'identité détermine quels tools sont exposés à Claude
// (autorisation), pas un aiguillage de conversation entière. Un numéro
// résolu en mode analyste n'a pas besoin des tools commerciaux
// (enregistrer_lead n'a aucun sens pour un promoteur déjà client), et
// inversement un prospect ordinaire ne doit jamais voir apparaître
// obtenir_stats_bar dans son contexte - même schéma de tool jamais envoyé
// à un appelant qui n'y a pas droit, par défense en profondeur (en plus de
// la vérification is_bar_member côté RPC).
const COMMERCIAL_TOOLS = [
  {
    name: 'enregistrer_lead',
    description:
      "Enregistre ou met à jour un prospect qualifié dans le CRM. Appeler dès qu'on connaît " +
      "au moins un nom OU un nom de bar avec une ville ou une taille d'équipe. " +
      'Rappeler avec les champs complétés si de nouvelles infos arrivent.',
    input_schema: {
      type: 'object',
      properties: {
        nom_contact: { type: 'string', description: 'Nom de la personne' },
        nom_bar: { type: 'string', description: "Nom de l'établissement" },
        ville: { type: 'string' },
        role: { type: 'string', enum: ['promoteur', 'gerant', 'autre', 'inconnu'] },
        taille_equipe: { type: 'integer', description: 'Nombre de personnes, si connu' },
        volume_activite: { type: 'string', description: 'Volume approximatif évoqué (ex: casiers/semaine, affluence)' },
        besoin_principal: { type: 'string', description: 'Douleur exprimée en une phrase' },
        niveau_interet: { type: 'string', enum: ['froid', 'tiede', 'chaud'] },
      },
      required: ['niveau_interet'],
    },
  },
  {
    name: 'escalader_humain',
    description:
      "Transmet la conversation à l'équipe humaine et met le bot en pause sur ce fil. " +
      "Appeler selon les règles d'escalade du prompt (négociation, bug, frustration, " +
      'incertitude, conversation qui tourne en rond, volonté de démarrer/payer).',
    input_schema: {
      type: 'object',
      properties: {
        motif: {
          type: 'string',
          enum: ['demande_demo', 'negociation_prix', 'bug_technique', 'reclamation',
                 'question_sans_reponse', 'demande_humain', 'compte_paiement', 'autre'],
        },
        resume: { type: 'string', description: "Résumé de la situation en 1-2 phrases pour l'équipe" },
        urgence: { type: 'string', enum: ['normale', 'haute'] },
      },
      required: ['motif', 'resume'],
    },
  },
  {
    name: 'definir_profil',
    description:
      "Enregistre le profil de l'interlocuteur dès qu'il est connu : 'prospect' (découvre " +
      "l'application) ou 'client' (utilise déjà BarTender). Appeler une seule fois, " +
      "sauf correction.",
    input_schema: {
      type: 'object',
      properties: {
        profil: { type: 'string', enum: ['prospect', 'client'] },
      },
      required: ['profil'],
    },
  },
]

// ⭐ ÉTAPE 3 DU BRANCHEMENT MODE ANALYSTE (23/08/2026, §10) : premier et
// unique tool de données réelles, roulé en interne avant tout accès
// promoteur (§10 étape 3). AUCUN paramètre bar_id/user_id exposé - le bar
// est déjà résolu par le code (3ter du handler) avant même que Claude ne
// voie ce tool, jamais transporté par le modèle (§3, principe central de
// l'étude). Un tool sans paramètre inutile, conforme à l'optimisation §7bis
// n°2 (chaque paramètre en plus grossit le prompt envoyé à chaque appel).
const ANALYST_TOOLS = [
  {
    name: 'obtenir_stats_bar',
    description:
      "Récupère les statistiques réelles du bar de l'interlocuteur : nombre de produits actifs, " +
      "nombre de ventes validées, chiffre d'affaires total (ventes validées), nombre de ventes " +
      "en attente de validation. Aucun paramètre : porte toujours sur le bar déjà résolu pour " +
      "ce numéro WhatsApp, jamais un autre bar.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

// =====================================================
// Types internes
// =====================================================

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  ts: string
  wamid?: string
}

interface Conversation {
  id: string
  phone: string
  wa_name: string | null
  profil: string
  mode: 'bot' | 'humain' | 'escalade_pending'
  messages: StoredMessage[]
  escalade: Record<string, unknown> | null
  updated_at: string
}

// Résultat de resolve_wa_bar_link() (20260821090000_create_wa_bar_links.sql) -
// présence de cet objet = identité résolue en mode analyste pour ce message.
interface AnalystLink {
  bar_id: string
  user_id: string
  role: string
}

const CONV_COLS = 'id, phone, wa_name, profil, mode, messages, escalade, updated_at'

/**
 * Ajoute des messages au JSONB de façon concurrente-safe (verrou optimiste sur
 * updated_at). À chaque tentative on relit l'état frais, on refusionne, et on
 * n'écrit QUE si updated_at n'a pas bougé entre-temps (.eq garde le CAS). En cas
 * de conflit (envois rapprochés, écriture de executeTool), on reboucle : aucun
 * message n'est perdu par un write last-wins.
 */
async function appendMessages(
  db: SupabaseClient,
  convId: string,
  toAppend: StoredMessage[] | Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: fresh, error: readErr } = await db
      .from('wa_conversations')
      .select('messages, updated_at')
      .eq('id', convId)
      .single()
    if (readErr) throw readErr

    const nextMessages = [...(fresh.messages ?? []), ...toAppend]
    const { data: updated, error: updErr } = await db
      .from('wa_conversations')
      .update({ messages: nextMessages, ...extra })
      .eq('id', convId)
      .eq('updated_at', fresh.updated_at) // 0 ligne si un concurrent a écrit entre-temps
      .select('id')
      .maybeSingle()
    if (updErr) throw updErr
    if (updated) return
    // 0 ligne = conflit concurrent → reboucle avec l'état frais
  }
  throw new Error(`appendMessages: too many write conflicts for ${convId}`)
}

// =====================================================
// Signature Meta (X-Hub-Signature-256)
// =====================================================

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function verifyMetaSignature(rawBody: string, header: string, appSecret: string): Promise<boolean> {
  if (!header.startsWith('sha256=')) return false
  const received = header.slice('sha256='.length)

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeEqual(expected, received)
}

// =====================================================
// Envoi WhatsApp (Graph API)
// =====================================================

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? ''
  // WhatsApp limite le texte à 4096 caractères — nos réponses font 2-4 phrases,
  // la coupe est un filet de sécurité, pas un cas nominal.
  const text = body.length > 4000 ? body.slice(0, 4000) : body

  const res = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  )
  if (!res.ok) {
    console.error('[wa-webhook] WhatsApp send failed:', res.status, await res.text())
    return false
  }
  return true
}

// =====================================================
// Session applicative pour le mode analyste (piste Session,
// whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §6/§10 étape 3)
//
// ⚠️ ISOLATION DÉLIBÉRÉE : cette fonction ne doit JAMAIS être fusionnée ou
// partager du code avec le mécanisme d'impersonation admin existant
// (is_impersonating(), 20251213_enable_rls_bypass_for_impersonation.sql,
// qui contourne 15+ policies RLS via user_metadata.impersonation='true').
// Le test isolé du 21/08/2026 a confirmé qu'un token généré par
// generateLink+verifyOtp n'en porte pas la trace - mais cette garantie ne
// tient QUE si ce chemin reste dédié et jamais réutilisé/étendu depuis un
// code qui manipule ce claim. Aucun fichier de src/ (impersonation admin,
// tous côté React/RLS) n'est importé ici - contextes Deno et front
// totalement séparés, confirmé avant d'écrire cette fonction.
//
// Mécanisme exact démontré le 21/08/2026 :
//   adminClient.auth.admin.generateLink({ type: 'magiclink', email })
//     -> hashed_token (service_role, n'envoie AUCUN email - confirmé)
//   anonClient.auth.verifyOtp({ type: 'magiclink', token_hash })
//     -> vraie session (access_token/refresh_token, expires_in: 3600,
//        aud/role: authenticated, sans claim impersonation)
//
// L'email requis par generateLink est résolu via adminClient.auth.admin.
// getUserById(userId) - PAS depuis public.users (aucune colonne email,
// auth par username, 004_custom_auth_complete.sql) ni via un nouveau RPC
// dédié (pas de nouvelle surface d'exposition pour une donnée qui n'a
// besoin de sortir de auth.users qu'en mémoire de fonction). Un compte
// créé par username seul (cas nominal pour un serveur/gérant, pas une
// exception - TeamManagementPage.tsx) porte un email placeholder généré
// `username@bartender.app`, déjà connu et géré ailleurs dans ce repo
// (admin_send_password_reset) - sans conséquence ici, generateLink ne
// dépend jamais du domaine de l'email, seulement de son existence.
// =====================================================

interface AnalystSession {
  accessToken: string
  refreshToken: string
}

/**
 * Génère une session applicative réelle pour l'utilisateur promoteur/gérant
 * résolu par resolve_wa_bar_link(), afin d'appeler les RPC de données SOUS
 * cette session (RLS/is_bar_member s'applique tel quel, RPC non modifiés) -
 * jamais sous service_role brut pour les tools de données réelles.
 *
 * Retourne null en cas d'échec (email introuvable, generateLink/verifyOtp
 * en erreur) - l'appelant doit alors refuser l'accès au mode analyste pour
 * ce message plutôt que de retomber sur service_role par défaut.
 */
async function createAnalystSession(adminDb: SupabaseClient, userId: string): Promise<AnalystSession | null> {
  const { data: userData, error: userError } = await adminDb.auth.admin.getUserById(userId)
  if (userError || !userData?.user?.email) {
    console.error('[wa-webhook] createAnalystSession: email introuvable pour', userId, userError?.message)
    return null
  }

  const { data: linkData, error: linkError } = await adminDb.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[wa-webhook] createAnalystSession: generateLink a échoué:', linkError?.message)
    return null
  }

  // Client anon dédié pour l'échange OTP - jamais le client service_role
  // (adminDb) : verifyOtp doit s'exécuter comme le ferait un vrai client,
  // pour produire une session authenticated normale, pas une opération admin.
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  )
  const { data: otpData, error: otpError } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (otpError || !otpData?.session) {
    console.error('[wa-webhook] createAnalystSession: verifyOtp a échoué:', otpError?.message)
    return null
  }

  return {
    accessToken: otpData.session.access_token,
    refreshToken: otpData.session.refresh_token,
  }
}

/**
 * Révoque la session applicative générée par createAnalystSession(), en fin
 * d'échange normal (pas seulement en cas d'erreur) - une session analyste ne
 * doit jamais rester valide au-delà du message qui l'a nécessitée. Best-effort
 * : un échec de révocation est loggé mais ne doit jamais faire échouer la
 * réponse déjà envoyée au promoteur.
 */
async function revokeAnalystSession(adminDb: SupabaseClient, accessToken: string): Promise<void> {
  try {
    // CORRECTIF CRITIQUE (code review multi-angle, 23/08/2026, confirmé par
    // de nombreux angles convergents) : 'global' revoque TOUTES les sessions
    // de cet utilisateur (toutes ses connexions app web/mobile en cours),
    // pas seulement la session ephemere generee par createAnalystSession.
    // Un promoteur en train de vendre sur sa tablette aurait ete deconnecte
    // en plein service a chaque simple question posee au bot analyste.
    // 'local' revoque uniquement la session identifiee par CE token precis -
    // exactement le comportement voulu par ce mecanisme (une session par
    // message, jamais plus, jamais moins).
    const { error } = await adminDb.auth.admin.signOut(accessToken, 'local')
    if (error) {
      console.error('[wa-webhook] revokeAnalystSession a échoué (non-bloquant):', error.message)
    }
  } catch (e) {
    console.error('[wa-webhook] revokeAnalystSession a levé une exception (non-bloquant):', e)
  }
}

// =====================================================
// Exécution des tools (écritures DB immédiates)
// =====================================================

async function executeTool(
  db: SupabaseClient,
  conv: Conversation,
  name: string,
  input: Record<string, unknown>,
  // Résolution d'identité mode analyste - requis pour obtenir_stats_bar
  // (createAnalystSession a besoin du user_id résolu), absent/null pour tous
  // les tools commerciaux existants (aucun changement de comportement pour eux).
  analystLink: AnalystLink | null = null,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    // ⭐ ÉTAPE 3 DU BRANCHEMENT MODE ANALYSTE (23/08/2026, §6/§10 étape 3) :
    // premier tool de données réelles. db ici est le client service_role du
    // handler (voir handler principal) - utilisé UNIQUEMENT pour générer la
    // session applicative (createAnalystSession), JAMAIS pour appeler
    // get_bar_admin_stats directement : le RPC est appelé SOUS LA SESSION DU
    // PROMOTEUR RÉSOLU (piste Session, §6), pour que son guard is_bar_member
    // existant s'applique tel quel, sans aucune modification du RPC partagé
    // avec l'app web (interdiction ferme du §6, jamais d'exemption
    // service_role sur un RPC partagé).
    if (name === 'obtenir_stats_bar') {
      if (!analystLink) {
        // Ne devrait jamais arriver : ce tool n'est exposé à Claude que si
        // analystLink est résolu (activeTools dans runClaude) - garde de
        // défense en profondeur si jamais appelé hors de ce contexte.
        return { ok: false, error: 'obtenir_stats_bar appelé sans identité analyste résolue.' }
      }

      const session = await createAnalystSession(db, analystLink.user_id)
      if (!session) {
        return { ok: false, error: "Impossible de générer une session pour consulter les données du bar." }
      }

      try {
        const sessionClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: `Bearer ${session.accessToken}` } } },
        )
        const { data, error } = await sessionClient.rpc('get_bar_admin_stats', {
          p_bar_id: analystLink.bar_id,
        })
        if (error) throw error

        const row = data?.[0]
        if (!row) {
          return { ok: false, error: 'get_bar_admin_stats a retourné une réponse vide et inattendue.' }
        }

        // total_products = bar_products uniquement (boissons), n'inclut PAS
        // les plats du module restauration (limite documentée §10 de
        // l'étude, non corrigée sur ce RPC partagé avec l'app web - jamais
        // modifié pour ce nouveau cas d'usage, §6 interdiction ferme). Le
        // signaler explicitement dans la donnée retournée à Claude plutôt
        // que de laisser le modèle présenter ce chiffre comme exhaustif.
        return {
          ok: true,
          data: {
            total_produits_boissons: row.total_products,
            note_produits: "Ce total ne compte que les boissons, pas les plats si le bar fait aussi de la restauration.",
            total_ventes_validees: row.total_sales,
            chiffre_affaires_total: row.total_revenue,
            ventes_en_attente_validation: row.pending_sales,
          },
        }
      } finally {
        // Révocation TOUJOURS tentée, succès ou échec du RPC ci-dessus - une
        // session analyste ne doit jamais rester valide au-delà de cet appel.
        await revokeAnalystSession(db, session.accessToken)
      }
    }

    if (name === 'enregistrer_lead') {
      // Upsert par phone : les champs absents du payload restent inchangés en DB.
      const lead: Record<string, unknown> = { phone: conv.phone, conversation_id: conv.id }
      for (const k of ['nom_contact', 'nom_bar', 'ville', 'role', 'taille_equipe', 'volume_activite', 'besoin_principal', 'niveau_interet']) {
        if (input[k] !== undefined && input[k] !== null && input[k] !== '') lead[k] = input[k]
      }
      const { error } = await db.from('wa_leads').upsert(lead, { onConflict: 'phone' })
      if (error) throw error
      return { ok: true }
    }

    if (name === 'escalader_humain') {
      const escalade = {
        motif: input.motif ?? 'autre',
        resume: input.resume ?? '',
        urgence: input.urgence ?? 'normale',
        ts: new Date().toISOString(),
      }
      const { error } = await db
        .from('wa_conversations')
        .update({ mode: 'escalade_pending', escalade })
        .eq('id', conv.id)
      if (error) throw error
      conv.mode = 'escalade_pending' // reflet local pour la suite du flux

      // Notification best-effort vers le WhatsApp de l'admin (fonctionne seulement
      // si l'admin a une fenêtre de 24h ouverte avec le numéro business — sinon
      // échec silencieux, la page /admin/whatsapp reste la source de vérité).
      const adminPhone = Deno.env.get('ADMIN_WHATSAPP_NUMBER')
      if (adminPhone) {
        try {
          await sendWhatsApp(adminPhone, `🔔 Prise en main demandée\nNuméro : ${conv.phone}\nMotif : ${escalade.motif}\n${escalade.resume}`)
        } catch (e) {
          console.warn('[wa-webhook] Admin notify failed (non-blocking):', e)
        }
      }
      return { ok: true }
    }

    if (name === 'definir_profil') {
      const profil = input.profil === 'client' ? 'client' : 'prospect'
      const { error } = await db.from('wa_conversations').update({ profil }).eq('id', conv.id)
      if (error) throw error
      return { ok: true }
    }

    return { ok: false, error: `Unknown tool: ${name}` }
  } catch (e) {
    console.error('[wa-webhook] Tool %s failed:', name, e)
    // On renvoie l'échec à Claude (il formulera sa réponse sans bloquer l'utilisateur)
    return { ok: false, error: String(e) }
  }
}

// =====================================================
// Appel Claude (boucle tool use)
// =====================================================

async function runClaude(
  db: SupabaseClient,
  conv: Conversation,
  history: StoredMessage[],
  // Résolution d'identité mode analyste (3ter du handler, whatsapp-agent/
  // ETUDE_AGENT_ANALYSTE.md §4ter/§10) - détermine le modèle, le system
  // prompt, l'ensemble de tools exposés, ET (§10 étape 3) le bar_id passé à
  // createAnalystSession pour l'exécution du tool obtenir_stats_bar.
  analystLink: AnalystLink | null = null,
): Promise<{ text: string; escaladed: boolean }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')
  const isAnalystResolved = analystLink !== null
  const model = isAnalystResolved ? ANTHROPIC_MODEL_ANALYST : ANTHROPIC_MODEL

  // Historique borné, reconstruit en texte pur (les tool_use ne sont pas persistés).
  // ⭐ L'API Anthropic exige l'alternance stricte user/assistant : on fusionne les
  // messages consécutifs de même rôle (cas réel : plusieurs messages user archivés
  // pendant que le bot était muet en mode humain/escalade), et le premier message
  // doit être un user.
  const bounded = history.slice(-HISTORY_LIMIT)
  const merged: Array<{ role: string; content: string }> = []
  for (const m of bounded) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) {
      last.content += `\n${m.content}`
    } else {
      merged.push({ role: m.role, content: m.content })
    }
  }
  while (merged.length > 0 && merged[0].role !== 'user') merged.shift()
  let messages: Array<Record<string, unknown>> = merged

  let finalText = ''
  let escaladed = false

  // Prompt SÉPARÉ (§7), jamais mélangé au prompt commercial - son propre
  // breakpoint de cache ephemeral. Mélanger les deux ferait payer le cache du
  // volet commercial (gros volume, faible valeur) à chaque question
  // analytique, et inversement gonflerait le prompt commercial avec des
  // instructions qu'un prospect ne déclenchera jamais.
  const systemPrompt = isAnalystResolved ? SYSTEM_PROMPT_ANALYST : SYSTEM_PROMPT
  // ⭐ ÉTAPE 3 DU BRANCHEMENT MODE ANALYSTE (23/08/2026, §4ter) : ensemble de
  // tools distinct selon le mode - jamais les deux à la fois (défense en
  // profondeur, en plus de is_bar_member côté RPC : un tool dont le schéma
  // n'est même pas envoyé à Claude ne peut pas être appelé par erreur ni par
  // injection de prompt réussie).
  const activeTools = isAnalystResolved ? ANALYST_TOOLS : COMMERCIAL_TOOLS

  // On autorise MAX_TOOL_ROUNDS tours AVEC tools, plus un dernier appel SANS tools
  // pour forcer une réponse en langage naturel (évite qu'une conversation qui sature
  // la boucle de tools reparte sans réponse finale — cf certification bug #1).
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: [
          // Prefix stable → prompt caching (cache read ~0.1x dès le 2e appel).
          // Breakpoint propre à chaque prompt (commercial vs analyste) - jamais
          // partagé, voir commentaire sur systemPrompt ci-dessus.
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
        ],
        // Au dernier tour, on retire les tools : Claude DOIT produire du texte.
        ...(lastRound ? {} : { tools: activeTools }),
        messages,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 300)}`)
    }

    const data = await res.json()
    const blocks: Array<Record<string, unknown>> = data.content ?? []

    const textParts = blocks.filter((b) => b.type === 'text').map((b) => String(b.text))
    if (textParts.length > 0) finalText = textParts.join('\n\n')

    const toolUses = blocks.filter((b) => b.type === 'tool_use')
    // Sortie normale : pas de tool demandé (ou dernier tour, sans tools disponibles)
    if (lastRound || data.stop_reason !== 'tool_use' || toolUses.length === 0) break

    // Exécuter chaque tool, renvoyer les résultats, reboucler
    const results: Array<Record<string, unknown>> = []
    for (const tu of toolUses) {
      const result = await executeTool(db, conv, String(tu.name), (tu.input ?? {}) as Record<string, unknown>, analystLink)
      if (tu.name === 'escalader_humain' && result.ok) escaladed = true
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
    }
    messages = [
      ...messages,
      { role: 'assistant', content: blocks },
      { role: 'user', content: results },
    ]
  }

  // Filet : jamais de réponse vide vers l'utilisateur
  if (!finalText.trim()) {
    finalText = escaladed ? FALLBACK_ESCALADE : FALLBACK_TECH
  }
  return { text: finalText, escaladed }
}

// =====================================================
// Handler principal
// =====================================================

serve(async (req) => {
  try {
    // --- 1. Handshake de vérification Meta (configuration du webhook) ---
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')
      const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''

      if (mode === 'subscribe' && expected && token === expected && challenge) {
        return new Response(challenge, { status: 200 })
      }
      return new Response('Forbidden', { status: 403 })
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // --- 2. Signature HMAC d'abord — rien n'est parsé avant ---
    const rawBody = await req.text()
    const appSecret = Deno.env.get('META_APP_SECRET') ?? ''
    if (!appSecret) {
      console.error('[wa-webhook] META_APP_SECRET is not configured')
      return new Response('Server misconfigured', { status: 500 })
    }
    const signature = req.headers.get('x-hub-signature-256') ?? ''
    if (!(await verifyMetaSignature(rawBody, signature, appSecret))) {
      console.warn('[wa-webhook] Invalid or missing signature — rejected')
      return new Response('Invalid signature', { status: 401 })
    }

    // --- 3. Extraire le message entrant (ignorer les statuts delivered/read) ---
    const payload = JSON.parse(rawBody)
    const value = payload?.entry?.[0]?.changes?.[0]?.value
    const msg = value?.messages?.[0]
    if (!msg) {
      return new Response(JSON.stringify({ received: true, ignored: 'status' }), { status: 200 })
    }

    const phone: string = String(msg.from)
    const wamid: string = String(msg.id)
    const waName: string | null = value?.contacts?.[0]?.profile?.name ?? null
    const nowIso = new Date().toISOString()

    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    // --- 3bis. Interception d'un code de vérification WhatsApp analyste ---
    // (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4/§9 : "le webhook intercepte
    // un message de 6 chiffres AVANT de charger wa_conversations — si une
    // demande en attente correspond, il la traite entièrement et retourne,
    // sans jamais créer ni modifier une ligne de conversation commerciale
    // pour ce numéro"). Volontairement placée avant l'étape 4 : ni lecture
    // ni écriture sur wa_conversations tant que ce cas n'est pas écarté.
    //
    // Ne matche QUE si le texte entier (trim) fait exactement 6 chiffres —
    // pas une simple recherche de 6 chiffres n'importe où dans le message.
    // Un vrai code de vérification est tapé seul par l'utilisateur en
    // réponse au message reçu ; une phrase commerciale contenant
    // incidemment 6 chiffres consécutifs (ex. "j'ai vendu pour 123456
    // francs") ne doit jamais être interceptée à tort (décision validée
    // avant écriture).
    if (msg.type === 'text' && /^\d{6}$/.test(String(msg.text?.body ?? '').trim())) {
      const candidateCode = String(msg.text.body).trim()
      // p_wamid transmis pour dedup (20260822090002) : un retry Meta sur
      // ce meme message rejoue le meme statut sans decrementer une
      // seconde fois les tentatives restantes.
      const { data: verifyData, error: verifyError } = await db.rpc('verify_wa_bar_link_code', {
        p_phone_wa_id: phone,
        p_code: candidateCode,
        p_wamid: wamid,
      })

      if (verifyError) {
        // Anomalie serveur réelle (RPC en échec) : on ne bloque jamais un
        // vrai échange commercial pour une erreur technique sur un canal
        // parallèle — on logue et on laisse le flux normal continuer,
        // exactement comme si aucune interception n'avait eu lieu.
        console.error('[wa-webhook] verify_wa_bar_link_code failed:', verifyError.message)
      } else {
        // verifyData?.[0] absent est inattendu : verify_wa_bar_link_code()
        // retourne toujours exactement une ligne (7 branches, chacune fait
        // RETURN QUERY SELECT avant RETURN — vérifié ligne par ligne). Un
        // log distinctif ici (cohérent avec request-wa-bar-link/index.ts,
        // qui applique la même discipline) plutôt qu'un fallback silencieux
        // vers '' — ce cas ne doit jamais passer inaperçu s'il survient.
        if (!verifyData || verifyData.length === 0) {
          console.error('[wa-webhook] verify_wa_bar_link_code a retourné une réponse vide et inattendue pour', phone)
        }
        const verifyStatus: string = verifyData?.[0]?.status ?? ''

        // aucune_demande_en_attente : ce numéro n'a jamais rien demandé (ou
        // plus rien en attente) — le message "123456" n'est alors qu'un
        // message ordinaire, on le laisse continuer normalement vers
        // Claude, sans jamais répondre ni bloquer (décision validée avant
        // écriture : ne jamais dégrader l'expérience d'un client qui n'a
        // rien demandé).
        if (verifyStatus && verifyStatus !== 'aucune_demande_en_attente') {
          // Les 4 statuts restants (code_expire, trop_de_tentatives,
          // code_incorrect, verifie) prouvent qu'une vraie demande de
          // vérification existait pour ce numéro : une réponse dédiée est
          // alors légitime et attendue, on répond puis on ARRÊTE le
          // traitement de ce message ici — jamais de conversation
          // commerciale créée/modifiée, jamais d'appel Claude pour ce
          // message précis.
          const verifyReplies: Record<string, string> = {
            code_expire: "Ce code a expiré. Veuillez relancer une demande de vérification depuis l'application.",
            trop_de_tentatives: "Trop de tentatives incorrectes. Veuillez relancer une demande de vérification depuis l'application.",
            code_incorrect: 'Code incorrect, veuillez réessayer.',
            verifie: 'Votre numéro WhatsApp est désormais vérifié ✅',
          }
          const verifyReply = verifyReplies[verifyStatus]
          let verifyDelivered = true
          if (verifyReply) {
            // Contrairement au flux commercial (delivered:false persisté dans
            // wa_conversations), ce chemin ne touche jamais cette table par
            // principe (isolation stricte) — un échec d'envoi ici n'a donc
            // aucune trace persistée. Log explicite trouvé nécessaire en code
            // review (cohérent avec sendWhatsApp qui logue déjà ses propres
            // échecs, mais sans contexte "vérification WhatsApp" précis).
            verifyDelivered = await sendWhatsApp(phone, verifyReply)
            if (!verifyDelivered) {
              console.error('[wa-webhook] Échec envoi réponse de vérification WhatsApp analyste pour', phone, '- statut:', verifyStatus)
            }
          }
          return new Response(JSON.stringify({ received: true, waBarLinkVerification: verifyStatus, delivered: verifyDelivered }), { status: 200 })
        }
      }
    }

    // --- 3ter. Résolution d'identité mode analyste (étape 3 du séquencement,
    // whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4ter/§10) ---
    // ⚠️ Volontairement APRÈS le bloc 3bis (jamais avant : un message de
    // vérification à 6 chiffres n'a pas besoin de résolution analyste, il est
    // déjà entièrement traité et on est déjà `return`) mais AVANT le chargement
    // de wa_conversations - la résolution ne modifie ni ne lit cette table.
    //
    // §4ter (précision de conception déjà actée) : ce lien n'est PAS un
    // aiguillage de mode par conversation - un promoteur lié continue de poser
    // des questions de support ordinaire autant que des questions sur ses
    // données réelles. La résolution détermine seulement quels tools seront
    // exposés à Claude (autorisation) - le choix d'appeler un tool reste au
    // modèle (intention). Le routage Sonnet/Haiku (§7) suit cette résolution,
    // pas un aiguillage de conversation entière.
    //
    // ⭐ ÉTAPE 1 DU BRANCHEMENT (23/08/2026) : résolution + routage modèle
    // SEULEMENT. Pas encore de génération de session (createAnalystSession),
    // pas encore de tool de données, pas encore de prompt analyste séparé -
    // ces briques suivent dans des étapes validées séparément, pour tester le
    // handler par petits incréments plutôt qu'en un seul bloc.
    const { data: analystLinkData, error: analystLinkError } = await db.rpc('resolve_wa_bar_link', {
      p_phone_wa_id: phone,
    })
    if (analystLinkError) {
      // Non-bloquant : une erreur de résolution ne doit jamais empêcher le
      // flux commercial de continuer normalement - dégrade vers "pas de mode
      // analyste pour ce message", jamais vers une erreur visible du client.
      console.error('[wa-webhook] resolve_wa_bar_link a échoué (non-bloquant):', analystLinkError.message)
    }
    const analystLink = analystLinkData?.[0] ?? null
    if (analystLink) {
      console.log('[wa-webhook] Résolution analyste OK pour', phone, '- bar_id:', analystLink.bar_id, 'role:', analystLink.role)
    }

    // --- 4. Charger ou créer la conversation ---
    const { data: existing, error: loadError } = await db
      .from('wa_conversations')
      .select(CONV_COLS)
      .eq('phone', phone)
      .maybeSingle()
    if (loadError) throw loadError

    let conv = existing as Conversation | null
    if (!conv) {
      // insert().select() peut lever une contrainte unique si deux messages du même
      // nouveau contact arrivent en parallèle : on retombe alors sur un simple load.
      const { data: created, error: insertError } = await db
        .from('wa_conversations')
        .insert({ phone, wa_name: waName })
        .select(CONV_COLS)
        .single()
      if (insertError) {
        const { data: reloaded, error: reloadErr } = await db
          .from('wa_conversations').select(CONV_COLS).eq('phone', phone).single()
        if (reloadErr) throw insertError
        conv = reloaded as Conversation
      } else {
        conv = created as Conversation
      }
    }

    // --- 5. Déduplication (Meta retente si un 200 a été manqué) ---
    if (conv.messages?.some((m) => m.wamid === wamid)) {
      return new Response(JSON.stringify({ received: true, deduped: true }), { status: 200 })
    }

    // --- 6. Médias non pris en charge → réponse standard SANS appel Claude ---
    // (un texte vide est traité comme un média : l'API Claude rejette le contenu vide)
    const trimmedText: string = msg.type === 'text' ? String(msg.text?.body ?? '').trim() : ''
    const userText: string | null = trimmedText.length > 0 ? trimmedText : null
    if (userText === null) {
      const toAppend: StoredMessage[] = [
        { role: 'user', content: `[${msg.type} non pris en charge]`, ts: nowIso, wamid },
      ]
      if (conv.mode === 'bot') {
        const delivered = await sendWhatsApp(phone, FALLBACK_MEDIA)
        const m: Record<string, unknown> = { role: 'assistant', content: FALLBACK_MEDIA, ts: new Date().toISOString() }
        if (!delivered) m.delivered = false
        toAppend.push(m as unknown as StoredMessage)
      }
      await appendMessages(db, conv.id, toAppend, {
        last_message_at: nowIso, wa_name: waName ?? conv.wa_name,
      })
      return new Response(JSON.stringify({ received: true, media: msg.type }), { status: 200 })
    }

    // --- 7. Le message user, et l'historique local passé à Claude ---
    const userMsg: StoredMessage = { role: 'user', content: userText, ts: nowIso, wamid }
    const history: StoredMessage[] = [...(conv.messages ?? []), userMsg]

    // --- 8. Bot muet si un humain a la main : on archive juste le message user ---
    if (conv.mode !== 'bot') {
      await appendMessages(db, conv.id, [userMsg], {
        last_message_at: nowIso, wa_name: waName ?? conv.wa_name,
      })
      return new Response(JSON.stringify({ received: true, silent: conv.mode }), { status: 200 })
    }

    // --- 9. Appel Claude (boucle tools) avec fallback en cas d'échec ---
    let reply: string
    try {
      const result = await runClaude(db, conv, history, analystLink)
      reply = result.text
    } catch (e) {
      console.error('[wa-webhook] Claude call failed:', e)
      reply = FALLBACK_TECH
    }

    // --- 10. Répondre puis persister (user + assistant en un seul append) ---
    // delivered=false marque une réponse générée mais non délivrée (token expiré,
    // hors fenêtre 24h) : la page admin distingue ce cas d'une vraie livraison.
    // appendMessages relit l'état frais : les écritures de executeTool (mode,
    // escalade, profil) faites pendant runClaude ne sont pas écrasées.
    const delivered = await sendWhatsApp(phone, reply)
    const assistantMsg: Record<string, unknown> = {
      role: 'assistant', content: reply, ts: new Date().toISOString(),
    }
    if (!delivered) assistantMsg.delivered = false
    await appendMessages(
      db, conv.id,
      [userMsg, assistantMsg as unknown as StoredMessage],
      { last_message_at: nowIso, wa_name: waName ?? conv.wa_name },
    )

    return new Response(JSON.stringify({ received: true, delivered }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[wa-webhook] Caught error:', error)
    // 200 malgré l'erreur : on ne veut PAS que Meta boucle en retries sur un bug
    // interne (le message sera perdu pour le bot mais visible dans les logs).
    return new Response(JSON.stringify({ received: true, error: true }), { status: 200 })
  }
})
