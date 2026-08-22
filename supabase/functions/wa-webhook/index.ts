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
// - System prompt (~7k tokens) avec cache_control ephemeral → cache read ~0.1x.
// - max_tokens 300 (réponses WhatsApp courtes par design).
// - Médias non pris en charge → réponse standard SANS appel Claude (coût zéro).
// - Historique envoyé à Claude borné à HISTORY_LIMIT messages (la DB garde tout).
//
// Flux POST :
//   signature OK → dédup wamid → archive message user → si mode='bot' :
//   Claude (boucle tools ≤ MAX_TOOL_ROUNDS) → envoi réponse WhatsApp → persistance.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SYSTEM_PROMPT } from './prompt.ts'

// =====================================================
// Configuration
// =====================================================

const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5'
const MAX_TOKENS = 300
const HISTORY_LIMIT = 24 // messages envoyés à Claude (le JSONB en DB garde tout)
const MAX_TOOL_ROUNDS = 4
const WHATSAPP_API_VERSION = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v20.0'

const FALLBACK_TECH = 'Petit souci technique de notre côté 🙏 Pouvez-vous renvoyer votre message dans un instant ?'
const FALLBACK_ESCALADE = 'Je transmets votre demande à notre équipe, vous serez recontacté rapidement 👍'
const FALLBACK_MEDIA = 'Je ne peux pas encore écouter les notes vocales ni ouvrir les fichiers 🙏 Pouvez-vous écrire votre question en texte ?'

// Schémas des tools — garder alignés avec whatsapp-agent/README.md
const TOOLS = [
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
// Exécution des tools (écritures DB immédiates)
// =====================================================

async function executeTool(
  db: SupabaseClient,
  conv: Conversation,
  name: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
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
): Promise<{ text: string; escaladed: boolean }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

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
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          // Prefix stable → prompt caching (~0.1x sur ~7k tokens dès le 2e appel)
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        // Au dernier tour, on retire les tools : Claude DOIT produire du texte.
        ...(lastRound ? {} : { tools: TOOLS }),
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
      const result = await executeTool(db, conv, String(tu.name), (tu.input ?? {}) as Record<string, unknown>)
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
      const result = await runClaude(db, conv, history)
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
