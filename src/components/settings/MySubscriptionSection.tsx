import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, CheckCircle, Gift, ShieldCheck, AlertTriangle, Loader2, Smartphone, Copy, Check, Zap, Clock } from 'lucide-react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { useBeninCurrency } from '../../hooks/useBeninCurrency';
import { useMySubscription } from '../../hooks/useMySubscription';
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_MONTHS_OPTIONS,
  formatSubscriptionDate,
} from '../../utils/subscriptionHelpers';
import { FEATURES } from '../../config/features';
import { MOMO_PAYMENT_NUMBERS, buildPaymentReference } from '../../config/paymentInfo';

interface Props {
  barId: string;
  barName: string;
}

/** Délai avant de considérer que la redirection FedaPay a échoué (navigation non ouverte). */
const REDIRECT_GUARD_MS = 8000;

const formatDate = (date: string | undefined) => formatSubscriptionDate(date, 'long');

/**
 * Section "Mon abonnement" (promoteur/gérant) — statut + deux canaux de paiement :
 *  1. FedaPay (checkout hébergé) — affiché seulement si FEATURES.FEDAPAY_CHECKOUT_ENABLED.
 *     Le paiement n'est confirmé que par le webhook serveur : au retour du checkout
 *     (?payment=pending) on affiche "validation en cours" et on poll jusqu'à ce que
 *     l'échéance avance.
 *  2. MoMo direct — numéros de réception + motif normalisé à recopier (canal de
 *     démarrage). Le paiement est ensuite constaté et enregistré manuellement par
 *     le super_admin dans le dashboard admin.
 */
