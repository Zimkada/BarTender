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
 * national initial). Retire tout caractere non numerique. Si le numero ne
 * commence PAS deja par l'indicatif Benin (229), retire un eventuel "0"
 * initial (format national beninois) puis prefixe "229". Un numero qui
 * commence deja par "229" n'est jamais re-prefixe, meme s'il est trop
 * court (evite de le corrompre - voir le garde de longueur final).
 * Retourne null si le resultat final fait moins de 11 chiffres (numero
 * beninois complet minimum) - trouve en code review : sans cette garde,
 * une saisie du type "   " ou "abc" passe le test `!rawPhone` cote
 * appelant (une chaine non vide est toujours truthy) puis se normalisait
 * silencieusement en "229" seul, un numero de 3 chiffres invalide
 * transmis tel quel a la RPC puis a l'API Meta.
 *
 * Le bug de troncature du "01" beninois documente dans
 * GUIDE_MISE_EN_PLACE.md (Obstacle 2) affectait des formulaires de
 * configuration Meta et l'envoi de SMS - jamais la messagerie WhatsApp
 * elle-meme, qui gere deja le numero correctement de bout en bout. Cette
 * fonction ne contourne donc PAS ce bug (rien a contourner ici) - elle
 * normalise simplement une saisie utilisateur libre vers le format que
 * Meta enverra reellement dans wa_id pour ce numero.
 */
function normalizePhoneToMetaFormat(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')

  // "00229..." (prefixe international explicite) -> retirer les "00"
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  // CORRECTIF (2e passe de code review, 22/08/2026) : bug reel trouve,
  // confirme preexistant AVANT toute correction de cette meme session -
  // la version precedente testait `startsWith('229') && length >= 11`
  // pour decider "deja au format complet", mais un numero qui COMMENCE
  // par '229' sans etre complet (ex: '229552825', 9 chiffres - saisie
  // tronquee ou faute de frappe) echouait ce test (length < 11), tombait
  // dans la branche de normalisation, et se voyait RE-PREFIXER '229' par
  // dessus lui-meme -> '229229552825' (12 chiffres, un numero corrompu
  // qui passe malgre tout le garde final >= 11). Le test doit distinguer
  // "commence par 229" (fait, ne JAMAIS re-prefixer dans ce cas, complet
  // ou non) de "national avec 0 initial" (seul cas ou un prefixage est
  // legitime) - un numero qui commence par 229 mais est trop court doit
  // etre rejete tel quel par le garde de longueur final, jamais corrige
  // en lui collant un second indicatif.
  if (!digits.startsWith('229')) {
    // CORRECTIF (bug reel constate en test terrain, 23/08/2026, capture
    // d'ecran a l'appui) : le plan de numerotation beninois 2021 a
    // prefixe TOUS les numeros existants (fixe et mobile) par "01" -
    // l'ancien numero a 8 chiffres (ex: '97548310') est devenu un numero
    // national a 10 chiffres ('0197548310'). Le wa_id reel envoye par
    // Meta pour ce meme abonne reste '229' + les 8 chiffres d'origine
    // (confirme en base sur wa_conversations.phone, 5 echantillons reels
    // deja en prod, tous a 11 chiffres, aucun ne contient '01' apres
    // '229') - Meta n'a jamais adopte le prefixe '01' dans son propre
    // format, seul le plan national l'a fait. Retirer '0' seul (ancien
    // comportement) laissait le '1' du prefixe present dans le resultat,
    // produisant un numero corrompu a 12 chiffres au lieu de 11 (constate:
    // saisie '0197548310' -> '229197548310' au lieu de '22997548310').
    // Retirer '01' entier (2 caracteres) est donc la regle correcte pour
    // TOUT numero national beninois moderne, pas une exception.
    if (digits.startsWith('01')) {
      digits = digits.slice(2)
    } else if (digits.startsWith('0')) {
      // Ancien format national encore possible en saisie (numero deja
      // sans le prefixe 01, jamais mis a jour par son detenteur) - retirer
      // uniquement le "0" de mise en forme, comme avant ce correctif.
      digits = digits.slice(1)
    }
    digits = `229${digits}`
  }
  // LIMITE ASSUMEE (trouvee en code review, 22/08/2026, toujours valable
  // apres le correctif ci-dessus) : un numero deja prefixe '229' mais
  // contenant un '01' parasite juste apres (double saisie de l'indicatif
  // ET du prefixe national, ex. '+229 01 97548310') n'est PAS nettoye ici
  // - ce '01' pourrait aussi etre un debut legitime de numero local dans
  // un plan de numerotation different (numero etranger, si l'app venait a
  // s'ouvrir hors Benin). Decision assumee de ne PAS ecrire cette
  // heuristique tant que l'app cible uniquement le Benin. A revisiter
  // explicitement (avec une regle par indicatif, pas une heuristique de
  // longueur globale) le jour ou l'internationalisation est engagee.

  // Un numero beninois complet (229 + numero local) fait au moins 11
  // chiffres (229 + 8 chiffres locaux minimum). En dessous, la saisie
  // ne contenait pas assez de chiffres pour etre un numero plausible -
  // qu'elle commence deja par 229 (tronquee) ou non (trop courte apres
  // normalisation).
  if (digits.length < 11) {
    return null
  }

  return digits
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

    // Parsing JSON isole (trouve en code review) : un corps malforme ne
    // doit pas tomber dans le catch global (qui renverrait 500, une
    // erreur serveur) - c'est une erreur du client, donc 400.
    let body: { barId?: unknown; phoneWaId?: unknown }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    const { barId, phoneWaId: rawPhone } = body

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
    if (!phoneWaId) {
      return new Response(JSON.stringify({ error: 'Numero WhatsApp invalide' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

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

    // data?.[0] absent est inattendu : request_wa_bar_link() retourne
    // toujours exactement une ligne (chaque branche fait RETURN QUERY
    // SELECT avant RETURN, verifie ligne par ligne dans la migration).
    //
    // CORRECTIF (2e passe de code review, 22/08/2026) : la premiere
    // version se contentait de logger puis continuait vers
    // `status = ''`, qui tombe dans la branche generique plus bas et
    // renvoie HTTP 200 { success:false, message:"Une erreur est
    // survenue" } - indiscernable cote client d'un refus metier normal,
    // alors que c'est une anomalie serveur reelle. Incoherent avec le
    // traitement symetrique de `error` juste au-dessus (HTTP 500
    // explicite). Fix : court-circuiter vers la meme reponse 500 que le
    // cas d'erreur RPC, au lieu de laisser le flux continuer.
    if (!data || data.length === 0) {
      console.error('[request-wa-bar-link] Reponse RPC vide et inattendue pour request_wa_bar_link')
      return new Response(JSON.stringify({ error: 'Erreur serveur, veuillez reessayer.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }
    const status: string = data[0].status ?? ''

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
