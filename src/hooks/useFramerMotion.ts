/**
 * Hook pour lazy-loader Framer Motion à la demande
 * Réduit le bundle initial de 115 KB en chargeant la librairie seulement quand nécessaire
 */

import { useState, useEffect } from 'react';

type FramerMotionModule = typeof import('framer-motion');

let cachedModule: FramerMotionModule | null = null;
let loadingPromise: Promise<FramerMotionModule> | null = null;

export function useFramerMotion() {
  const [module, setModule] = useState<FramerMotionModule | null>(cachedModule);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedModule);

  useEffect(() => {
    // Si déjà chargé, utiliser le cache
    if (cachedModule) {
      setModule(cachedModule);
      setIsLoading(false);
      return;
    }

    // Si chargement en cours, attendre
    if (loadingPromise) {
      loadingPromise
        .then((m) => {
          setModule(m);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err);
          setIsLoading(false);
        });
      return;
    }

    // Sinon, lancer le chargement
    loadingPromise = import('framer-motion');
    loadingPromise
      .then((m) => {
        cachedModule = m;
        setModule(m);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err);
        setIsLoading(false);
      });
  }, []);

  return { module, error, isLoading };
}
