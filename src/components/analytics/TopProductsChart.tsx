import { BarChart3 } from 'lucide-react';
import { Select } from '../ui/Select';
import {
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from '../charts/RechartsWrapper';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { ChartTooltip } from '../charts/ChartTooltip';

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
      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mb-4"></div>
          <p className="text-sm text-foreground/70">Chargement des top produits...</p>
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
      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="flex flex-col items-center justify-center py-12">
          <BarChart3 size={48} className="text-muted-foreground/40 mb-4" />
          <h4 className="text-sm font-semibold text-foreground/80 mb-2">
            Aucun produit vendu
          </h4>
          <p className="text-xs text-muted-foreground text-center">
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
    <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
      {/* Header avec contrôles */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Titre avec sélecteur de limite */}
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Top</h4>
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
              className="w-20 btn-brand h-8 text-[11px] font-bold"
            />
            <h4 className="text-sm font-semibold text-foreground">produits</h4>
          </div>

          {/* Contrôles : Métrique */}
          <div className="flex items-center flex-wrap gap-2">
            {!isMobile && (
              <span className="text-sm font-medium text-foreground/70">Affiché par :</span>
            )}
            <button
              onClick={() => onMetricChange('units')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
              ${metric === 'units'
                  ? 'btn-brand shadow-sm'
                  : 'bg-muted text-foreground/70 hover:bg-muted/80'}`}
            >
              📦 Unités
            </button>
            <button
              onClick={() => onMetricChange('revenue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
              ${metric === 'revenue'
                  ? 'btn-brand shadow-sm'
                  : 'bg-muted text-foreground/70 hover:bg-muted/80'}`}
            >
              💰 Revenu
            </button>
            <button
              onClick={() => onMetricChange('profit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
              ${metric === 'profit'
                  ? 'btn-brand shadow-sm'
                  : 'bg-muted text-foreground/70 hover:bg-muted/80'}`}
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
          scrollbarColor: 'var(--brand-primary) var(--brand-bg-subtle)'
        } : {}}
      >
        <div style={needsScroll ? { minWidth: `${minChartWidth}px` } : { width: '100%' }}>
          <ResponsiveContainer width="100%" height={isMobile ? 300 : 250} minWidth={0} debounce={50}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.55} />
              <XAxis
                dataKey="displayName"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 11 : 10 }}
                angle={isMobile ? -35 : -45}
                textAnchor="end"
                height={isMobile ? 100 : 80}
              />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 10 : 12 }} />
              <Tooltip
                content={
                  <ChartTooltip
                    valueFormatter={(value) => metric === 'units' ? value.toLocaleString('fr-FR') : formatPrice(value)}
                  />
                }
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
              />
              <Bar dataKey={metric} fill="var(--brand-primary)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hint de scroll pour mobile */}
      {needsScroll && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          ← Faites défiler horizontalement →
        </p>
      )}
    </div>
  );
}
