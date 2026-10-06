import { createContext, useContext } from 'react';
import type { Counter } from '../services/supabase/counters.service';

/**
 * Contexte du comptoir actif.
 *
 * ⭐ Chantier comptoirs multiples (04/10/2026). Un bar peut avoir plusieurs
 * comptoirs, chacun avec son gérant et son stock ; les serveuses interviennent
 * des deux côtés via un sélecteur permanent dans le header.
 *
 * ⚠️ SÉPARÉ de `BarContext` volontairement : celui-ci fait déjà 765 lignes et
 * porte l'authentification, les membres et le mode opératoire. Y ajouter les
 * comptoirs en ferait un God Object (cf. l'anti-pattern documenté dans
 * CLAUDE.md).
 */
export interface CounterContextType {
  /** Comptoirs où la personne courante peut travailler dans le bar courant. */
  counters: Counter[];
  /**
   * Comptoir actif. `null` tant que le chargement n'est pas terminé.
   *
   * ⚠️ Toute écriture (vente, retour, mouvement de stock) doit porter CE
   * comptoir. Ne jamais le relire au moment de la synchronisation offline :
   * il doit être figé à la saisie, sinon une vente enregistrée hors réseau
   * est rejouée sur le mauvais comptoir au retour du réseau (corruption
   * silencieuse de stock).
   */
  currentCounter: Counter | null;
  currentCounterId: string | null;
  loading: boolean;

  /**
   * Le bar courant a-t-il plusieurs comptoirs ?
   *
   * ⭐ Pilote l'affichage : à comptoir unique, RIEN ne doit changer pour
   * l'utilisateur — ni sélecteur, ni mention de comptoir. C'est la garantie de
   * non-régression pour les 13 bars existants, tous mono-comptoir.
   */
  hasMultipleCounters: boolean;

  switchCounter: (counterId: string) => void;
  refreshCounters: () => Promise<void>;
}

export const CounterContext = createContext<CounterContextType | undefined>(
  undefined
);

export function useCounterContext(): CounterContextType {
  const context = useContext(CounterContext);
  if (!context) {
    throw new Error(
      'useCounterContext doit être utilisé dans un CounterProvider'
    );
  }
  return context;
}
