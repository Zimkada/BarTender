import { useEffect, useRef, useState } from 'react';

export interface PerformanceMetrics {
  loadTime: number; // ms depuis le début du chargement
  renderTime: number; // ms pour render
  domNodeCount: number; // nombre de nœuds DOM
  memoryUsage: number; // MB (approximatif)
  fps: number; // frames per second
  itemsCount: number; // total items chargés
  visibleItemsCount: number; // items visibles à l'écran
  avgItemRenderTime: number; // ms moyen par item
}

export interface UseListPerformanceMetricsOptions {
  enabled?: boolean;
  itemCount: number;
  visibleCount?: number;
  containerRef?: React.RefObject<HTMLElement>;
  logToConsole?: boolean;
}

/**
 * Hook pour mesurer la performance des listes avec pagination + virtualization
 *
 * Mesure:
 * - Load time: Temps total de chargement
 * - Render time: Temps de rendu
 * - DOM nodes: Nombre de nœuds dans le DOM
 * - Memory usage: Utilisation mémoire (approximatif)
 * - FPS: Frames par seconde (smooth scrolling)
 * - Item render time: Temps moyen par item
 *
 * Exemple:
 * ```tsx
 * const metrics = useListPerformanceMetrics({
 *   itemCount: sales.length,
 *   visibleCount: 15,
 *   containerRef: containerRef,
 *   logToConsole: true
 * });
 *
 * return <div ref={containerRef}>{...}</div>;
 * ```
 */
export function useListPerformanceMetrics(
  options: UseListPerformanceMetricsOptions
): PerformanceMetrics {
  const {
    enabled = true,
    itemCount,
    visibleCount = 15,
    containerRef,
    logToConsole = false,
  } = options;

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    renderTime: 0,
    domNodeCount: 0,
    memoryUsage: 0,
    fps: 60,
    itemsCount: itemCount,
    visibleItemsCount: visibleCount,
    avgItemRenderTime: 0,
  });

  const startTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number>();

  // Mesurer FPS avec RAF (requestAnimationFrame)
  useEffect(() => {
    if (!enabled) return;

    let frameCount = 0;
    let lastTime = performance.now();

    const measureFrame = () => {
      frameCount++;
      const now = performance.now();
      const timeSinceLastCheck = now - lastTime;

      // Calculer FPS chaque 500ms
      if (timeSinceLastCheck >= 500) {
        const currentFps = (frameCount / timeSinceLastCheck) * 1000;
        frameCountRef.current = frameCount;
        lastFrameTimeRef.current = currentFps;

        // Mettre à jour les métriques
        setMetrics((prev) => ({
          ...prev,
          fps: Math.round(currentFps),
          loadTime: Math.round(performance.now() - startTimeRef.current),
        }));

        frameCount = 0;
        lastTime = now;
      }

      rafIdRef.current = requestAnimationFrame(measureFrame);
    };

    rafIdRef.current = requestAnimationFrame(measureFrame);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [enabled]);

  // Mesurer DOM nodes et memory
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      let domNodeCount = 0;
      let memoryUsage = 0;

      // Compter les nœuds DOM
      if (containerRef?.current) {
        domNodeCount = containerRef.current.querySelectorAll('*').length;
      } else {
        domNodeCount = document.querySelectorAll('*').length;
      }

      // Approximation mémoire (très basique)
      // En vrai, il faudrait utiliser performance.memory si disponible
      if ('memory' in performance) {
        memoryUsage =
          (performance.memory as any).usedJSHeapSize / 1024 / 1024;
      }

      const avgRenderTime =
        itemCount > 0
          ? Math.round(
              (metrics.renderTime / Math.max(itemCount, visibleCount))
            )
          : 0;

      setMetrics((prev) => ({
        ...prev,
        domNodeCount,
        memoryUsage: Math.round(memoryUsage),
        avgItemRenderTime: avgRenderTime,
        itemsCount: itemCount,
        visibleItemsCount: visibleCount,
      }));

      // Log to console if enabled
      if (logToConsole) {
        console.group('[Performance Metrics]');
        console.log(`Items: ${itemCount} loaded, ${visibleCount} visible`);
        console.log(
          `DOM nodes: ${domNodeCount} (without virtualization would be ${itemCount})`
        );
        console.log(`FPS: ${metrics.fps} (${metrics.fps >= 50 ? '✓ Good' : '⚠ Low'})`);
        console.log(`Memory: ${memoryUsage}MB`);
        console.log(`Load time: ${metrics.loadTime}ms`);
        console.groupEnd();
      }
    }, 2000); // Mesurer chaque 2 secondes

    return () => clearInterval(interval);
  }, [enabled, containerRef, itemCount, visibleCount, metrics.fps, metrics.renderTime, logToConsole]);

  return metrics;
}

/**
 * Hook pour capturer le temps de rendu des items
 * À utiliser dans le composant qui rend les items
 */
export function useItemRenderTime() {
  const startTimeRef = useRef(performance.now());
  const renderTimeRef = useRef(0);

  useEffect(() => {
    const endTime = performance.now();
    renderTimeRef.current = endTime - startTimeRef.current;
  });

  return {
    renderTime: renderTimeRef.current,
    reset: () => {
      startTimeRef.current = performance.now();
    },
  };
}
