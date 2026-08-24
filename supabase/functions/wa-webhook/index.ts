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
      "Récupère les statistiques réelles du bar de l'interlocuteur sur une journée commerciale ou " +
      "une période (jamais un cumul depuis toujours) : nombre de ventes validées, chiffre d'affaires, " +
      "nombre de ventes en attente de validation. Sans paramètre, porte sur la JOURNÉE EN COURS. " +
      "Utiliser nombre_jours et decalage_jours pour interroger le passé : hier = decalage_jours 1, " +
      "les 7 derniers jours = nombre_jours 7, la semaine précédente = nombre_jours 7 avec " +
      "decalage_jours 7. Le nombre de produits actifs est une exception, non daté : c'est un état " +
      "actuel (catalogue), pas une mesure de la période. Le bar est toujours celui déjà résolu pour " +
      "ce numéro WhatsApp, jamais un autre.",
    input_schema: {
      type: 'object',
      properties: {
        nombre_jours: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description:
            "Nombre de journées commerciales à agréger, en remontant depuis la fin de période. " +
            "1 (défaut) = une seule journée. 7 = une semaine. Maximum 90.",
        },
        decalage_jours: {
          type: 'integer',
          minimum: 0,
          maximum: 365,
          description:
            "Décalage en jours vers le passé pour la FIN de la période. 0 (défaut) = jusqu'à " +
            "aujourd'hui. 1 = jusqu'à hier. Maximum 365.",
        },
      },
    },
  },
  {
    name: 'obtenir_top_produits',
    description:
      "Récupère les produits/plats les plus vendus du bar de l'interlocuteur sur une période " +
      "récente (7 derniers jours par défaut, ajustable). Retourne pour chaque article : nom, " +
      "quantité vendue, chiffre d'affaires généré, marge réelle (déjà correcte pour les plats " +
      "de restauration, coût matière inclus - jamais un simple CUMP boisson appliqué à tort). " +
      "Trié par quantité vendue par défaut. Jamais de bar_id/user_id : porte toujours sur le " +
      "bar déjà résolu pour ce numéro WhatsApp.",
    input_schema: {
      type: 'object',
      properties: {
        nombre_jours: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description: "Fenêtre glissante en jours avant aujourd'hui (défaut 7 si omis). Ex: 30 si le promoteur demande explicitement le mois.",
        },
        limite: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Nombre de produits à retourner (défaut 5 si omis, jamais plus de 20).',
        },
        trier_par: {
          type: 'string',
          enum: ['quantity', 'revenue', 'profit'],
          description: "Critère de tri : quantité vendue (défaut), chiffre d'affaires, ou marge.",
        },
      },
    },
  },
  {
    name: 'obtenir_alertes_stock',
    description:
      "Récupère la liste des produits (boissons) du bar de l'interlocuteur dont le stock est " +
      "descendu au niveau ou en dessous du seuil d'alerte configuré. Retourne pour chaque " +
      "produit : nom, stock actuel, seuil d'alerte. Liste vide = aucun produit en alerte, " +
      "jamais une erreur. Ne concerne que les boissons, pas les plats/ingrédients du module " +
      "restauration. Aucun paramètre : porte toujours sur le bar déjà résolu pour ce numéro " +
      "WhatsApp.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'obtenir_performance_serveurs',
    description:
      "Récupère le classement des serveurs du bar de l'interlocuteur par chiffre d'affaires, " +
      "sur une période récente (7 derniers jours par défaut, ajustable). Retourne pour chaque " +
      "serveur : nom, rôle, nombre de ventes, chiffre d'affaires, articles vendus. Trié du " +
      "meilleur au moins bon. Un serveur sans aucune vente validée sur la période n'apparaît " +
      "pas dans la liste. Jamais de bar_id/user_id : porte toujours sur le bar déjà résolu " +
      "pour ce numéro WhatsApp.",
    input_schema: {
      type: 'object',
      properties: {
        nombre_jours: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description: "Fenêtre glissante en jours avant aujourd'hui (défaut 7 si omis). Ex: 30 si le promoteur demande explicitement le mois.",
        },
      },
    },
  },
  {
    name: 'obtenir_stats_promotions',
    description:
      "Récupère l'impact des promotions du bar de l'interlocuteur sur une période récente " +
      "(7 derniers jours par défaut, ajustable) : vue d'ensemble (chiffre d'affaires généré, " +
      "remises accordées, marge, ROI) puis détail par promotion active/passée sur la période. " +
      "Une promotion sans aucune application sur la période n'apparaît pas dans le détail. " +
      "Jamais de bar_id/user_id : porte toujours sur le bar déjà résolu pour ce numéro WhatsApp.",
    input_schema: {
      type: 'object',
      properties: {
        nombre_jours: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description: "Fenêtre glissante en jours avant aujourd'hui (défaut 7 si omis). Ex: 30 si le promoteur demande explicitement le mois.",
        },
      },
    },
  },
]

// Noms des tools analystes, dérivés de ANALYST_TOOLS lui-même - jamais une
// liste recopiée qui pourrait diverger en ajoutant un 6e tool.
const ANALYST_TOOL_NAMES = new Set(ANALYST_TOOLS.map((t) => t.name))

// Index = getUTCDay() (0 = dimanche). Table explicite plutôt que
// toLocaleDateString('fr-FR') : la locale française n'est pas garantie
// présente dans le runtime Deno Deploy, et un repli silencieux en anglais
// dans une donnée lue par Claude produirait une réponse en français
// mentionnant "Monday".
const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

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
// Journée commerciale (mode analyste - §10 étape 3)
// =====================================================

// Bénin (Africa/Porto-Novo) = UTC+1, pas de changement d'heure saisonnier -
// décalage fixe, jamais recalculé dynamiquement (src/config/constants.ts
// APP_TIMEZONE le documente comme fixe pour ce pays).
const BENIN_UTC_OFFSET_HOURS = 1

/**
 * Réplique de calculateBusinessDate/getCurrentBusinessDateString
 * (src/utils/businessDateHelpers.ts) - LOGIQUE CRITIQUE devant produire le
 * même jour que le trigger SQL qui calcule sales.business_date à la
 * création de chaque vente (067_add_business_date.sql). Un bar ferme
 * souvent après minuit : une vente à 2h appartient à la veille. Jamais de
 * repli codé en dur sur l'heure de clôture (ex: CURRENT_DATE - 6h) -
 * propre à chaque bar (bars.closing_hour), lue avant cet appel.
 *
 * ⚠️ DIVERGENCE ASSUMÉE avec la version client : celle-ci utilise `new
 * Date()` sans ajustement car elle tourne dans le navigateur du promoteur,
 * déjà à l'heure béninoise. Cette Edge Function tourne sur un serveur cloud
 * en UTC - sans ce décalage explicite, le calcul serait faux d'1h près de
 * minuit ou de l'heure de clôture, risquant de faire basculer une vente
 * dans le mauvais jour commercial.
 */
