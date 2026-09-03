import { useState, useEffect } from 'react';
import { MessageCircle, CheckCircle, Send, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Alert } from './ui/Alert';
import { requestWaBarLink, getWaBarLinkStatus, type WaBarLinkStatus } from '../services/supabase/waBarLink.service';
import { getErrorMessage } from '../utils/errorHandler';
import { useNotifications } from './Notifications';

interface Props {
  barId: string;
}

/**
 * Numéro WhatsApp du bot, au format international sans "+" ni "0" initial
 * (celui qu'attend un lien wa.me).
 *
 * ⚠️ POURQUOI CETTE CONSTANTE EXISTE (25/08/2026) : WhatsApp (Meta) interdit
 * à une entreprise d'envoyer un message libre à un numéro qui ne lui a pas
 * écrit dans les 24h — c'est la "fenêtre de service". Un promoteur qui
 * demande un code de vérification sans avoir jamais écrit à Aïcha ne reçoit
 * RIEN : l'envoi réussit côté API Meta, aucune erreur ne remonte, le message
 * n'arrive simplement jamais. Cas réellement vécu au premier test terrain
 * (23/08/2026), sans aucune indication à l'écran pour le comprendre.
 *
 * Écrit en dur plutôt qu'en variable d'environnement : le numéro du bot est
 * une donnée publique et stable (il figure dans les CGU et la communication
 * commerciale), pas un secret. S'il change, il faut modifier cette ligne et
 * redéployer.
 */
const BOT_WHATSAPP_NUMBER = '2290129882121';

/**
 * Clé de brouillon du numéro saisi, PAR BAR.
 *
 * Le lien "Ouvrir la conversation WhatsApp" quitte l'application - sur
 * mobile il bascule vers WhatsApp, et le système peut décharger l'onglet
 * BarTender si la mémoire manque. La session Supabase, elle, survit
 * (localStorage), mais la saisie en cours serait perdue : l'utilisateur
 * reviendrait sur un champ vide, exactement la friction que l'encart
 * cherche à éviter.
 *
 * Par bar et jamais global : un brouillon partagé afficherait, après un
 * changement de bar, le numéro saisi pour un AUTRE établissement - avec le
 * risque de le lier au mauvais bar sans s'en apercevoir.
 */
const draftStorageKey = (barId: string) => `wa_bar_link_draft_${barId}`;

/**
 * Section "WhatsApp analyste" de l'onglet Fonctionnement (SettingsPage).
 * Dernière pièce du flux d'opt-in (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4/§9) :
 * le promoteur/gérant saisit son numéro, reçoit un code à 6 chiffres sur
 * WhatsApp, et répond directement sur WhatsApp avec ce code (la vérification
 * elle-même se fait côté webhook, jamais depuis cette UI — voir §4ter,
 * le lien n'est qu'une autorisation de tools, pas un aiguillage de mode).
 *
 * Visible en onglet Fonctionnement (pas Sécurité/Infos Bar, réservés au
 * promoteur seul) : request_wa_bar_link autorise promoteur ET gérant à
 * parts égales, donc cette section suit la même visibilité que le tab qui
 * l'héberge, sans créer de nouvelle exception RBAC.
 */