export const MySubscriptionSection: React.FC<Props> = ({ barId, barName }) => {
  const { formatPrice } = useBeninCurrency();
  const {
    subscription, isLoading, error,
    startCheckout, startPollingForConfirmation, isConfirming,
  } = useMySubscription(barId);

  const [months, setMonths] = useState('1');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const redirectGuardRef = useRef<number | null>(null);

  // Retour du checkout FedaPay : lancer le polling de confirmation (une seule fois).
  // Le nettoyage de ?payment=pending empêche tout re-déclenchement au re-render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'pending') {
      startPollingForConfirmation();
      params.delete('payment');
      const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nettoyage du garde-fou de redirection au démontage
  useEffect(() => () => {
    if (redirectGuardRef.current !== null) window.clearTimeout(redirectGuardRef.current);
  }, []);

  const handlePay = async () => {
    setCheckoutError(null);
    setIsRedirecting(true);
    try {
      await startCheckout(Number(months));
      // startCheckout fait window.location.href = url : en cas de succès, la page
      // navigue et ce composant est démonté. Mais si la navigation est silencieusement
      // empêchée (WebView restrictif, URL invalide) sans lever d'exception, on ne doit
      // pas laisser le bouton bloqué en « Redirection… » indéfiniment : garde-fou qui
      // réactive le bouton si le composant est toujours monté après quelques secondes.
      redirectGuardRef.current = window.setTimeout(() => {
        setIsRedirecting(false);
        setCheckoutError('La redirection vers le paiement n\'a pas pu s\'ouvrir. Réessayez.');
      }, REDIRECT_GUARD_MS);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Erreur lors du lancement du paiement');
      setIsRedirecting(false);
    }
  };

  const amount = subscription ? subscription.monthlyPrice * Number(months) : 0;

  // Motif normalisé à copier dans la transaction MoMo directe (identifie le bar).
  // Le plan/mois ne sont pas dans le motif : le montant payé suffit à les déduire.
  const paymentReference = subscription
    ? buildPaymentReference({ barName })
    : '';

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(paymentReference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponible (contexte non sécurisé) — l'utilisateur peut recopier à la main
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center flex-shrink-0">
          <CreditCard size={20} />
        </div>
        <div>
          <h3 className="text-h3 text-foreground">Mon abonnement</h3>
          <p className="text-body-sm text-muted-foreground">Statut et paiement par Mobile Money.</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Chargement…</p>
      ) : error ? (
        <Alert variant="destructive" title="Impossible de charger l'abonnement">{error}</Alert>
      ) : subscription ? (
        <>
          {/* Bandeau de confirmation (retour de paiement) */}
          {isConfirming && (
            <Alert variant="info" title="Paiement en cours de validation">
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Nous confirmons votre paiement Mobile Money. Cela peut prendre jusqu'à une minute…
              </span>
            </Alert>
          )}

          {/* Statut courant */}
          <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
            <p>
              <span className="font-semibold">Plan :</span>{' '}
              {subscription.plan} - {formatPrice(subscription.monthlyPrice)}/mois
            </p>
            <p>
              <span className="font-semibold">Statut :</span>{' '}
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </p>
          </div>

          {/* Cas exempté : pas de paiement */}
          {subscription.status === 'exempt' ? (
            <Alert variant="success" title="Facturation offerte">
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} />
                Votre établissement est exempté d'abonnement. Aucun paiement requis.
              </span>
            </Alert>
          ) : (
            <>
              {subscription.status === 'trial' && (
                <Alert variant="info" title="Essai gratuit">
                  <span className="flex items-center gap-2">
                    <Gift size={16} />
                    Votre essai gratuit se termine le {formatDate(subscription.dueDate)}.
                    Payez dès maintenant pour continuer sans interruption.
                  </span>
                </Alert>
              )}
              {subscription.status === 'overdue' && (
                <Alert variant="warning" title="Abonnement en retard">
                  <span className="flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Votre échéance était le {formatDate(subscription.dueDate)}. Régularisez pour éviter une suspension.
                  </span>
                </Alert>
              )}
              {subscription.status === 'up_to_date' && (
                <p className="text-sm text-foreground/70 flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600" />
                  Prochaine échéance : {formatDate(subscription.dueDate)}
                </p>
              )}

              {/* Durée + montant — commun aux deux moyens de paiement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end pt-2">
                <Select
                  label="Durée à payer"
                  options={[...SUBSCRIPTION_MONTHS_OPTIONS]}
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <span className="text-muted-foreground">Montant à payer : </span>
                  <span className="font-semibold text-foreground">{formatPrice(amount)}</span>
                </div>
              </div>

              {/* Intitulé : on présente les moyens comme un choix explicite */}
              <p className="text-sm font-medium text-foreground pt-1">
                {FEATURES.FEDAPAY_CHECKOUT_ENABLED
                  ? 'Choisissez votre moyen de paiement :'
                  : 'Comment payer votre abonnement :'}
              </p>

              {/* Moyen 1 — Paiement en ligne (FedaPay), affiché seulement si actif */}
              {FEATURES.FEDAPAY_CHECKOUT_ENABLED && (
                <div className="rounded-xl border bg-brand-subtle border-brand-primary shadow-sm p-4 space-y-3 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-foreground">
                      <CreditCard size={18} className="text-brand-primary" />
                      <h4 className="font-semibold text-sm">Payer en ligne</h4>
                    </div>
                    <Badge variant="success" size="sm">
                      <Zap size={12} className="mr-1" /> Activation immédiate
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vous êtes redirigé vers une page sécurisée pour payer par Mobile Money.
                    Votre abonnement est activé automatiquement dès le paiement confirmé.
                  </p>
                  <Button
                    onClick={handlePay}
                    disabled={isRedirecting || isConfirming || amount <= 0}
                    className="w-full sm:w-auto"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {isRedirecting ? 'Redirection…' : `Payer ${formatPrice(amount)} en ligne`}
                  </Button>
                  {checkoutError && <p className="text-sm text-red-600">{checkoutError}</p>}
                </div>
              )}

              {/* Moyen 2 — Paiement direct sur nos numéros MoMo */}
              <div className="rounded-xl border bg-brand-subtle border-brand-primary shadow-sm p-4 space-y-3 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-foreground">
                    <Smartphone size={18} className="text-brand-primary" />
                    <h4 className="font-semibold text-sm">Payer sur nos numéros Mobile Money</h4>
                  </div>
                  <Badge variant="secondary" size="sm">
                    <Clock size={12} className="mr-1" /> Validation manuelle
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Envoyez <span className="font-semibold text-foreground">{formatPrice(amount)}</span> à
                  l'un des numéros ci-dessous en indiquant le nom de votre bar en motif.
                  Votre abonnement sera activé après vérification manuelle de votre paiement.
                </p>

                <div className="space-y-2">
                  {MOMO_PAYMENT_NUMBERS.map((m) => (
                    <div key={m.operator} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-foreground">{m.number}</p>
                        <p className="text-xs text-muted-foreground">{m.operator} - {m.accountName}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground/80">Motif à indiquer (Nom du bar) :</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono select-all text-foreground">
                      {paymentReference}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyReference} aria-label="Copier le motif">
                      {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ce motif nous aide à identifier votre bar.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
};

MySubscriptionSection.displayName = 'MySubscriptionSection';
export default MySubscriptionSection;
