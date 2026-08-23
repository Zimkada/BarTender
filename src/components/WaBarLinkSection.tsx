import { useState, useEffect } from 'react';
import { MessageCircle, CheckCircle, Send } from 'lucide-react';
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
  const [phoneInput, setPhoneInput] = useState('');
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
        </Alert>
      )}

      <div className="bg-muted rounded-xl p-4 border border-border space-y-3">
        <Input
          label="Numéro WhatsApp du bar"
          type="tel"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
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
