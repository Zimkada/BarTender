// useMySubscription — Statut d'abonnement du bar courant + flux de paiement FedaPay.
//
// ⭐ NetworkOnly : le paiement d'abonnement exige le réseau (MoMo), on ne met JAMAIS
// ce flux en offline queue. networkMode 'always' + pas de persistance.
//
// ⭐ Le paiement n'est validé QUE par le webhook FedaPay (serveur), jamais par le
// redirect de retour. Après le retour (?payment=pending), on poll le statut jusqu'à
// ce que l'échéance avance (webhook traité) ou expiration du délai.
//
// 📊 Polling (et non Realtime) par choix délibéré : la confirmation est un événement
// PONCTUEL et RARE (un renouvellement par bar par mois), borné à ≤90 s. Le webhook
// écrit bars.subscription_due_date en service_role — un canal Realtime filtré par RLS
// n'est pas garanti de recevoir cet UPDATE de façon fiable, et ajouterait une
// souscription/cleanup pour un gain marginal à cette échelle. React Query ne poll pas
// en arrière-plan par défaut (refetchIntervalInBackground non activé), donc pas de
// requêtes gaspillées onglet masqué.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SubscriptionService, type MySubscription } from '../services/supabase/subscription.service';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 90_000; // 1 min 30

// Sentinelle : distingue « échéance pas encore lue » de « échéance réellement absente ».
// Sans ça, un premier paiement (dueDate: undefined → date) ne serait jamais détecté
// comme une avancée, et le polling irait jusqu'au timeout.
const NOT_CAPTURED = Symbol('due-date-not-captured');

export function useMySubscription(barId: string | undefined) {
  const [isPolling, setIsPolling] = useState(false);
  const pollDeadlineRef = useRef<number>(0);
  // Échéance au démarrage du polling. NOT_CAPTURED tant que la query n'a pas résolu :
  // on la fige à la PREMIÈRE valeur connue, pas à l'instant (potentiellement prématuré)
  // de startPollingForConfirmation().
  const dueDateAtCheckoutRef = useRef<string | undefined | typeof NOT_CAPTURED>(NOT_CAPTURED);

  const query = useQuery<MySubscription>({
    queryKey: ['my-subscription', barId],
    queryFn: () => SubscriptionService.getMySubscription(barId as string),
    enabled: !!barId,
    networkMode: 'always',
    staleTime: 60_000,
    // Poll actif uniquement pendant l'attente de confirmation du webhook
    refetchInterval: isPolling ? POLL_INTERVAL_MS : false,
  });

  const currentDueDate = query.data?.dueDate;
  const isDataResolved = query.data !== undefined;

  // Arrêt du polling : échéance avancée (paiement confirmé) ou délai dépassé.
  useEffect(() => {
    if (!isPolling) return;

    // Capture différée : si le polling a démarré avant la 1ʳᵉ réponse serveur,
    // on fige la référence dès que les données arrivent (pas à undefined).
    if (dueDateAtCheckoutRef.current === NOT_CAPTURED && isDataResolved) {
      dueDateAtCheckoutRef.current = currentDueDate;
      return; // on ne peut pas encore comparer sur ce même tick
    }

    const baseline = dueDateAtCheckoutRef.current;
    const advanced =
      baseline !== NOT_CAPTURED &&
      currentDueDate !== undefined &&
      // undefined → date (1er paiement) OU date → date plus lointaine (renouvellement)
      (baseline === undefined ||
        new Date(currentDueDate).getTime() > new Date(baseline).getTime());

    if (advanced || Date.now() > pollDeadlineRef.current) {
      setIsPolling(false);
    }
  }, [isPolling, currentDueDate, isDataResolved]);

  /** Lance le paiement : crée le checkout FedaPay et redirige le navigateur. */
  const startCheckout = useCallback(async (monthsCovered: number) => {
    if (!barId) throw new Error('Aucun bar sélectionné');
    const url = await SubscriptionService.createCheckout(barId, monthsCovered);
    window.location.href = url;
  }, [barId]);

  /** À appeler au retour du checkout (?payment=pending) pour attendre le webhook. */
  const startPollingForConfirmation = useCallback(() => {
    // La référence sera figée par l'effet dès que les données seront disponibles
    // (gère le cas où la query n'a pas encore résolu au retour de redirection).
    dueDateAtCheckoutRef.current = isDataResolved ? currentDueDate : NOT_CAPTURED;
    pollDeadlineRef.current = Date.now() + POLL_MAX_MS;
    setIsPolling(true);
  }, [currentDueDate, isDataResolved]);

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
    startCheckout,
    startPollingForConfirmation,
    isConfirming: isPolling,
  };
}
