import { lazy, Suspense } from 'react';
import { Spinner } from '../ui/Spinner';

// Lazy load du composant AnalyticsCharts qui contient recharts (~250 Kio)
const AnalyticsCharts = lazy(() => import('../AnalyticsCharts'));

interface LazyAnalyticsChartsProps {
  data: any;
  expensesByCategory: any;
}

export const LazyAnalyticsCharts = (props: LazyAnalyticsChartsProps) => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-600">Chargement des graphiques...</span>
      </div>
    }
  >
    <AnalyticsCharts {...props} />
  </Suspense>
);