function getCurrentBusinessDateString(closingHour: number): string {
  const nowUtc = new Date()
  const nowBenin = new Date(nowUtc.getTime() + BENIN_UTC_OFFSET_HOURS * 60 * 60 * 1000)

  const businessDate = new Date(nowBenin)
  businessDate.setUTCHours(businessDate.getUTCHours() - closingHour)
  businessDate.setUTCHours(0, 0, 0, 0)

  const year = businessDate.getUTCFullYear()
  const month = String(businessDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(businessDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

// ⭐ HELPER EXTRAIT (23/08/2026, 4e tool de données réelles) : le seuil
// documenté au 2e tool ("si un 3e tool répète encore cette cérémonie,
// extraire un helper") a été franchi une 3e fois (obtenir_alertes_stock)
// puis une 4e (obtenir_performance_serveurs) sans être traité. Extraction
// faite maintenant, en une passe dédiée avant de certifier le 4e tool -
// pas mêlée à l'ajout de la fonctionnalité elle-même dans le même commit,
// conformément à la règle du projet sur les refactorings non demandés.
//
// Centralise l'obtention du client scopé à la session du promoteur résolu.
// Le bug déjà trouvé une fois sur ce mécanisme (signOut 'global' au lieu de
// 'local') n'existe plus qu'à un seul endroit désormais, pas dans chaque
// tool qui pourrait le recopier avec une variation.
//
// ⭐ MISE À JOUR (24/08/2026) : ce helper ne crée et ne révoque plus une
// session PAR APPEL - il consomme un scope mutualisé sur le message (voir
// AnalystSessionScope). La révocation a lieu une seule fois, en fin de
// message, dans runClaude.

// Durée du travail réel (requêtes Postgres) du dernier withAnalystSession,
// hors cérémonie de session Auth. Renseignée par withAnalystSession, lue
// immédiatement après par la journalisation d'audit.
//
// ⚠️ CORRECTIF (code review, 24/08/2026) : la première version journalisait
// la durée mesurée autour de tout executeTool, qui englobe la création ET la
// révocation de session (allers-retours Auth) en plus des requêtes Postgres.
// Le §7bis veut suivre le coût RPC réel - "un bar à fort volume ne coûte pas
// la même chose qu'un bar test à 3 lignes" - or un chiffre confondu rend un
// bar lent indiscernable d'une session Auth lente, ce qui prive la colonne de
// sa raison d'être. Les deux durées sont désormais journalisées séparément.
//
// Variable de module plutôt qu'un changement de signature : withAnalystSession
// est le SEUL endroit qui connaît la frontière entre cérémonie et travail
// réel, et faire remonter la mesure par la valeur de retour obligerait à
// modifier les 5 tools pour la transporter.
//
// Deux invariants distincts la rendent sûre - ne pas les confondre :
//  1. PAS D'ENTRELACEMENT. Les tools s'exécutent en série (boucle for/await
//     dans runClaude), donc jamais deux withAnalystSession concurrents. Entre
//     requêtes HTTP simultanées, chaque isolate Deno a sa propre mémoire -
//     une requête ne peut pas lire la valeur d'une autre.
//  2. PAS DE VALEUR PÉRIMÉE (l'invariant réellement fragile, celui qui a
//     produit un défaut en code review). Le reset au début de
//     withAnalystSession ne suffit PAS : un tool qui sort avant d'ouvrir une
//     session n'y entre jamais et laisserait donc la valeur du tool
//     précédent. C'est le site d'appel qui garantit cet invariant, en
//     consommant ET effaçant la valeur à chaque tool - voir le commentaire
//     là-bas. Toute future lecture de cette variable doit faire de même.
let lastAnalystWorkMs: number | null = null

/**
 * Session analyste mutualisée sur la durée d'UN message (⭐ 24/08/2026).
 *
 * Créée paresseusement au premier tool qui en a besoin, réutilisée par les
 * tools suivants du même message, révoquée une seule fois en fin de message
 * par closeAnalystSessionScope().
 *
 * POURQUOI : la première version créait ET révoquait une session par tool,
 * soit 4 allers-retours Auth (getUserById, generateLink, verifyOtp, signOut)
 * à chaque fois. Première mesure réelle en production (journal d'audit,
 * 24/08/2026) : 819 ms de cérémonie pour 557 ms de travail Postgres utile -
 * 60% du temps passé à ouvrir/fermer une session pour une identité qui ne
 * change pas pendant le message. Une question enchaînant 3 tools payait
 * 12 allers-retours Auth au lieu de 4.
 *
 * CE QUE ÇA CHANGE POUR LA SÉCURITÉ : la session vit le temps du message
 * (quelques secondes) au lieu du tool. Elle reste éphémère, révoquée
 * systématiquement (finally au niveau du message), jamais exposée hors de
 * l'Edge Function. La garantie qui compte est strictement inchangée : les
 * RPC sont toujours appelés SOUS LA SESSION DU PROMOTEUR RÉSOLU, leur guard
 * is_bar_member s'applique tel quel, aucun RPC partagé n'est modifié et on
 * ne retombe jamais sur service_role pour lire des données (§6).
 *
 * PORTÉE : un scope par appel de runClaude(), qui traite exactement un
 * message. Le userId est figé à la création - si un futur code devait
 * résoudre une autre identité dans le même message, il faudrait un nouveau
 * scope, jamais réutiliser celui-ci (garde explicite ci-dessous).
 */
interface AnalystSessionScope {
  userId: string
  session: AnalystSession | null
  client: SupabaseClient | null
  // Mémorise un échec de création pour ne pas le retenter à chaque tool du
  // même message : si generateLink échoue une fois, il échouera pareil 200 ms
  // plus tard, et réessayer ne ferait qu'ajouter de la latence à un message
  // déjà en échec.
  failed: boolean
}

function createAnalystSessionScope(userId: string): AnalystSessionScope {
  return { userId, session: null, client: null, failed: false }
}

/**
 * Révoque la session du scope si une a été créée. À appeler exactement une
 * fois, en fin de message, dans un finally - une session analyste ne doit
 * jamais survivre au message qui l'a nécessitée.
 */
async function closeAnalystSessionScope(db: SupabaseClient, scope: AnalystSessionScope): Promise<void> {
  if (!scope.session) return
  const token = scope.session.accessToken
  // Neutralisé AVANT la révocation : si closeAnalystSessionScope était appelé
  // deux fois (ou si un tool tentait de réutiliser le scope après fermeture),
  // on ne révoque pas deux fois le même token et on ne rend pas un client
  // pointant sur une session morte.
  scope.session = null
  scope.client = null
  scope.failed = true
  await revokeAnalystSession(db, token)
}

async function withAnalystSession(
  db: SupabaseClient,
  scope: AnalystSessionScope,
  userId: string,
  // fn retourne directement la forme finale attendue par executeTool -
  // le helper ne fait que fournir sessionClient et garantir la révocation,
  // il ne transforme jamais la réponse d'un tool.
  fn: (sessionClient: SupabaseClient) => Promise<{ ok: boolean; error?: string; data?: unknown }>,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  lastAnalystWorkMs = null

  // Garde de cohérence : le scope est lié à UNE identité résolue. Réutiliser
  // un scope créé pour un autre utilisateur ferait lire les données sous la
  // mauvaise session - exactement le type de fuite que tout ce mécanisme
  // existe pour empêcher. Échec fermé, jamais de repli silencieux.
  if (scope.userId !== userId) {
    console.error('[wa-webhook] withAnalystSession: scope userId incohérent - refus.')
    return { ok: false, error: "Impossible de consulter les données du bar (incohérence de session)." }
  }

  if (!scope.client && !scope.failed) {
    const session = await createAnalystSession(db, userId)
    if (session) {
      scope.session = session
      scope.client = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${session.accessToken}` } } },
      )
    } else {
      scope.failed = true
    }
  }

  if (!scope.client) {
    return { ok: false, error: "Impossible de générer une session pour consulter les données du bar." }
  }

  const workStartedAt = Date.now()
  try {
    return await fn(scope.client)
  } finally {
    // Mesurée même si fn() a échoué : une requête lente qui finit en erreur
    // est exactement le genre de signal qu'on veut voir dans le journal.
    // Note : pour le 2e tool et les suivants d'un même message, work_ms et
    // duration_ms sont désormais proches - la cérémonie n'est plus payée
    // qu'une fois, sur le premier tool.
    lastAnalystWorkMs = Date.now() - workStartedAt
  }
}

// ⭐ HELPER EXTRAIT (23/08/2026, même passe) : lecture + validation de
// closing_hour, recopiées 3 fois à l'identique (obtenir_stats_bar,
// obtenir_top_produits, et maintenant obtenir_performance_serveurs) -
// obtenir_alertes_stock n'en a délibérément pas besoin (le stock est un
// état actuel, pas une mesure datée). Centralise le repli documenté
// (aucune contrainte CHECK en base sur closing_hour) au même endroit que
// le calcul du jour courant, pour qu'une correction future des deux ne
// se fasse jamais qu'à un seul endroit.
async function resolveBusinessDate(sessionClient: SupabaseClient, barId: string): Promise<string> {
  const { data: barRow, error: barError } = await sessionClient
    .from('bars')
    .select('closing_hour')
    .eq('id', barId)
    .maybeSingle()
  if (barError) throw barError
  const rawClosingHour = barRow?.closing_hour
  const closingHour = (
    typeof rawClosingHour === 'number' && Number.isInteger(rawClosingHour) &&
    rawClosingHour >= 0 && rawClosingHour <= 23
  ) ? rawClosingHour : 6
  return getCurrentBusinessDateString(closingHour)
}

// ⭐ HELPERS EXTRAITS (24/08/2026, passe de factorisation dédiée) : le
// clamp nombre_jours était recopié 3 fois (obtenir_top_produits,
// obtenir_performance_serveurs, obtenir_stats_promotions), l'arithmétique
// de fenêtre glissante en 2 variantes non partagées. Extraction faite
// séparément du dernier correctif de bug (ce dernier mélangeait déjà un
// correctif critique avec cette dette, jugé plus sûr de ne pas cumuler
// les deux dans le même commit).
//
// Validation identique à ce qui existait déjà à chaque site d'appel :
// une valeur hors 1-90 est clampée (pas rejetée), seule une valeur non
// numérique/absente retombe sur le défaut - jamais de changement de
// comportement, uniquement une centralisation.
function clampNombreJours(raw: unknown, fallback = 7): number {
  return typeof raw === 'number' && Number.isInteger(raw)
    ? Math.min(Math.max(raw, 1), 90)
    : fallback
}

// Fenêtre glissante en DATE pure (YYYY-MM-DD, pas d'heure), ancrée sur
// resolveBusinessDate - utilisée par les tools dont la période a un sens
// par rapport à la journée commerciale du bar (ventes, articles vendus).
// ⚠️ NE PAS fusionner avec rollingCalendarDateTimeRange ci-dessous : les
// deux existent séparément à dessein, la distinction sémantique est
// réelle (voir son propre commentaire), pas seulement stylistique.
async function rollingBusinessDateRange(
  sessionClient: SupabaseClient,
  barId: string,
  nombreJours: number,
): Promise<{ startDateStr: string; endDate: string }> {
  const endDate = await resolveBusinessDate(sessionClient, barId)
  const startDate = new Date(`${endDate}T00:00:00Z`)
  startDate.setUTCDate(startDate.getUTCDate() - (nombreJours - 1))
  return { startDateStr: startDate.toISOString().slice(0, 10), endDate }
}

// Fenêtre glissante en TIMESTAMPTZ complet (avec heure de fin de journée),
// ancrée sur l'instant UTC courant - utilisée par les tools qui comparent
// à un TIMESTAMPTZ côté SQL (ex: applied_at) plutôt qu'à une DATE/
// business_date. CORRECTIF déjà appliqué une fois (24/08/2026, bug réel
// trouvé en code review) : sans l'heure de fin de journée explicite
// (23:59:59.999), une date nue cast à minuit côté SQL exclut silencieusement
// la journée en cours - même piège déjà connu ailleurs dans ce projet
// (src/utils/dateRangeCalculator.ts:137).
function rollingCalendarDateTimeRange(
  nombreJours: number,
): { startDateStr: string; endDateStr: string; du: string; au: string } {
  const endDate = new Date()
  endDate.setUTCHours(23, 59, 59, 999)
  const startDate = new Date(endDate.getTime() - (nombreJours - 1) * 24 * 60 * 60 * 1000)
  startDate.setUTCHours(0, 0, 0, 0)
  const startDateStr = startDate.toISOString()
  const endDateStr = endDate.toISOString()
  return { startDateStr, endDateStr, du: startDateStr.slice(0, 10), au: endDateStr.slice(0, 10) }
}

// =====================================================
// Journalisation d'audit du mode analyste (§7, §10 étape 5)
// =====================================================

// Bornes de taille : l'input vient du modèle Claude, l'erreur peut venir de
// Postgres (message potentiellement très long). Un journal ne doit jamais
// pouvoir être gonflé par une valeur aberrante - on tronque plutôt que de
// rejeter, pour ne jamais perdre la trace elle-même.
const AUDIT_INPUT_MAX_CHARS = 2000
const AUDIT_ERROR_MAX_CHARS = 500

/**
 * Journalise UN appel de tool du mode analyste (§7 : quel bar, quel tool,
 * quels paramètres, horodatage ; §7bis : durée d'exécution comme tableau de
 * bord du coût RPC réel).
 *
 * ⚠️ NON-BLOQUANT PAR CONSTRUCTION : un échec d'écriture du journal ne doit
 * JAMAIS empêcher le promoteur d'obtenir sa réponse. Le journal est un filet
 * de détection a posteriori, pas un maillon du chemin de réponse - le faire
 * bloquer transformerait un incident de journalisation en panne du service.
 * Toute erreur est donc avalée ici, après trace console (visible dans les
 * logs de la fonction, qui restent le filet de dernier recours).
 *
 * Seuls les tools ANALYSTES sont journalisés. Les tools commerciaux (Aïcha)
 * ne le sont pas : aucune donnée sensible en jeu, et les journaliser
 * mélangerait deux canaux que tout le reste du design maintient séparés.
 */
async function logAnalystToolCall(
  db: SupabaseClient,
  analystLink: AnalystLink,
  phone: string,
  toolName: string,
  input: Record<string, unknown>,
  result: { ok: boolean; error?: string },
  // Latence totale subie par le promoteur pour ce tool (cérémonie de session
  // Auth comprise).
  durationMs: number,
  // Travail Postgres seul, hors cérémonie - null si le tool n'a ouvert aucune
  // session ou si la création de session a échoué avant toute requête.
  workMs: number | null,
): Promise<void> {
  try {
    // JSON.stringify peut lever (référence circulaire) sur un input inattendu :
    // on ne laisse pas ça faire échouer la journalisation entière.
    let inputJson: unknown = null
    try {
      const serialized = JSON.stringify(input ?? {})
      if (serialized.length > AUDIT_INPUT_MAX_CHARS) {
        // ⚠️ CORRECTIF (code review, 24/08/2026) : la première version
        // stockait `serialized.slice(0, MAX)`, soit un JSON coupé au milieu -
        // du texte inexploitable par la requête d'audit à laquelle cette
        // colonne sert justement (détecter un paramètre inattendu, ex. un
        // bar_id qui n'aurait jamais dû s'y trouver). On conserve désormais
        // la LISTE DES CLÉS, qui reste interrogeable et suffit à repérer une
        // clé anormale, plus la taille pour savoir qu'on a écarté du contenu.
        inputJson = {
          _tronque: true,
          _taille_originale: serialized.length,
          _cles: Object.keys(input ?? {}).slice(0, 50),
        }
      } else {
        inputJson = input
      }
    } catch {
      // Input non sérialisable (référence circulaire) : on garde au moins la
      // trace de l'anomalie plutôt que de perdre la ligne entière.
      inputJson = { _non_serialisable: true }
    }

    const { error } = await db.from('wa_analyst_tool_audit').insert({
      bar_id: analystLink.bar_id,
      user_id: analystLink.user_id,
      phone_wa_id: phone,
      // Rôle revalidé en direct à CET appel par resolve_wa_bar_link, jamais
      // le role_snapshot figé de wa_bar_links.
      role: analystLink.role,
      tool_name: toolName,
      tool_input: inputJson,
      success: result.ok,
      error_message: result.ok ? null : (result.error ?? '').slice(0, AUDIT_ERROR_MAX_CHARS) || null,
      duration_ms: durationMs,
      work_ms: workMs,
    })
    if (error) {
      console.error('[wa-webhook] Journalisation audit analyste échouée (non-bloquant):', error.message)
    }
  } catch (e) {
    console.error('[wa-webhook] Journalisation audit analyste a levé une exception (non-bloquant):', e)
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
  // Session mutualisée sur le message (⭐ 24/08/2026) - null pour les tools
  // commerciaux, qui n'ouvrent jamais de session.
  sessionScope: AnalystSessionScope | null = null,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    // Garde unique pour TOUS les tools analystes (⭐ 24/08/2026, mutualisation
    // de session) : un tool de données ne peut rien faire sans un scope de
    // session. Posée ici plutôt que recopiée dans les 5 gardes individuelles -
    // un futur 6e tool est couvert d'office, sans qu'on ait à y penser. La
    // liste vient de ANALYST_TOOLS lui-même, jamais d'une liste parallèle qui
    // pourrait diverger.
    if (!sessionScope && ANALYST_TOOL_NAMES.has(name)) {
      console.error('[wa-webhook] executeTool: tool analyste appelé sans scope de session:', name)
      return { ok: false, error: 'Impossible de consulter les données du bar (session indisponible).' }
    }

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

      // CORRECTIF (test terrain reel, 23/08/2026) : get_bar_admin_stats
      // cumule TOUT l'historique du bar (aucun filtre de date) - un
      // promoteur demandant "aujourd'hui" recevait un total depuis
      // toujours (113 ventes / 166 300 F) alors que le Dashboard du jour
      // affichait 0 partout. Chiffre pas faux en soi, mais ne repondait
      // pas a la question posee - inacceptable pour la regle absolue du
      // prompt analyste ("jamais de chiffre qui induit en erreur").
      // Remplace par get_bar_daily_stats (20260823100000), filtre par
      // business_date.
      //
      // ⭐ EXTENSION AUX PERIODES PASSEES (24/08/2026, constate en usage
      // reel) : le correctif ci-dessus avait fige ce tool sur la SEULE
      // journee en cours, le rendant incapable de repondre a "quel CA
      // hier ?" ou "combien cette semaine ?". Le comportement etait correct
      // (Claude refuse d'inventer un chiffre) mais la capacite manquait.
      // Deux parametres facultatifs ajoutes, memes bornes et meme discipline
      // de clamp que les 3 autres tools qui en ont deja.
      const nombreJours = clampNombreJours(input.nombre_jours, 1)
      const rawDecalage = input.decalage_jours
      // Decalage borne a 365 jours : au-dela, la question releve de
      // l'analyse historique, pas d'une conversation WhatsApp.
      const decalageJours = typeof rawDecalage === 'number' && Number.isInteger(rawDecalage)
        ? Math.min(Math.max(rawDecalage, 0), 365)
        : 0

      return await withAnalystSession(db, sessionScope!, analystLink.user_id, async (sessionClient) => {
        // Jour commercial courant - toujours le point d'ancrage, jamais une
        // date fournie par le modele (§3 : le modele decrit une intention
        // relative, le code resout les dates absolues).
        const today = await resolveBusinessDate(sessionClient, analystLink.bar_id)

        // Fin de periode = aujourd'hui - decalage_jours. Debut = fin -
        // (nombre_jours - 1). Une periode d'un jour a donc debut = fin.
        const endDateObj = new Date(`${today}T00:00:00Z`)
        endDateObj.setUTCDate(endDateObj.getUTCDate() - decalageJours)
        const endDate = endDateObj.toISOString().slice(0, 10)

        const startDateObj = new Date(endDateObj)
        startDateObj.setUTCDate(startDateObj.getUTCDate() - (nombreJours - 1))
        const startDate = startDateObj.toISOString().slice(0, 10)

        // Journee en cours seule (le cas de loin le plus frequent) : on
        // garde get_bar_daily_stats, deja en prod et certifie. Sinon
        // get_bar_period_stats, dont le corps est repris a l'identique -
        // les memes questions donnent les memes chiffres.
        const estJourneeEnCours = nombreJours === 1 && decalageJours === 0
        const { data, error } = estJourneeEnCours
          ? await sessionClient.rpc('get_bar_daily_stats', {
            p_bar_id: analystLink.bar_id,
            p_business_date: today,
          })
          : await sessionClient.rpc('get_bar_period_stats', {
            p_bar_id: analystLink.bar_id,
            p_start_date: startDate,
            p_end_date: endDate,
          })
        if (error) throw error

        const row = data?.[0]
        if (!row) {
          return { ok: false, error: 'Le calcul des statistiques a retourné une réponse vide et inattendue.' }
        }

        // total_products = bar_products uniquement (boissons), n'inclut PAS
        // les plats du module restauration (limite documentée §10 de
        // l'étude, non corrigée sur ce RPC partagé avec l'app web - jamais
        // modifié pour ce nouveau cas d'usage, §6 interdiction ferme). Le
        // signaler explicitement dans la donnée retournée à Claude plutôt
        // que de laisser le modèle présenter ce chiffre comme exhaustif.
        //
        // CORRECTIF (code review multi-angle, 23/08/2026, confirmé par
        // plusieurs angles convergents) : total_products n'a AUCUN rapport
        // avec la période analysée (catalogue actuel, pas une mesure datée), mais
        // la 1ère version le plaçait au même niveau que journee_du et les 3
        // champs "_ce_jour" - une seule clé de prose (note_produits) portait
        // toute la charge de la distinction, fragile en cas de compression
        // de contexte sur une longue conversation. Restructuré en 2
        // sous-objets distincts : la structure elle-même porte la
        // distinction datée/non-datée, pas seulement la prose.
        // La periode effectivement calculee est TOUJOURS echoee, y compris
        // quand Claude n'a rien demande de particulier - il ne doit jamais
        // pouvoir presenter le chiffre d'une semaine comme celui d'une
        // journee, ni l'inverse. Les cles elles-memes portent la distinction
        // (periode_analysee, pas ventes_du_jour), pas seulement la prose :
        // meme raisonnement que la restructuration du 23/08 sur
        // catalogue_actuel, une cle de prose isolee est fragile en cas de
        // compression de contexte sur une longue conversation.
        return {
          ok: true,
          data: {
            // Repère temporel fourni dans les DONNÉES, jamais dans le system
            // prompt : celui-ci est mis en cache et doit rester identique
            // d'un appel à l'autre (§7bis, optimisation 1 - "tout ce qui
            // varie par conversation doit rester dans les messages"). Y
            // injecter la date casserait le cache à chaque changement de
            // jour. Sans ce repère, Claude ne peut pas traduire "lundi
            // dernier" ou "ce week-end" en decalage_jours - il devrait
            // deviner, ce que le prompt lui interdit.
            aujourdhui: {
              journee_commerciale: today,
              jour_semaine: JOURS_SEMAINE[new Date(`${today}T00:00:00Z`).getUTCDay()],
              note: "Repère pour convertir une question relative (hier, lundi dernier, ce week-end) en decalage_jours - rappeler ce tool avec les bons paramètres si la période demandée ne correspond pas à celle analysée ci-dessous.",
            },
            ventes_periode: {
              periode_analysee: estJourneeEnCours
                ? `journée en cours (${today})`
                : (nombreJours === 1
                  ? `journée du ${endDate}`
                  : `du ${startDate} au ${endDate} inclus (${nombreJours} jours)`),
              du: startDate,
              au: endDate,
              nombre_jours: nombreJours,
              total_ventes_validees: row.total_sales,
              chiffre_affaires: row.total_revenue,
              ventes_en_attente_validation: row.pending_sales,
              // pending_sales ne veut pas dire la même chose selon la période
              // (trouvé en code review, 24/08/2026) : sur la journée en cours
              // c'est une file d'attente vivante, que le gérant va traiter ;
              // sur une période passée c'est un reliquat jamais validé, donc
              // une anomalie à signaler, pas une tâche en cours. Sans cette
              // note, Claude dirait "vous avez 3 ventes à valider" pour des
              // ventes vieilles de trois semaines.
              note_ventes_en_attente: estJourneeEnCours
                ? "File d'attente du jour : ventes enregistrées par les serveurs, pas encore validées."
                : "Période passée : ces ventes n'ont JAMAIS été validées, ce n'est pas une file d'attente en cours mais un reliquat - le signaler comme une anomalie si le nombre est notable.",
            },
            catalogue_actuel: {
              note: "Etat actuel du catalogue, pas une mesure de la journee - ne jamais presenter ce chiffre comme datant d'aujourd'hui.",
              total_produits_boissons_actifs: row.total_products,
              note_produits: "Ne compte que les boissons, pas les plats si le bar fait aussi de la restauration.",
            },
          },
        }
      })
    }

    // ⭐ 2e TOOL DE DONNÉES RÉELLES (§10 étape 4, 23/08/2026) : mêmes
    // principes que obtenir_stats_bar - piste Session, aucun bar_id/user_id
    // exposé au modèle, get_top_products_aggregated (RPC partagé avec l'app
    // web) jamais modifié. Contrairement au 1er tool, celui-ci VALIDE les
    // paramètres fournis par Claude (nombre_jours/limite/trier_par) avant de
    // les transmettre - le modèle ne doit jamais transporter une valeur non
    // bornée vers un RPC, même quand cette valeur n'est pas un identifiant
    // d'autorisation (§3 vise bar_id/user_id en premier lieu, mais la même
    // prudence s'applique à toute entrée modèle qui devient un paramètre SQL).
    //
    if (name === 'obtenir_top_produits') {
      if (!analystLink) {
        return { ok: false, error: 'obtenir_top_produits appelé sans identité analyste résolue.' }
      }

      const nombreJours = clampNombreJours(input.nombre_jours)

      // CORRECTIF (code review multi-angle, 23/08/2026) : limite faisait un
      // rejet-vers-defaut (une valeur hors plage retombait sur le petit
      // defaut, 5) plutot qu'un clamp-vers-maximum - une demande legitime
      // "top 30" tombait silencieusement a 5 resultats au lieu du maximum
      // documente (20), sans aucun signal a Claude que la demande avait ete
      // reduite plutot que satisfaite au maximum permis. Desormais : une
      // valeur numerique hors plage est ramenee a la borne la plus proche
      // (clamp), seule une valeur non numerique/absente retombe sur le
      // defaut. Le clamp reel applique est toujours renvoye dans la reponse
      // (voir plus bas) pour que Claude ne presente jamais un resultat
      // partiel comme s'il satisfaisait la demande initiale. Meme garantie
      // pour nombre_jours, desormais portee par clampNombreJours (ci-dessus)
      // et echoee dans periode.nombre_jours.
      const rawLimit = input.limite
      const limite = typeof rawLimit === 'number' && Number.isInteger(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 20)
        : 5
      const rawSort = input.trier_par
      const trierPar = (rawSort === 'revenue' || rawSort === 'profit') ? rawSort : 'quantity'

      return await withAnalystSession(db, sessionScope!, analystLink.user_id, async (sessionClient) => {
        const { startDateStr, endDate } = await rollingBusinessDateRange(sessionClient, analystLink.bar_id, nombreJours)

        const { data, error } = await sessionClient.rpc('get_top_products_aggregated', {
          p_bar_id: analystLink.bar_id,
          p_start_date: startDateStr,
          p_end_date: endDate,
          p_limit: limite,
          p_sort_by: trierPar,
        })
        if (error) throw error

        // CORRECTIF (code review multi-angle, 23/08/2026) : trierPar et
        // limite (potentiellement clampes vers une borne) sont desormais
        // renvoyes tels quels a Claude, comme journee_du/periode l'etaient
        // deja pour obtenir_stats_bar - sans cet echo, un tri clampe ou
        // retombe sur son defaut restait invisible, risquant que le modele
        // presente un resultat "quantite" comme s'il repondait a une
        // demande "marge". nom garde un repli explicite : un product_name
        // NULL cote SQL (items JSONB malformes/legacy) ne doit jamais
        // remonter tel quel au modele.
        return {
          ok: true,
          data: {
            periode: { du: startDateStr, au: endDate, nombre_jours: nombreJours },
            trie_par: trierPar,
            limite_appliquee: limite,
            // LIMITE ASSUMEE (code review multi-angle, 23/08/2026) : une
            // boisson jamais reapprovisionnee avec un cout enregistre
            // (bar_products.current_average_cost = 0, deja observe en prod
            // sur le bar de test de la migration 20260805100000) affiche une
            // marge = CA (100%) - donnee manquante, pas une vraie
            // performance. Pas de champ dedie ici (contrairement a
            // note_produits sur obtenir_stats_bar) : la note generale sur
            // trie_par=profit couvre le cas sans complexifier chaque ligne.
            note_marge: trierPar === 'profit'
              ? "Une marge affichant exactement 100% signale souvent une boisson jamais reapprovisionnee avec un cout enregistre, pas une vraie performance - a signaler avec prudence."
              : undefined,
            produits: (data ?? []).map((p: Record<string, unknown>) => ({
              nom: p.product_name ?? 'Article sans nom',
              quantite_vendue: p.total_quantity,
              chiffre_affaires: p.total_revenue,
              marge: p.profit,
            })),
          },
        }
      })
    }

    // ⭐ 3e TOOL DE DONNÉES RÉELLES (§10 étape 4, 23/08/2026) : mêmes
    // principes que les 2 précédents. Plus léger : pas de fenêtre de temps
    // ni de closing_hour à résoudre (le stock est un état ACTUEL, pas une
    // mesure datée - aucune notion de "stock d'hier" n'a de sens ici,
    // contrairement au CA ou aux ventes).
    //
    // CORRECTIF (code review multi-angle, 23/08/2026, confirmé par
    // verification directe) : ce bloc N'APPELLE PAS get_bar_live_alerts
    // (RPC utilisé par BarStatsModal.tsx sur le Dashboard web) - il
    // interroge bar_products directement, avec un filtre is_active=true
    // ABSENT du RPC. Un commentaire precedent presentait a tort ce RPC
    // comme le mecanisme en jeu ("sa seule protection... deja active sous
    // cette session"), laissant croire a une reutilisation qui n'existe
    // pas. Impossible d'appeler get_bar_live_alerts ici de toute facon :
    // il ne retourne qu'un COUNT(*), jamais le detail nom/stock/seuil
    // dont ce tool a besoin - la reimplementation etait necessaire, pas
    // une duplication evitable.
    //
    // ⚠️ DIVERGENCE ASSUMEE ET DESORMAIS SIGNALEE : is_active=true exclut
    // les produits desactives, alors que get_bar_live_alerts (Dashboard)
    // ne filtre PAS dessus - un produit desactive mais jamais reapprovisionne
    // est compte sur le Dashboard, exclu ici. Choix produit deliberement
    // fait ("un produit desactive n'a pas sa place dans une alerte de
    // reapprovisionnement"), jamais propage au RPC partage (interdiction
    // ferme §6), et desormais explicite dans la reponse (note ci-dessous)
    // pour que Claude puisse l'expliquer si le promoteur compare aux deux
    // chiffres.
    //
    if (name === 'obtenir_alertes_stock') {
      if (!analystLink) {
        return { ok: false, error: 'obtenir_alertes_stock appelé sans identité analyste résolue.' }
      }

      return await withAnalystSession(db, sessionScope!, analystLink.user_id, async (sessionClient) => {
        // Comparaison stock <= alert_threshold NON supportée nativement par
        // PostgREST (comparaison colonne-à-colonne) - même limite déjà
        // documentée côté client (products.service.ts) : filtre en mémoire
        // après lecture, pas de solution serveur plus fine sans nouveau RPC.
        const { data, error } = await sessionClient
          .from('bar_products')
          .select('local_name, stock, alert_threshold, global_products(name)')
          .eq('bar_id', analystLink.bar_id)
          .eq('is_active', true)
          .not('alert_threshold', 'is', null)
          .gt('alert_threshold', 0)
        if (error) throw error

        // CORRECTIF (code review multi-angle, 23/08/2026) : aucune borne
        // n'existait, contrairement à obtenir_top_produits (limite 1-20).
        // Un bar en rupture generalisee ou avec un catalogue large pouvait
        // envoyer des dizaines/centaines de lignes dans le tour d'outil.
        // Plafond fixe (pas de parametre modele - la liste sert a montrer
        // des exemples concrets, pas un inventaire exhaustif) : les plus
        // critiques d'abord (stock le plus bas relativement a son seuil).
        const ALERTES_STOCK_MAX = 20
        const toutesLesAlertes = (data ?? [])
          .filter((p: Record<string, unknown>) => {
            const stock = typeof p.stock === 'number' ? p.stock : 0
            const seuil = typeof p.alert_threshold === 'number' ? p.alert_threshold : 0
            return stock <= seuil
          })

        const produitsEnAlerte = toutesLesAlertes
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
            const ratioA = (typeof a.stock === 'number' ? a.stock : 0) / (typeof a.alert_threshold === 'number' ? a.alert_threshold : 1)
            const ratioB = (typeof b.stock === 'number' ? b.stock : 0) / (typeof b.alert_threshold === 'number' ? b.alert_threshold : 1)
            return ratioA - ratioB
          })
          .slice(0, ALERTES_STOCK_MAX)
          .map((p: Record<string, unknown>) => {
            const globalProduct = p.global_products as { name?: string } | null
            return {
              nom: p.local_name || globalProduct?.name || 'Produit sans nom',
              stock_actuel: p.stock,
              seuil_alerte: p.alert_threshold,
            }
          })

        return {
          ok: true,
          data: {
            nombre_produits_en_alerte: toutesLesAlertes.length,
            produits_affiches: produitsEnAlerte.length,
            note: "Ne concerne que les boissons actives (un produit désactivé n'est jamais compté ici, contrairement au tableau de bord de l'application) - un bar avec module restauration peut aussi avoir des ingrédients bas, non couverts ici. Si plus de 20 produits sont en alerte, seuls les 20 plus critiques sont listés (nombre_produits_en_alerte donne le total réel).",
            produits: produitsEnAlerte,
          },
        }
      })
    }

    // ⭐ 4e TOOL DE DONNÉES RÉELLES (§10 étape 4, 23/08/2026) : classement
    // des serveurs par CA. Aucun RPC existant ne fait cette agrégation -
    // get_top_products_by_server (déjà en prod) classe des PRODUITS filtrés
    // par un serveur donné, pas des serveurs entre eux ; useTeamPerformance.ts
    // (seul calcul équivalent) tourne côté client sur des ventes déjà
    // chargées, inutilisable ici. Nouveau RPC dédié get_bar_server_performance
    // (20260823110000), jamais de modification d'un RPC partagé (§6).
    //
    // Restriction canViewAnalytics (mentionnée §5 de l'étude comme
    // condition d'accès à ce tool) déjà garantie PAR CONSTRUCTION : seuls
    // promoteur/gérant atteignent ce code (allowlist de resolve_wa_bar_link,
    // 20260822090001), et ces deux rôles ont canViewAnalytics=true tandis
    // que serveur l'a à false (src/types/index.ts) - aucun filtre de rôle
    // supplémentaire nécessaire ici, ni dans le RPC.
    if (name === 'obtenir_performance_serveurs') {
      if (!analystLink) {
        return { ok: false, error: 'obtenir_performance_serveurs appelé sans identité analyste résolue.' }
      }

      const nombreJours = clampNombreJours(input.nombre_jours)

      return await withAnalystSession(db, sessionScope!, analystLink.user_id, async (sessionClient) => {
        const { startDateStr, endDate } = await rollingBusinessDateRange(sessionClient, analystLink.bar_id, nombreJours)

        const { data, error } = await sessionClient.rpc('get_bar_server_performance', {
          p_bar_id: analystLink.bar_id,
          p_start_date: startDateStr,
          p_end_date: endDate,
        })
        if (error) throw error

        return {
          ok: true,
          data: {
            periode: { du: startDateStr, au: endDate, nombre_jours: nombreJours },
            serveurs: (data ?? []).map((s: Record<string, unknown>) => ({
              nom: s.server_name,
              role: s.role,
              nombre_ventes: s.total_sales,
              chiffre_affaires: s.total_revenue,
              articles_vendus: s.total_items,
            })),
          },
        }
      })
    }

    // ⭐ 5e TOOL DE DONNÉES RÉELLES (§10 étape 4, 23/08/2026) : impact des
    // promotions. Deux RPC déjà en prod (aucun nouveau RPC nécessaire,
    // contrairement aux tools 1/4) : get_bar_global_promotion_stats_with_profit
    // (résumé) et get_bar_promotion_stats_with_profit (détail par promo) -
    // tous deux acceptent déjà p_start_date/p_end_date en TEXT (pas DATE),
    // filtrant sur applied_at (TIMESTAMPTZ). Pas de resolveBusinessDate ici
    // : une simple fenêtre calendaire UTC suffit, applied_at n'a pas la
    // même sémantique que business_date (date d'application de la promo,
    // pas la journée commerciale de la vente).
    //
    // Les deux RPC ont déjà un GRANT service_role explicite (hérité de
    // 20260105, avant le durcissement du 23/06) - jamais utilisé ici :
    // appelés sous la session du promoteur résolu comme tous les autres
    // tools (§6 interdiction ferme), le grant service_role résiduel sur
    // ces deux RPC est une question indépendante de ce chantier.
    if (name === 'obtenir_stats_promotions') {
      if (!analystLink) {
        return { ok: false, error: 'obtenir_stats_promotions appelé sans identité analyste résolue.' }
      }

      const nombreJours = clampNombreJours(input.nombre_jours)

      return await withAnalystSession(db, sessionScope!, analystLink.user_id, async (sessionClient) => {
        const { startDateStr, endDateStr, du, au } = rollingCalendarDateTimeRange(nombreJours)
        const periodeAffichee = { du, au, nombre_jours: nombreJours }

        // Les deux RPC sont indépendants (aucune dépendance de données
        // entre eux) - appelés en parallèle plutôt qu'en série, contrairement
        // aux tools précédents où chaque appel dépendait du précédent
        // (closing_hour puis RPC).
        const [globalResult, detailResult] = await Promise.all([
          sessionClient.rpc('get_bar_global_promotion_stats_with_profit', {
            p_bar_id: analystLink.bar_id,
            p_start_date: startDateStr,
            p_end_date: endDateStr,
          }),
          sessionClient.rpc('get_bar_promotion_stats_with_profit', {
            p_bar_id: analystLink.bar_id,
            p_start_date: startDateStr,
            p_end_date: endDateStr,
          }),
        ])
        if (globalResult.error) throw globalResult.error
        if (detailResult.error) throw detailResult.error

        // CORRECTIF (code review multi-angle, 24/08/2026) : get_bar_global_...
        // est un pur agrégat (COUNT/SUM sans GROUP BY) sur promotion_applications
        // - retourne TOUJOURS exactement une ligne (COALESCE à zéro si aucune
        // application), jamais un tableau vide. L'ancien code traitait ce cas
        // comme un null normal (résumé absent = null silencieux), masquant
        // une vraie anomalie RPC si elle survenait un jour - même discipline
        // que obtenir_stats_bar sur un agrégat équivalent.
        const globalRow = globalResult.data?.[0]
        if (!globalRow) {
          return { ok: false, error: 'get_bar_global_promotion_stats_with_profit a retourné une réponse vide et inattendue.' }
        }

        // CORRECTIF (code review multi-angle, 24/08/2026) : total_applications
        // est un BIGINT Postgres - peut arriver sérialisé en string via
        // PostgREST (le service front l'attend déjà ainsi : promotions.service.ts
        // utilise z.coerce.number() sur ce même champ). L'ancien filtre
        // typeof === 'number' aurait silencieusement vidé toute la liste si
        // jamais reçu en string. Coercition explicite avant comparaison.
        //
        // Par ailleurs (confirmé par lecture directe du corps SQL) : le filtre
        // JS "ne garder que total_applications > 0" est un filet de sécurité
        // sans effet réel sur ce chemin d'appel précis - le WHERE du RPC
        // (pa.applied_at >= ... AND pa.applied_at <= ...) transforme déjà le
        // LEFT JOIN en JOIN de fait dès que les deux dates sont fournies
        // (NULL >= x est NULL, jamais TRUE), donc aucune promotion à 0
        // application ne peut atteindre ce code avec ce tool. Gardé quand
        // même par prudence si le RPC évolue un jour.
        const detailRowsAll = detailResult.data ?? []
        const detailRows = detailRowsAll.filter((p: Record<string, unknown>) => {
          const n = typeof p.total_applications === 'number' ? p.total_applications : Number(p.total_applications)
          return Number.isFinite(n) && n > 0
        })

        // CORRECTIF (code review multi-angle, 24/08/2026) : aucune borne sur
        // la liste, contrairement à obtenir_alertes_stock/obtenir_top_produits
        // - un bar avec beaucoup de promotions actives sur 90 jours pourrait
        // envoyer une liste non bornée dans le tour d'outil.
        const PROMOTIONS_MAX = 20
        const detailRowsAffiches = detailRows.slice(0, PROMOTIONS_MAX)

        return {
          ok: true,
          data: {
            periode: periodeAffichee,
            // CORRECTIF (code review multi-angle, 24/08/2026) : aucun des 3
            // tools datés précédents ne laissait la divergence de sémantique
            // de date implicite - seulement documentée en commentaire ici
            // avant ce correctif. applied_at (horodatage d'application de la
            // promo) n'est PAS ancré sur la journée commerciale du bar
            // (business_date/closing_hour), contrairement aux autres tools -
            // une promotion appliquée juste après minuit peut donc être
            // comptée dans un jour différent de celui des ventes/CA du même
            // moment vus par les autres tools.
            note: "Les dates ici suivent le fuseau calendaire standard (UTC), pas la journée commerciale du bar (contrairement aux autres statistiques) - un léger écart est possible autour de minuit.",
            resume: {
              nombre_applications: globalRow.total_applications,
              chiffre_affaires_genere: globalRow.total_revenue,
              total_remises_accordees: globalRow.total_discount,
              marge_pourcent: globalRow.margin_percentage,
              roi_pourcent: globalRow.roi_percentage,
            },
            nombre_promotions_avec_activite: detailRows.length,
            promotions_affichees: detailRowsAffiches.length,
            promotions: detailRowsAffiches.map((p: Record<string, unknown>) => ({
              nom: p.promotion_name || 'Promotion sans nom',
              nombre_applications: p.total_applications,
              chiffre_affaires_genere: p.total_revenue,
              remises_accordees: p.total_discount,
              marge_pourcent: p.margin_percentage,
              roi_pourcent: p.roi_percentage,
            })),
          },
        }
      })
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
    // CORRECTIF (code review multi-angle, 23/08/2026, convergence forte sur
    // les deux tools analystes) : String(e) pouvait contenir le texte brut
    // d'une erreur Postgres/PostgREST (noms de colonnes, fragments de
    // requête, codes internes) - ce texte partait tel quel dans le
    // tool_result envoyé a Claude, avec pour seule protection une
    // instruction de prompt ("dis-le simplement"), jamais une garantie
    // cote code. Le message d'erreur precis reste dans les logs serveur
    // (console.error ci-dessous) pour le debug - jamais dans la reponse
    // renvoyee au modele, qui ne doit voir qu'un message generique.
    console.error('[wa-webhook] Tool %s failed:', name, e)
    return { ok: false, error: 'Une erreur technique est survenue lors de la récupération de cette donnée.' }
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
  // ⭐ MUTUALISATION DE SESSION (24/08/2026) : un seul scope pour tout le
  // message. runClaude traite exactement un message, c'est donc la bonne
  // portée. La session est créée paresseusement par le premier tool qui en a
  // besoin (aucune session ouverte si le message ne déclenche aucun tool de
  // données - cas fréquent, §4ter : un promoteur lié pose aussi des questions
  // de support ordinaire) et révoquée ici, une seule fois, quoi qu'il arrive.
  const sessionScope = analystLink ? createAnalystSessionScope(analystLink.user_id) : null
  try {
    return await runClaudeInner(db, conv, history, analystLink, sessionScope)
  } finally {
    // finally : la session ne doit JAMAIS survivre au message, même si la
    // boucle Claude lève (réseau, API en erreur, réponse malformée).
    if (sessionScope) await closeAnalystSessionScope(db, sessionScope)
  }
}

async function runClaudeInner(
  db: SupabaseClient,
  conv: Conversation,
  history: StoredMessage[],
  analystLink: AnalystLink | null,
  sessionScope: AnalystSessionScope | null,
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
      const toolName = String(tu.name)
      const toolInput = (tu.input ?? {}) as Record<string, unknown>
      const startedAt = Date.now()
      const result = await executeTool(db, conv, toolName, toolInput, analystLink, sessionScope)

      // ⭐ JOURNALISATION D'AUDIT (§7, §10 étape 5) : uniquement le mode
      // analyste. Le test porte sur analystLink plutôt que sur une liste de
      // noms de tools : activeTools vaut ANALYST_TOOLS si et seulement si
      // analystLink est résolu (voir plus haut) - les deux jeux sont
      // mutuellement exclusifs, donc tout tool exécuté ici avec un
      // analystLink est analyste par construction. Aucune liste parallèle à
      // maintenir : un futur 6e tool analyste est journalisé d'office, sans
      // qu'on ait à s'en souvenir.
      //
      // await volontaire (et non fire-and-forget) : sur Deno Deploy, une
      // promesse non attendue peut être coupée à la fin de l'invocation -
      // un journal écrit une fois sur deux serait pire qu'informatif. Le
      // coût est un INSERT local, et logAnalystToolCall n'échoue jamais
      // (toute erreur y est avalée après trace console).
      if (analystLink) {
        // Renseignée par withAnalystSession pendant l'exécution ci-dessus.
        // CONSOMMÉE ET REMISE À null immédiatement : un tool qui sort avant
        // d'ouvrir une session (garde !analystLink, tool inconnu) ne passe
        // jamais par withAnalystSession, donc n'écrase pas la variable - sans
        // cet effacement il journaliserait le work_ms du tool PRÉCÉDENT
        // (défaut trouvé en code review, 24/08/2026), alors que la colonne
        // promet NULL dans ce cas. Lire un chiffre faux dans un journal
        // d'audit est pire que lire une absence de chiffre.
        //
        // Depuis la mutualisation de session (24/08/2026), l'écart
        // duration_ms - work_ms n'est plus le coût de cérémonie de CHAQUE
        // tool : il porte la création de session sur le PREMIER tool du
        // message seulement, et est proche de zéro sur les suivants. La
        // révocation, elle, n'est plus imputée à aucun tool (elle a lieu
        // après la boucle) - c'est voulu : elle ne retarde plus la réponse.
        const workMs = lastAnalystWorkMs
        lastAnalystWorkMs = null
        await logAnalystToolCall(
          db, analystLink, conv.phone, toolName, toolInput, result,
          Date.now() - startedAt, workMs,
        )
      }

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
