import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Select } from '../ui/Select';

interface TopProductData {
  displayName: string;
  name: string;
  volume: string;
  units: number;
  revenue: number;
  profit: number;
}

interface TopProductsChartProps {
  data: {
    byUnits: TopProductData[];
    byRevenue: TopProductData[];
    byProfit: TopProductData[];
  };
  metric: 'units' | 'revenue' | 'profit';
  onMetricChange: (metric: 'units' | 'revenue' | 'profit') => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  isLoading?: boolean;
  isMobile?: boolean;
  formatPrice: (price: number) => string;
}

export function TopProductsChart({
  data,
  metric,
  onMetricChange,
  limit,
  onLimitChange,
  isLoading = false,
  isMobile = false,
  formatPrice
}: TopProductsChartProps) {

  // Loading State
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-4 border border-amber-100">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mb-4"></div>
          <p className="text-sm text-gray-600">Chargement des top produits...</p>
        </div>
      </div>
    );
  }

  // Get current metric data
  const chartData = metric === 'units' ? data.byUnits :
                    metric === 'revenue' ? data.byRevenue :
                    data.byProfit;

  // Empty State
  if (!chartData || chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 border border-amber-100">
        <div className="flex flex-col items-center justify-center py-12">
          <BarChart3 size={48} className="text-gray-300 mb-4" />
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Aucun produit vendu
          </h4>
          <p className="text-xs text-gray-500 text-center">
            Aucune vente enregistrée sur cette période
          </p>
        </div>
      </div>
    );
  }

  // Calcul pour scroll horizontal mobile
  const barWidth = 60; // Largeur idéale par barre (en pixels)
  const minChartWidth = chartData.length * barWidth;
  const needsScroll = isMobile && chartData.length > 5;

  return (
    <div className="bg-white rounded-xl p-4 border border-amber-100">
      {/* Header avec contrôles */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Titre avec sélecteur de limite */}
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-800">Top</h4>
            <Select
              options={[
                { value: '5', label: '5' },
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' },
              ]}
              value={limit.toString()}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              size="sm"
              className="w-20 bg-amber-500 border-amber-600 text-white font-semibold"
            />
            <h4 className="text-sm font-semibold text-gray-800">produits</h4>
          </div>

          {/* Contrôles : Métrique */}
          <div className="flex items-center flex-wrap gap-2">
            {!isMobile && (
              <span className="text-sm font-medium text-gray-600">Affiché par :</span>
            )}
          <button
            onClick={() => onMetricChange('units')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${metric === 'units'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            📦 Unités vendues
          </button>
          <button
            onClick={() => onMetricChange('revenue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${metric === 'revenue'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            💰 Chiffre d'affaires
          </button>
          <button
            onClick={() => onMetricChange('profit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${metric === 'profit'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            📈 Marge
          </button>
          </div>
        </div>
      </div>

      {/* Graphique avec scroll horizontal si nécessaire */}
      <div
        className={needsScroll ? "overflow-x-auto -mx-4 px-4" : ""}
        style={needsScroll ? {
          scrollbarWidth: 'thin',
          scrollbarColor: '#f59e0b #fef3c7'
        } : {}}
      >
        <div style={needsScroll ? { minWidth: `${minChartWidth}px` } : {}}>
          <ResponsiveContainer width="100%" height={isMobile ? 300 : 250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis
                dataKey="displayName"
                tick={{ fill: '#9ca3af', fontSize: isMobile ? 11 : 10 }}
                angle={isMobile ? -35 : -45}
                textAnchor="end"
                height={isMobile ? 100 : 80}
              />
              <YAxis tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }} />
              <Tooltip formatter={(value: number) => formatPrice(value)} />
              <Bar dataKey={metric} fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hint de scroll pour mobile */}
      {needsScroll && (
        <p className="text-xs text-gray-500 text-center mt-2">
          ← Faites défiler horizontalement →
        </p>
      )}
    </div>
  );
}