export function WaBarLinkSection({ barId }: Props) {
  const { showNotification } = useNotifications();
  const [status, setStatus] = useState<WaBarLinkStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  // Incrémenté après une demande de code réussie pour forcer un refetch du
  // statut (voir handleRequestCode) - alternative légère à une vraie
  // dépendance de données ici, une seule section de statut à rafraîchir.
  const [refreshKey, setRefreshKey] = useState(0);
  const [phoneInput, setPhoneInput] = useState(() => {
    try {
      return localStorage.getItem(draftStorageKey(barId)) ?? '';
    } catch {
      return ''; // localStorage indisponible : simple perte de confort
    }
  });
  const [sending, setSending] = useState(false);
  const [lastMessage, setLastMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // ⚠️ Garde isMounted (même pattern que loadBarMembers dans SettingsPage.tsx) :
  // sans elle, un changement rapide de bar (BarSelector) pourrait laisser une
  // réponse tardive du bar précédent écraser le statut du bar déjà affiché.
  useEffect(() => {
    let isMounted = true;

    const loadStatus = async () => {
      setLoadingStatus(true);
      try {
        const result = await getWaBarLinkStatus(barId);
        if (isMounted) setStatus(result);
      } catch (error) {
        // Non-bloquant : l'absence de statut affichable ne doit jamais empêcher
        // de tenter une nouvelle demande (le formulaire reste utilisable).
        console.error('[WaBarLinkSection] Erreur chargement statut:', getErrorMessage(error));
      } finally {
        if (isMounted) setLoadingStatus(false);
      }
    };

    loadStatus();
    return () => { isMounted = false; };
  }, [barId, refreshKey]);

  // Recharge le brouillon au CHANGEMENT de bar : l'initialiseur d'état
  // ci-dessus ne s'exécute qu'au premier rendu, or ce composant reste monté
  // quand l'utilisateur bascule de bar via le BarSelector. Sans cet effet,
  // le champ conserverait la saisie du bar précédent.
  useEffect(() => {
    try {
      setPhoneInput(localStorage.getItem(draftStorageKey(barId)) ?? '');
    } catch {
      setPhoneInput('');
    }
  }, [barId]);

  // Saisie persistée à chaque frappe : le lien WhatsApp peut faire perdre
  // l'onglet à tout moment, il n'y a pas de "bon moment" pour sauvegarder.
  const handlePhoneChange = (value: string) => {
    setPhoneInput(value);
    try {
      if (value.trim()) {
        localStorage.setItem(draftStorageKey(barId), value);
      } else {
        // Champ vidé volontairement : ne pas ressusciter l'ancienne valeur
        // au prochain chargement.
        localStorage.removeItem(draftStorageKey(barId));
      }
    } catch {
      /* non bloquant */
    }
  };

  const handleRequestCode = async () => {
    if (!phoneInput.trim()) {
      setLastMessage({ kind: 'error', text: 'Veuillez saisir un numéro WhatsApp.' });
      return;
    }
    setSending(true);
    setLastMessage(null);
    try {
      const result = await requestWaBarLink(barId, phoneInput.trim());
      if (result.success) {
        // CORRECTIF (code review multi-angle, 23/08/2026) : sans ce refetch,
        // l'Alert persistante "un code a été envoyé" (basée sur `status`)
        // n'apparaissait jamais après un premier succès - seul le toast
        // transitoire montrait le message, disparu quelques secondes après.
        setRefreshKey((k) => k + 1);
        // Brouillon effacé : le numéro est désormais porté par le statut
        // serveur (Alert ci-dessus), le conserver en local ferait doublon et
        // risquerait d'afficher une valeur périmée après un changement.
        try {
          localStorage.removeItem(draftStorageKey(barId));
        } catch {
          /* non bloquant */
        }
        // Pas de toast ici : l'Alert inline ci-dessous porte déjà ce message
        // et reste visible, contrairement au toast qui disparaît seul.
      } else {
        showNotification('error', result.message);
      }
      setLastMessage({ kind: result.success ? 'success' : 'error', text: result.message });
    } catch (error) {
      const message = getErrorMessage(error);
      setLastMessage({ kind: 'error', text: message });
      showNotification('error', message);
    } finally {
      setSending(false);
    }
  };

  const isVerifiedAndActive = status?.verified === true && status.isActiveLink;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-2">
        <div className="w-10 h-10 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center flex-shrink-0">
          <MessageCircle size={20} />
        </div>
        <div>
          <h3 className="text-h3 text-foreground">WhatsApp analyste</h3>
          <p className="text-body-sm text-muted-foreground">
            Liez votre numéro pour interroger votre bar directement sur WhatsApp.
          </p>
        </div>
      </div>

      {!loadingStatus && isVerifiedAndActive && (
        <Alert variant="success" className="border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/30">
          <div className="flex items-center gap-2 text-green-800 dark:text-green-400 font-semibold">
            <CheckCircle size={20} />
            <span>Numéro vérifié et actif</span>
          </div>
          <p className="text-body-sm text-green-700 dark:text-green-300 mt-1">
            Ce bar est lié au numéro WhatsApp {status?.phoneWaId}.
          </p>
        </Alert>
      )}

      {!loadingStatus && status && !isVerifiedAndActive && (
        <Alert variant="default">
          <p className="text-body-sm">
            Un code de vérification a été envoyé au {status.phoneWaId}. Répondez avec ce code
            directement sur WhatsApp pour terminer la liaison (code valable 10 minutes, 5 tentatives max).
            Redemander un code avant d'avoir répondu invalidera le précédent.
          </p>
          {/*
            Rappel du préalable là où l'utilisateur revient quand rien
            n'arrive : c'est cette Alert qu'il relit, pas l'encart au-dessus
            du formulaire qu'il a peut-être parcouru trop vite.
          */}
          <p className="text-body-sm text-muted-foreground mt-2">
            Rien reçu ? Écrivez d'abord un message à l'assistante sur WhatsApp, puis redemandez
            un code : WhatsApp bloque l'envoi vers un numéro qui ne lui a jamais écrit.
          </p>
        </Alert>
      )}

      {/*
        ⚠️ Fenêtre de service WhatsApp de 24h (Meta) : un message libre ne
        peut pas être envoyé à un numéro qui n'a pas écrit à l'entreprise
        récemment. Sans ce préalable, la demande de code semble réussir mais
        le message n'arrive jamais - aucune erreur ne remonte, ni côté API ni
        à l'écran. Affiché AVANT le formulaire, jamais après : une fois le
        code demandé en vain, l'utilisateur a déjà consommé sa demande et
        attend un message qui ne viendra pas.

        Masqué quand le numéro est déjà vérifié et actif : la conversation
        existe forcément dans ce cas, l'avertissement n'aurait plus d'objet.
      */}
      {!loadingStatus && !isVerifiedAndActive && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-amber-900 dark:text-amber-300">
                À faire avant de demander le code
              </p>
              <p className="text-body-sm text-amber-800 dark:text-amber-400">
                Si vous n'avez jamais écrit à l'assistante BarTender sur WhatsApp, envoyez-lui
                d'abord un message (un simple « bonjour » suffit). Sans cela, WhatsApp bloque
                l'envoi du code et vous ne recevrez rien.
              </p>
              <a
                href={`https://wa.me/${BOT_WHATSAPP_NUMBER}?text=${encodeURIComponent('Bonjour')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-body-sm font-semibold text-amber-900 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
              >
                <MessageCircle size={16} />
                Ouvrir la conversation WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="bg-muted rounded-xl p-4 border border-border space-y-3">
        <Input
          label="Numéro WhatsApp du bar"
          type="tel"
          value={phoneInput}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder="Ex: 0197000000"
          leftIcon={<Send size={18} />}
          disabled={sending}
        />
        <Button onClick={handleRequestCode} disabled={sending} className="w-full sm:w-auto">
          {sending ? 'Envoi en cours...' : isVerifiedAndActive ? 'Changer de numéro' : 'Recevoir le code de vérification'}
        </Button>

        {lastMessage && (
          <Alert variant={lastMessage.kind === 'success' ? 'success' : 'destructive'}>
            {lastMessage.text}
          </Alert>
        )}
      </div>
    </div>
  );
}

export default WaBarLinkSection;
