// create-subscription-checkout — Crée une transaction FedaPay (checkout hébergé)
// pour le paiement d'abonnement d'un bar par son promoteur ou gérant.
//
// 🛡️ Sécurité :
// - verify_jwt = true (config.toml) : JWT Supabase obligatoire
// - Autorisation : membre actif promoteur/gérant du bar (via bar_members)
// - Le MONTANT est calculé CÔTÉ SERVEUR (get_plan_price × mois) — jamais reçu du client
// - expected_amount figé dans custom_metadata : le webhook vérifiera contre CETTE
//   valeur (pas le prix courant, qui peut changer entre checkout et paiement)
// - FEDAPAY_SECRET_KEY : secret Supabase, jamais exposé au client

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
}

const ALLOWED_MONTHS = [1, 3, 6, 12]

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authentifier l'appelant (pattern create-bar-member)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const { data: { user: caller }, error: userError } = await createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (userError || !caller) {
      return jsonResponse({ error: 'Invalid user token' }, 401)
    }

    // 2. Valider le body — le client n'envoie QUE barId + monthsCovered
    const { barId, monthsCovered } = await req.json()
    const months = Number(monthsCovered)
    if (!barId || !ALLOWED_MONTHS.includes(months)) {
      return jsonResponse({ error: 'barId et monthsCovered (1/3/6/12) sont requis' }, 400)
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Autorisation : promoteur/gérant actif de CE bar
    const { data: membership } = await adminClient
      .from('bar_members')
      .select('role')
      .eq('user_id', caller.id)
      .eq('bar_id', barId)
      .eq('is_active', true)
      .in('role', ['promoteur', 'gerant'])
      .limit(1)

    if (!membership || membership.length === 0) {
      return jsonResponse({ error: 'Permission denied: not a promoteur/gerant of this bar' }, 403)
    }

    // 4. Lire le bar + calculer le montant CÔTÉ SERVEUR
    const { data: bar, error: barError } = await adminClient
      .from('bars')
      .select('id, name, settings, billing_exempt, is_active')
      .eq('id', barId)
      .single()

    if (barError || !bar) {
      return jsonResponse({ error: 'Bar not found' }, 404)
    }
    if (bar.billing_exempt) {
      return jsonResponse({ error: 'Ce bar est exempté de facturation' }, 400)
    }

    const plan = (bar.settings as Record<string, unknown> | null)?.plan ?? 'starter'
    const { data: monthlyPrice, error: priceError } = await adminClient
      .rpc('get_plan_price', { p_plan: String(plan) })

    if (priceError || typeof monthlyPrice !== 'number' || monthlyPrice <= 0) {
      console.error('[create-subscription-checkout] get_plan_price failed:', priceError?.message)
      return jsonResponse({ error: 'Impossible de déterminer le prix du plan' }, 500)
    }

    const expectedAmount = Math.round(monthlyPrice * months) // XOF = unités entières

    // 5. Créer la transaction FedaPay (API REST — pas de SDK, incompatible Deno)
    const fedapayBase = Deno.env.get('FEDAPAY_API_BASE') ?? 'https://sandbox-api.fedapay.com'
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY') ?? ''
    const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? ''

    const txnResponse = await fetch(`${fedapayBase}/v1/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fedapaySecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `Abonnement BarTender ${plan} — ${months} mois — ${bar.name}`,
        amount: expectedAmount,
        currency: { iso: 'XOF' },
        callback_url: `${appBaseUrl}/settings?payment=pending`,
        // ⚠️ custom_metadata = DEBUG UNIQUEMENT (visible au dashboard FedaPay).
        // Le webhook ne le lit JAMAIS comme source de vérité : bar/plan/mois/montant
        // proviennent de l'intent stocké ci-dessous (record_subscription_intent).
        custom_metadata: {
          bar_id: barId,
          plan: String(plan),
          months_covered: months,
          expected_amount: expectedAmount,
        },
      }),
    })

    if (!txnResponse.ok) {
      const errBody = await txnResponse.text()
      console.error('[create-subscription-checkout] FedaPay transaction failed:', txnResponse.status, errBody)
      return jsonResponse({ error: 'Création de la transaction FedaPay échouée' }, 502)
    }

    const txnJson = await txnResponse.json()
    // L'API FedaPay enveloppe l'entité sous la clé 'v1/transaction'
    const transaction = txnJson['v1/transaction'] ?? txnJson.transaction ?? txnJson
    if (!transaction?.id) {
      console.error('[create-subscription-checkout] Unexpected FedaPay response shape:', JSON.stringify(txnJson))
      return jsonResponse({ error: 'Réponse FedaPay inattendue' }, 502)
    }

    // 5b. 🛡️ Enregistrer l'INTENT : c'est LA source de vérité du webhook (bar/plan/
    // mois/montant figés serveur). Sans intent, le webhook rejettera le paiement —
    // donc on échoue ici plutôt que de laisser un paiement se perdre. custom_metadata
    // reste posé (info/debug FedaPay) mais n'est JAMAIS relu comme source autoritative.
    const { error: intentError } = await adminClient.rpc('record_subscription_intent', {
      p_provider_transaction_id: String(transaction.id),
      p_bar_id: barId,
      p_plan: String(plan),
      p_months_covered: months,
      p_created_by: caller.id,
    })

    if (intentError) {
      console.error('[create-subscription-checkout] Failed to record payment intent:', intentError.message)
      return jsonResponse({ error: 'Impossible d\'initialiser le paiement' }, 500)
    }

    // 6. Générer le token/URL du checkout hébergé
    const tokenResponse = await fetch(`${fedapayBase}/v1/transactions/${transaction.id}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fedapaySecretKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text()
      console.error('[create-subscription-checkout] FedaPay token failed:', tokenResponse.status, errBody)
      return jsonResponse({ error: 'Génération du lien de paiement échouée' }, 502)
    }

    const tokenJson = await tokenResponse.json()
    const checkoutUrl = tokenJson.url
    if (!checkoutUrl) {
      console.error('[create-subscription-checkout] No checkout URL in token response:', JSON.stringify(tokenJson))
      return jsonResponse({ error: 'Lien de paiement absent de la réponse FedaPay' }, 502)
    }

    console.log('[create-subscription-checkout] Checkout created: bar=%s, months=%d, amount=%d, txn=%s',
      barId, months, expectedAmount, transaction.id)

    return jsonResponse({ checkout_url: checkoutUrl, transaction_id: transaction.id }, 200)
  } catch (error) {
    console.error('[create-subscription-checkout] Caught error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return jsonResponse({ error: errorMessage }, 400)
  }
})
