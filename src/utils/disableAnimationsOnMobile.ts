/**
 * Désactiver les animations Framer Motion sur mobile pour réduire le TBT et la consommation CPU
 * Les animations ne sont pas essentielles pour l'UX mobile et consomment beaucoup de CPU
 */

import { Variants } from 'framer-motion';

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

/**
 * Wrapper pour les variants Framer Motion qui désactive les animations sur mobile
 * Utilisation: const variants = createMobileVariants({ initial: {...}, animate: {...} })
 */
export function createMobileVariants(variants: Variants): Variants {
  if (!isMobileDevice()) {
    return variants;
  }

  // Sur mobile, retourner des variants sans animations
  return {
    initial: variants.initial || {},
    animate: variants.animate || {},
    exit: variants.exit || {},
  };
}

/**
 * Wrapper pour les animations Framer Motion
 * Utilisé pour les propriétés transition et autres
 */
export function getMobileAnimationProps(shouldAnimate: boolean = true) {
  const isMobile = isMobileDevice();

  if (isMobile) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 }, // Pas d'animation
    };
  }

  return shouldAnimate ? {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.2 },
  } : {
    initial: { opacity: 1, y: 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 1, y: 0 },
    transition: { duration: 0 },
  };
}

/**
 * Configuration globale pour désactiver les animations Framer Motion
 * À appeler au démarrage de l'app si nécessaire
 */
export function disableFramerMotionOnMobile() {
  if (!isMobileDevice()) return;

  // Désactiver les animations globalement
  const win = window as Window & { reduceMotion?: boolean };
  if (typeof window !== 'undefined' && win.reduceMotion === undefined) {
    win.reduceMotion = true;
  }
}
