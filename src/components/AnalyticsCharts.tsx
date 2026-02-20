import { useState, useMemo } from 'react';
import { Select } from './ui/Select';
import { useTheme } from '../context/ThemeContext';
import { ThemeService } from '../services/theme.service';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
} from './charts/RechartsWrapper';



interface AnalyticsChartsProps {
  data: any[];
  expensesByCategory: any;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/90 backdrop-blur-md p-3 rounded-xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-medium text-gray-700">{entry.name}:</span>
              <span className="text-sm font-bold text-gray-900">
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const AnalyticsCharts = ({ data, expensesByCategory }: AnalyticsChartsProps) => {
  const [timeRange, setTimeRange] = useState(12);

  const { themeConfig } = useTheme();

  const { chartColors, brandPrimary } = useMemo(() => {
    const colors = ThemeService.getColors(themeConfig);
    return {
      brandPrimary: colors.primary,
      chartColors: [
        colors.primary, // Brand Primary
        '#3b82f6', // Bleu (Services/Eau)
        '#f59e0b', // Amber (Dépenses)
        '#a855f7', // Violet (Investissements)
        '#10b981', // Emeraude
        '#6b7280', // Gris
      ]
    };
  }, [themeConfig]);

  const filteredData = data.slice(-timeRange);

  const expenseData = Object.entries(expensesByCategory)
    .filter(([key]) => key !== 'investment')
    .map(([, value]) => ({ name: (value as any).label, value: (value as any).amount }));

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Select
          options={[
            { value: '3', label: '3 derniers mois' },
            { value: '6', label: '6 derniers mois' },
            { value: '12', label: '12 derniers mois' },
          ]}
          value={timeRange.toString()}
          onChange={(e) => setTimeRange(parseInt(e.target.value))}
          size="sm"
          className="w-48"
        />
      </div>

      {/* Évolution Solde Cumulatif */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">Évolution de la Trésorerie</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <AreaChart data={filteredData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenus" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandPrimary} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={brandPrimary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCouts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.05)', strokeWidth: 2 }} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
              <Area
                type="monotone"
                dataKey="Revenus"
                stroke={brandPrimary}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorRevenus)"
                activeDot={{ r: 6, strokeWidth: 0, fill: brandPrimary }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="Coûts Opérationnels"
                stroke="#f59e0b"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCouts)"
                activeDot={{ r: 6, strokeWidth: 0, fill: '#f59e0b' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Répartition Dépenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">Répartition des Dépenses Opérationnelles</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
              <PieChart>
                <Pie
                  data={expenseData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  isAnimationActive={false}
                  stroke="none"
                  label={expenseData.length <= 4 ? (entry: any) => entry.name : undefined}
                >
                  {expenseData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenus vs Dépenses */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">Revenus vs. Coûts (Volume)</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
              <BarChart data={filteredData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                <Bar dataKey="Revenus" fill={brandPrimary} radius={[4, 4, 4, 4]} isAnimationActive={false} />
                <Bar dataKey="Coûts Opérationnels" fill="#f59e0b" radius={[4, 4, 4, 4]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export { AnalyticsCharts };
export default AnalyticsCharts;
