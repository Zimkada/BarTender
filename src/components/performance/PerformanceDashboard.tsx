import React from 'react';
import type { PerformanceMetrics } from '../../hooks/useListPerformanceMetrics';

export interface PerformanceDashboardProps {
  metrics: PerformanceMetrics;
  title?: string;
  showDetails?: boolean;
}

/**
 * Dashboard d'affichage des métriques de performance
 * Montre: Load time, FPS, Memory, DOM nodes, etc.
 *
 * Utile pour déboguer les problèmes de performance
 * ou valider que la pagination + virtualization fonctionne
 */
export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  metrics,
  title = 'Performance Metrics',
  showDetails = true,
}) => {
  const isFpsGood = metrics.fps >= 50;
  const memoryWarning = metrics.memoryUsage > 100;
  const domOptimized = metrics.domNodeCount < metrics.itemsCount;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>

      {/* Main metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {/* FPS */}
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${
              isFpsGood ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {metrics.fps}
          </div>
          <p className="text-xs text-gray-600">FPS</p>
          <p className="text-xs mt-1">
            {isFpsGood ? '✓ Smooth' : '⚠ Slow'}
          </p>
        </div>

        {/* Load Time */}
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {metrics.loadTime}ms
          </div>
          <p className="text-xs text-gray-600">Load Time</p>
          <p className="text-xs mt-1">
            {metrics.loadTime < 1000 ? '✓ Fast' : '⚠ Slow'}
          </p>
        </div>

        {/* Memory */}
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${
              !memoryWarning ? 'text-green-600' : 'text-orange-600'
            }`}
          >
            {metrics.memoryUsage}MB
          </div>
          <p className="text-xs text-gray-600">Memory</p>
          <p className="text-xs mt-1">
            {!memoryWarning ? '✓ Good' : '⚠ High'}
          </p>
        </div>

        {/* DOM Nodes */}
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${
              domOptimized ? 'text-green-600' : 'text-orange-600'
            }`}
          >
            {metrics.domNodeCount}
          </div>
          <p className="text-xs text-gray-600">DOM Nodes</p>
          <p className="text-xs mt-1">
            {domOptimized
              ? `✓ ${Math.round(
                  (metrics.visibleItemsCount / metrics.itemsCount) * 100
                )}% optimized`
              : '⚠ All items'}
          </p>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="border-t border-gray-200 pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Items Loaded</p>
              <p className="font-semibold text-gray-900">
                {metrics.itemsCount}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Visible Items</p>
              <p className="font-semibold text-gray-900">
                {metrics.visibleItemsCount}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Avg Render/Item</p>
              <p className="font-semibold text-gray-900">
                {metrics.avgItemRenderTime}ms
              </p>
            </div>
            <div>
              <p className="text-gray-600">Render Time</p>
              <p className="font-semibold text-gray-900">
                {metrics.renderTime}ms
              </p>
            </div>
          </div>

          {/* Optimization tips */}
          <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-xs font-medium text-blue-900 mb-2">
              Optimization Tips:
            </p>
            <ul className="text-xs text-blue-800 space-y-1">
              {!isFpsGood && (
                <li>• FPS is low - Consider reducing item count or using virtualization</li>
              )}
              {memoryWarning && (
                <li>• Memory usage is high - Reduce item size or implement pagination</li>
              )}
              {!domOptimized && (
                <li>• DOM is not optimized - All items are rendered, not just visible ones</li>
              )}
              {isFpsGood && !memoryWarning && domOptimized && (
                <li>✓ Performance is optimal!</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

PerformanceDashboard.displayName = 'PerformanceDashboard';
