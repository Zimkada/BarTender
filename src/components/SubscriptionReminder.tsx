/**
 * SubscriptionReminder — Rappel d'abonnement discret dans le header.
 *
 * Une pastille colorée (ambre = échéance proche / essai, rouge = retard) sur une
 * icône, avec un mini-popover au clic (détail + bouton Payer). Ne s'affiche que
 * pour promoteur/gérant quand une action de paiement est attendue
 * (due_soon / overdue / trial). Fermable pour la session ; réapparaît au
 * rechargement tant que l'abonnement n'est pas régularisé (le composant se remonte).
 *
 * Suit le pattern des badges autonomes du header (NetworkBadge, SyncStatusBadge) :
 * return null quand il n'y a rien à signaler.
 */

import { useState, useRef, useEffect } from 'react';
import { CreditCard, AlertTriangle, Clock, Gift, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useMySubscription } from '../hooks/useMySubscription';
import { formatSubscriptionDate } from '../utils/subscriptionHelpers';

export function SubscriptionReminder() {
  const navigate = useNavigate();
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();

  // Réservé au promoteur/gérant : on ne déclenche l'appel réseau que pour eux
  // (un super_admin dans l'AdminLayout ne doit pas fetcher get_my_subscription_status).
  const role = currentSession?.role;
  const canSeeReminder = role === 'promoteur' || role === 'gerant';
  const { subscription } = useMySubscription(canSeeReminder ? currentBar?.id : undefined);

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Fermer le popover au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!canSeeReminder || !subscription || dismissed) return null;

  // Seuls les statuts qui appellent une action déclenchent le rappel.
  const status = subscription.status;
  if (status !== 'overdue' && status !== 'due_soon' && status !== 'trial' && status !== 'never_paid') {
    return null;
  }

  // never_paid et overdue = urgent (rouge) ; due_soon/trial = à venir (ambre).
  const isUrgent = status === 'overdue' || status === 'never_paid';
  const dotColor = isUrgent ? 'bg-red-500' : 'bg-amber-400';
  const Icon = status === 'trial' ? Gift : isUrgent ? AlertTriangle : Clock;

  const title =
    status === 'overdue' ? 'Abonnement en retard'
    : status === 'never_paid' ? 'Abonnement à activer'
    : status === 'trial' ? 'Essai gratuit bientôt terminé'
    : 'Échéance proche';

  const detail =
    status === 'overdue' && subscription.monthsOverdue > 0
      ? `${subscription.monthsOverdue} mois de retard à régler.`
    : status === 'never_paid'
      ? 'Aucun paiement enregistré. Activez votre abonnement pour continuer.'
    : status === 'trial'
      ? `Votre essai se termine le ${formatSubscriptionDate(subscription.dueDate, 'long')}.`
    : `Échéance le ${formatSubscriptionDate(subscription.dueDate, 'long')}.`;

  const goToPayment = () => {
    setOpen(false);
    navigate('/settings');
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl text-white hover:bg-white/10 active:scale-90 transition-all"
        aria-label="Rappel d'abonnement"
        title={title}
      >
        <Icon size={20} />
        <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-white/70`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 z-50 rounded-lg border border-border bg-card shadow-xl p-3 text-foreground">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${dotColor} flex-shrink-0`} />
              <p className="text-sm font-semibold">{title}</p>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Masquer pour cette session"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{detail}</p>
          <button
            type="button"
            onClick={goToPayment}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-md bg-brand-primary text-white text-sm font-medium px-3 py-2 hover:opacity-90 transition-opacity"
          >
            <CreditCard size={16} /> Payer mon abonnement
          </button>
        </div>
      )}
    </div>
  );
}

SubscriptionReminder.displayName = 'SubscriptionReminder';
export default SubscriptionReminder;
