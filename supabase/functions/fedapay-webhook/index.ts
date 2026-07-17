// fedapay-webhook — Réception des événements FedaPay (paiements d'abonnement).
//
// 🛡️ Sécurité — ZÉRO CONFIANCE AU CORPS DE LA REQUÊTE :
// - verify_jwt = false (FedaPay ne peut pas envoyer de JWT Supabase) : c'est la
//   VÉRIFICATION DE SIGNATURE HMAC qui fait office d'authentification. Rien n'est
//   parsé ni traité avant qu'elle passe.
// - La signature prouve que FedaPay a émis l'événement depuis NOTRE compte marchand,
//   PAS que notre serveur a créé la transaction. On ne fait donc JAMAIS confiance à
//   custom_metadata (montant, bar, mois) : un tiers pourrait créer une transaction
//   sur le même compte marchand avec des metadata forgées.
//   → On extrait UNIQUEMENT le transaction.id, puis :
//     (a) on RE-FETCHE la transaction via l'API FedaPay (clé secrète) pour lire
//         status/amount de façon AUTORITATIVE ;
//     (b) le RPC record_provider_subscription_payment croise cet id contre l'INTENT
//         enregistré au checkout (bar/plan/mois/montant figés serveur) et rejette
//         tout id inconnu + tout montant ne correspondant pas à l'attendu.
// - Idempotence : le RPC (service_role only) gère les retries via provider_transaction_id
//   (index unique partiel).
// - Seul ce webhook fait foi — jamais le redirect navigateur (callback_url).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Tolérance sur l'horodatage de la signature (anti-replay) */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

/** Modes de paiement FedaPay -> méthodes internes */
function mapMethod(mode: string | undefined): 'momo' | 'other' {
  if (!mode) return 'momo'
  return ['mtn', 'moov', 'mtn_open', 'mtn_ci', 'moov_tg', 'sbin'].includes(mode) ? 'momo' : 'other'
}

/** Comparaison à temps constant (anti timing attack) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Vérifie la signature FedaPay (schéma type Stripe) :
 * header `x-fedapay-signature` = "t=<timestamp>,s=<hex hmac>"
 * signature = HMAC-SHA256(`${t}.${rawBody}`, FEDAPAY_WEBHOOK_SECRET)
 */
async function verifySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  const parts = new Map(
    header.split(',').map((kv) => {
      const idx = kv.indexOf('=')
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()] as [string, string]
    })
  )
  const timestamp = parts.get('t')
  const signature = parts.get('s')
  if (!timestamp || !signature) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeEqual(expected, signature)
}

/**
 * Re-fetch AUTORITATIF de la transaction depuis l'API FedaPay (clé secrète).
 * Le corps du webhook n'est jamais digne de confiance pour le montant/statut :
 * seule la réponse de l'API FedaPay (interrogée avec notre clé secrète) fait foi.
 */
async function fetchTransaction(txnId: string): Promise<{ status: string; amount: number; mode?: string; reference?: string } | null> {
  const base = Deno.env.get('FEDAPAY_API_BASE') ?? 'https://sandbox-api.fedapay.com'
  const secret = Deno.env.get('FEDAPAY_SECRET_KEY') ?? ''
  const res = await fetch(`${base}/v1/transactions/${encodeURIComponent(txnId)}`, {
    headers: { 'Authorization': `Bearer ${secret}` },
  })
  if (!res.ok) {
    console.error('[fedapay-webhook] Authoritative fetch failed:', res.status)
    return null
  }
  const json = await res.json()
  const t = json['v1/transaction'] ?? json.transaction ?? json
  if (!t || typeof t.amount === 'undefined' || !t.status) return null
  return { status: String(t.status), amount: Number(t.amount), mode: t.mode, reference: t.reference }
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // 1. Body BRUT d'abord — indispensable pour la vérification HMAC
    const rawBody = await req.text()
    const signatureHeader = req.headers.get('x-fedapay-signature') ?? ''
    const webhookSecret = Deno.env.get('FEDAPAY_WEBHOOK_SECRET') ?? ''

    if (!webhookSecret) {
      console.error('[fedapay-webhook] FEDAPAY_WEBHOOK_SECRET is not configured')
      return new Response('Server misconfigured', { status: 500 })
    }

    const isValid = await verifySignature(rawBody, signatureHeader, webhookSecret)
    if (!isValid) {
      console.warn('[fedapay-webhook] Invalid or missing signature — rejected')
      return new Response('Invalid signature', { status: 401 })
    }

    // 2. Signature OK — on parse UNIQUEMENT pour connaître le type d'event et l'ID.
    // Aucune donnée métier (montant, bar, mois) n'est extraite du corps.
    const event = JSON.parse(rawBody)
    const eventName: string = event.name ?? event.event ?? ''

    if (eventName !== 'transaction.approved') {
      console.log('[fedapay-webhook] Ignored event:', eventName)
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    const entity = event.entity ?? event.data ?? {}
    const txnId = entity.id
    if (!txnId) {
      console.error('[fedapay-webhook] Missing transaction id in event')
      return new Response(JSON.stringify({ received: true, skipped: 'no transaction id' }), { status: 200 })
    }

    // 3. 🛡️ RE-FETCH AUTORITATIF : le montant/statut viennent de l'API FedaPay
    // (clé secrète), pas du corps du webhook.
    const txn = await fetchTransaction(String(txnId))
    if (!txn) {
      // Impossible de confirmer auprès de FedaPay → 500 pour retry (transitoire possible).
      return new Response('Cannot verify transaction', { status: 500 })
    }
    if (txn.status !== 'approved') {
      console.warn('[fedapay-webhook] Transaction %s not approved (status=%s)', txnId, txn.status)
      return new Response(JSON.stringify({ received: true, skipped: 'not approved' }), { status: 200 })
    }

    // 4. Enregistrer : le RPC croise l'ID contre l'INTENT (bar/plan/mois/montant
    // figés au checkout) et rejette tout ID inconnu ou montant divergent.
    // On ne passe QUE l'id + le montant autoritatif re-fetché.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    const { data: payment, error: rpcError } = await adminClient.rpc('record_provider_subscription_payment', {
      p_provider_transaction_id: String(txnId),
      p_paid_amount: txn.amount,
      p_method: mapMethod(txn.mode),
      p_notes: `FedaPay ${txn.reference ?? txnId}`,
    })

    if (rpcError) {
      // Distinguer un REJET métier (intent absent, montant divergent — déterministe,
      // inutile de retenter) d'une erreur transitoire (à retenter).
      const msg = rpcError.message || ''
      const isRejection = msg.includes('No checkout intent') || msg.includes('Amount mismatch')
      console.error('[fedapay-webhook] RPC %s: %s', isRejection ? 'rejected' : 'failed', msg)
      // 200 sur rejet : FedaPay ne doit pas boucler sur une transaction non légitime.
      // 500 sinon : retry (le RPC est idempotent, le rejeu est sûr).
      return new Response(
        isRejection ? JSON.stringify({ received: true, rejected: true }) : 'Recording failed',
        { status: isRejection ? 200 : 500 },
      )
    }

    console.log('[fedapay-webhook] Payment recorded: txn=%s amount=%d', txnId, txn.amount)

    return new Response(JSON.stringify({ received: true, payment_id: (payment as { id?: string })?.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[fedapay-webhook] Caught error:', error)
    return new Response('Internal error', { status: 500 })
  }
})
