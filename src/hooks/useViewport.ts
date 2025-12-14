import { useState, useEffect } from 'react';

/**
 * Breakpoints optimisés pour marché Afrique de l'Ouest
 * Mobile-first: 99% utilisateurs smartphones Android Bénin
 * Desktop: 1% promoteurs avec PC (bonus support)
 */
const BREAKPOINTS = {
  mobile: 0,      // 0-1023px (smartphones, base par défaut)
  desktop: 1024,  // 1024px+ (PC/laptops, rare mais supporté)
} as const;

interface ViewportState {
  width: number;
  height: number;
  isMobile: boolean;
  isDesktop: boolean;
}

/**
 * Hook expert pour détection responsive mobile-first
 *
 * Features:
 * - Debounce optimisé (performance)
 * - Cleanup automatique (pas de memory leak)
 * - SSR-safe (window check)
 * - TypeScript strict
 *
 * Usage:
 * ```tsx
 * const { isMobile, isDesktop, width } = useViewport();
 *
 * if (isMobile) {
 *   return <HeaderMobileCompact />;
 * }
 * return <HeaderDesktopExpanded />;
 * ```
 *
 * @returns ViewportState avec détection automatique temps réel
 */
export function useViewport(): ViewportState {
  // SSR-safe: vérifier que window existe (Next.js compatible)
  const isClient = typeof window !== 'undefined';

  const [viewport, setViewport] = useState<ViewportState>(() => {
    if (!isClient) {
      // Fallback SSR: assumer mobile par défaut (mobile-first)
      return {
        width: 375,
        height: 667,
        isMobile: true,
        isDesktop: false,
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const isMobileValue = width < BREAKPOINTS.desktop;
    console.log('🔍 useViewport INIT:', { width, isMobile: isMobileValue, breakpoint: BREAKPOINTS.desktop });
    return {
      width,
      height,
      isMobile: isMobileValue,
      isDesktop: width >= BREAKPOINTS.desktop,
    };
  });

  useEffect(() => {
    if (!isClient) return;

    let timeoutId: NodeJS.Timeout;

    /**
     * Handler optimisé avec debounce
     * Évite calculs multiples lors du resize (performance Android)
     */
    const handleResize = () => {
      // Annuler timeout précédent si resize continu
      clearTimeout(timeoutId);

      // Attendre 150ms après fin du resize avant calcul
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isMobileValue = width < BREAKPOINTS.desktop;
        console.log('🔍 useViewport RESIZE:', { width, isMobile: isMobileValue, breakpoint: BREAKPOINTS.desktop });

        setViewport({
          width,
          height,
          isMobile: isMobileValue,
          isDesktop: width >= BREAKPOINTS.desktop,
        });
      }, 150);
    };

    // Écouter resize
    window.addEventListener('resize', handleResize, { passive: true });

    // Cleanup: supprimer listener et timeout (éviter memory leak)
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isClient]);

  return viewport;
}

/**
 * Hook simplifié pour vérification mobile uniquement
 * Plus performant si vous n'avez besoin que de isMobile
 */
export function useIsMobile(): boolean {
  const { isMobile } = useViewport();
  return isMobile;
}
