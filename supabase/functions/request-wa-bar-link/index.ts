import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =====================================================
// request-wa-bar-link : point d'entree pour qu'un promoteur/gerant
// authentifie declare son numero WhatsApp pour un bar et recoive un code
// de verification a 6 chiffres, envoye immediatement sur WhatsApp.
//
// Architecture (voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4, §9) :
// - Cette fonction appelle request_wa_bar_link() SOUS LA SESSION DU
//   PROMOTEUR APPELANT (le client Supabase est construit avec le header
//   Authorization recu, jamais avec la service_role key) - auth.uid()
//   est ainsi garanti par le token JWT lui-meme, jamais transmis en
//   parametre. La RPC verifie deja is_bar_member(bar_id) et l'allowlist
//   de role en interne (20260822090000_wa_bar_link_opt_in.sql).
// - Contrairement a create-bar-member (le modele explicitement cite pour
//   cette fonction), AUCUN client service_role/admin n'est cree ici : il
//   n'est pas necessaire (aucune operation ne requiert de contourner la
//   RLS), et l'omettre reduit la surface d'attaque de cette fonction -
//   un defaut trouve en certifiant create-bar-member (§9 de l'etude,
//   verification is_bar_member manquante) n'a d'ailleurs pu se produire
//   QUE parce que ce modele utilise un client admin pour presque tout,
//   masquant le besoin de verification explicite. Ici, faire porter la
//   verification par la RLS/RPC elle-meme (via le contexte auth reel)
//   est plus sur qu'un contournement puis une verification manuelle.
// - Le code de verification ne transite JAMAIS par les logs de cette
//   fonction (aucun console.log ne doit jamais contenir la valeur de
//   `code` extraite du statut RPC) - envoye uniquement dans le corps du
//   message WhatsApp sortant.
// =====================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
}

const WHATSAPP_API_VERSION = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v20.0'

// Statuts retournes par request_wa_bar_link() (20260822090000) - traduits
// en messages utilisateur ici plutot que cote frontend, pour que la
// logique metier des statuts reste centralisee cote serveur (le
// frontend n'a qu'a afficher `message` tel quel).
const STATUS_MESSAGES: Record<string, string> = {
  non_authentifie: "Session expiree, veuillez vous reconnecter.",
  non_membre_du_bar: "Vous n'etes pas membre actif de ce bar.",
  role_non_eligible: "Votre role ne permet pas de lier un numero WhatsApp a ce bar.",
  demande_en_attente_autre_bar: "Une demande de verification est deja en cours pour un autre bar avec ce numero. Terminez-la ou attendez son expiration (10 minutes) avant d'en demander une nouvelle.",
  deja_verifie: "Ce numero est deja verifie et lie a ce bar.",
  trop_tot: "Un code vient deja d'etre envoye. Veuillez patienter une minute avant d'en redemander un.",
}

/**
 * Normalise un numero WhatsApp saisi en formulaire vers le format transmis
 * par l'API Meta dans `wa_id` (ex: "22955282525" - sans "+", sans "0"
 * national initial). Retire tout caractere non numerique, puis retire un
 * "0" initial (format national beninois) si le numero resultant est plus
 * court que 11 chiffres, puis prefixe l'indicatif Bénin (229) si absent.
 *
 * Le bug de troncature du "01" beninois documente dans
 * GUIDE_MISE_EN_PLACE.md (Obstacle 2) affectait des formulaires de
 * configuration Meta et l'envoi de SMS - jamais la messagerie WhatsApp
 * elle-meme, qui gere deja le numero correctement de bout en bout. Cette
 * fonction ne contourne donc PAS ce bug (rien a contourner ici) - elle
 * normalise simplement une saisie utilisateur libre vers le format que
 * Meta enverra reellement dans wa_id pour ce numero.
 */
function normalizePhoneToMetaFormat(raw: string): string {
  let digits = raw.replace(/\D/g, '')

  // "00229..." (prefixe international explicite) -> retirer les "00"
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  // Deja au format complet avec indicatif (ex: 229 + 8 ou 9 chiffres)
  if (digits.startsWith('229') && digits.length >= 11) {
    return digits
  }

  // Format national beninois : "0" initial suivi du numero local
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  return `229${digits}`
}

async function sendWhatsAppCode(to: string, code: string): Promise<boolean> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? ''

  const text = `Votre code de verification BarTender Pro est : ${code}\n\nCe code expire dans 10 minutes. Ne le partagez avec personne.`

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
    // Ne jamais logger le corps de la reponse ici s'il pouvait contenir
    // le code (il ne le contient pas - c'est notre propre payload sortant,
    // pas la reponse Meta), mais on reste prudent : on ne logue que le
    // statut HTTP, jamais `text`.
    console.error('[request-wa-bar-link] Echec envoi WhatsApp, statut:', res.status)
    return false
  }
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { barId, phoneWaId: rawPhone } = await req.json()

    if (!barId || typeof barId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid barId' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    if (!rawPhone || typeof rawPhone !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid phoneWaId' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const phoneWaId = normalizePhoneToMetaFormat(rawPhone)

    // Client construit avec le token du promoteur appelant - PAS de client
    // service_role/admin dans cette fonction (voir commentaire d'en-tete).
    // request_wa_bar_link() s'appuie sur auth.uid() resolu depuis ce token.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data, error } = await callerClient.rpc('request_wa_bar_link', {
      p_bar_id: barId,
      p_phone_wa_id: phoneWaId,
    })

    if (error) {
      console.error('[request-wa-bar-link] Erreur RPC:', error.message)
      return new Response(JSON.stringify({ error: 'Erreur serveur, veuillez reessayer.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const status: string = data?.[0]?.status ?? ''

    // Seul le statut succes porte le code, sous la forme "code_genere:<code>".
    // Ce prefixe et ce format doivent rester synchronises avec
    // request_wa_bar_link() (20260822090000_wa_bar_link_opt_in.sql) - un
    // changement de convention cote SQL casse ce parsing silencieusement.
    if (status.startsWith('code_genere:')) {
      const code = status.slice('code_genere:'.length)

      const delivered = await sendWhatsAppCode(phoneWaId, code)
      // Jamais de console.log(code) ici, avant ou apres l'envoi - le code
      // ne doit transiter que dans le corps du message WhatsApp sortant.

      if (!delivered) {
        return new Response(JSON.stringify({
          success: false,
          message: "Le code a ete genere mais n'a pas pu etre envoye sur WhatsApp. Verifiez le numero et reessayez.",
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        })
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Un code de verification a ete envoye sur WhatsApp.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Tout autre statut est un refus propre (jamais une exception SQL
    // brute, garanti par le code review de request_wa_bar_link) - traduit
    // en message utilisateur.
    return new Response(JSON.stringify({
      success: false,
      message: STATUS_MESSAGES[status] ?? 'Une erreur est survenue, veuillez reessayer.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[request-wa-bar-link] Erreur inattendue:', error instanceof Error ? error.message : String(error))
    return new Response(JSON.stringify({ error: 'Erreur serveur inattendue.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
