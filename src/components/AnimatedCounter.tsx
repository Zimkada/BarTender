// components/AnimatedCounter.tsx
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/**
 * ⭐ Compteur qui DÉFILE de l'ancienne valeur à la nouvelle (audit UI/UX,
 * lot 2, 10/10/2026).
 *
 * Défauts corrigés :
 *   · il repartait de 0 à CHAQUE changement : à chaque vente, « Ventes jour »
 *     recomptait toute la journée depuis zéro ;
 *   · aucun séparateur de milliers (« 2380 FCFA » quand le reste de l'app
 *     affiche « 2 380 FCFA ») ;
 *   · un `setState` par frame pendant 1 s : tout le parent (l'en-tête)
 *     re-rendait 60 fois par seconde. Le texte est désormais écrit
 *     directement dans le DOM, sans re-rendu React.
 *
 * ⚠️ Au premier affichage, la valeur s'affiche TELLE QUELLE : recompter
 * depuis 0 à chaque ouverture d'écran serait une latence subie, sans
 * information. Seuls les CHANGEMENTS sont animés.
 *
 * ⛔ Écarté : un « +600 FCFA » flottant à chaque hausse. Le compteur monte
 * aussi au chargement des données (0 → total du jour) et au changement de
 * bar : on aurait affiché de fausses « ventes ». Le défilement suffit.
 */

const defaultFormat = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

interface AnimatedCounterProps {
  value: number;
  /** Durée du défilement, en secondes. */
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Mise en forme du nombre (ex. `formatPrice`). Défaut : séparateur de milliers. */
  format?: (n: number) => string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 0.8,
  prefix = '',
  suffix = '',
  className = '',
  format = defaultFormat,
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const displayedRef = useRef(value);
  const reduceMotion = useReducedMotion();

  // ⚠️ Mise en forme lue via une ref : un `format` recréé à chaque rendu du
  // parent ne doit ni relancer ni interrompre l'animation.
  const renderRef = useRef((n: number) => `${prefix}${format(n)}${suffix}`);
  useLayoutEffect(() => {
    renderRef.current = (n: number) => `${prefix}${format(n)}${suffix}`;
  });

  // Premier affichage : la valeur telle quelle, avant la peinture (pas de flash).
  useLayoutEffect(() => {
    if (textRef.current) textRef.current.textContent = renderRef.current(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage uniquement
  }, []);

  useEffect(() => {
    // ⚠️ Départ = valeur AFFICHÉE, pas l'ancienne cible : si une seconde vente
    // arrive pendant le défilement, il repart d'où il en est, sans saut.
    const from = displayedRef.current;
    const el = textRef.current;
    if (!el) return;
    if (from === value) {
      // Mise en forme changée sans changement de valeur : réécrire le texte.
      el.textContent = renderRef.current(value);
      return;
    }

    // « Réduire les animations » : saut direct à la nouvelle valeur.
    // ⚠️ `animate()` impératif n'est PAS couvert par MotionConfig, d'où la garde.
    if (reduceMotion) {
      displayedRef.current = value;
      el.textContent = renderRef.current(value);
      return;
    }

    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => {
        displayedRef.current = Math.round(latest);
        el.textContent = renderRef.current(displayedRef.current);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduceMotion]);

  return <span ref={textRef} className={className} />;
};
