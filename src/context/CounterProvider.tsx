import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './AuthContext';
import { useBarContext } from './BarContext';
import { CounterContext, type CounterContextType } from './CounterContext';
import { CountersService, type Counter } from '../services/supabase/counters.service';
import { CACHE_STRATEGY, QUERY_KEYS } from '../lib/cache-strategy';
import { captureError } from '../lib/monitoring';

/** Clé de persistance du comptoir actif (même registre que `selectedBarId`). */
const STORAGE_KEY = 'selectedCounterId';

/**
 * Rôles qui supervisent le bar entier : ils voient tous les comptoirs sans
 * affectation explicite. Les autres ne voient que leur périmètre de travail.
 */
const SUPERVISOR_ROLES = ['promoteur', 'co_promoteur', 'super_admin'];

/** Lecture tolérante : un localStorage bloqué ne doit pas casser le rendu. */
function readStored(barId: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_KEY}:${barId}`);
  } catch {
    return null;
  }
}

function writeStored(barId: string, counterId: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${barId}`, counterId);
  } catch {
    // Navigation privée, stockage bloqué : le comptoir retombera sur le
    // primaire au prochain chargement. Dégradation acceptable.
  }
}

export const CounterProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const queryClient = useQueryClient();

  const barId = currentBar?.id ?? null;
  const userId = currentSession?.userId ?? null;
  const isSupervisor = SUPERVISOR_ROLES.includes(currentSession?.role ?? '');

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: counters = [], isLoading } = useQuery({
    // ⚠️ La clé porte userId : un gérant et un serveur du même bar n'ont pas
    // le même périmètre. Sans lui, l'un recevrait le périmètre de l'autre
    // depuis le cache.
    queryKey: barId && userId ? QUERY_KEYS.counters.myList(barId, userId) : ['counters', 'idle'],
    queryFn: () => CountersService.getMyCounters(barId!, userId!, isSupervisor),
    enabled: !!barId && !!userId,
    ...CACHE_STRATEGY.categories, // quasi-statique : un comptoir change rarement
  });

  /**
   * Résolution du comptoir actif, par ordre de préférence :
   *   1. choix explicite de cette session, s'il est encore valide
   *   2. dernier choix persisté pour ce bar
   *   3. comptoir primaire
   *   4. premier comptoir disponible
   *
   * ⚠️ Le `find` sur `selectedId` n'est pas une formalité : après un switch de
   * bar, l'ancien comptoir n'appartient plus à la liste. Sans cette
   * vérification, on écrirait des ventes sur le comptoir d'un AUTRE bar.
   */
  const currentCounter = useMemo<Counter | null>(() => {
    if (counters.length === 0) return null;

    const explicit = selectedId && counters.find((c) => c.id === selectedId);
    if (explicit) return explicit;

    if (barId) {
      const storedId = readStored(barId);
      const stored = storedId && counters.find((c) => c.id === storedId);
      if (stored) return stored;
    }

    return counters.find((c) => c.isPrimary) ?? counters[0];
  }, [counters, selectedId, barId]);

  // Le choix de session ne survit pas à un changement de bar : il porte un
  // identifiant qui n'existe plus dans le nouveau périmètre.
  useEffect(() => {
    setSelectedId(null);
  }, [barId]);

  /**
   * ⚠️ Une liste VIDE sur un bar chargé est une ANOMALIE, pas un état normal.
   *
   * Deux triggers en base garantissent qu'un bar a toujours un comptoir
   * primaire et que tout membre actif y est affecté. Une liste vide signifie
   * donc soit un trigger désactivé, soit un membre hors périmètre.
   *
   * Sans cette trace, le symptôme serait seulement un sélecteur absent —
   * indistinguable du cas mono-comptoir normal. C'est précisément le type de
   * panne silencieuse que ce chantier s'attache à éviter.
   */
  useEffect(() => {
    if (!barId || !userId || isLoading) return;
    if (counters.length > 0) return;

    // Passe par le wrapper monitoring (jamais Sentry directement) : silencieux
    // en dev, remonté en production.
    captureError(
      new Error('[CounterContext] Aucun comptoir disponible pour ce bar'),
      { barId, userId, isSupervisor }
    );
  }, [barId, userId, isLoading, counters.length, isSupervisor]);

  const switchCounter = useCallback(
    (counterId: string) => {
      if (!counters.some((c) => c.id === counterId)) {
        console.warn('[CounterContext] Comptoir hors périmètre :', counterId);
        return;
      }
      setSelectedId(counterId);
      if (barId) writeStored(barId, counterId);
    },
    [counters, barId]
  );

  const refreshCounters = useCallback(async () => {
    if (!barId) return;
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.counters.all });
  }, [queryClient, barId]);

  const value: CounterContextType = useMemo(
    () => ({
      counters,
      currentCounter,
      currentCounterId: currentCounter?.id ?? null,
      loading: isLoading,
      // ⭐ À comptoir unique, RIEN ne doit changer dans l'UI : c'est la
      // garantie de non-régression pour les bars existants.
      hasMultipleCounters: counters.length > 1,
      switchCounter,
      refreshCounters,
    }),
    [counters, currentCounter, isLoading, switchCounter, refreshCounters]
  );

  return (
    <CounterContext.Provider value={value}>{children}</CounterContext.Provider>
  );
};
