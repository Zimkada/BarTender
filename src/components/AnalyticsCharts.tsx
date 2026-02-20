import { useState, useMemo } from 'react';
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

import { useViewport } from '../hooks/useViewport';

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
          {payload.map((entry: any, index: number) => {
            let rawValue = entry.value;
            if (Array.isArray(rawValue)) {
              rawValue = rawValue[1] - rawValue[0];
            }
            if (rawValue === undefined || rawValue === null) {
              rawValue = entry.payload?.[entry.dataKey];
            }
            const numVal = Number(rawValue) || 0;

            return (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span className="text-sm font-medium text-gray-700">{entry.name}:</span>
                <span className="text-sm font-bold text-gray-900">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(numVal)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.45; // Put slightly inside center
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.04) return null; // Hide text for very small slices

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-bold" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.3)' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const AnalyticsCharts = ({ data, expensesByCategory }: AnalyticsChartsProps) => {
  const [timeRange, setTimeRange] = useState(12);
  const { isMobile } = useViewport();
  const { themeConfig } = useTheme();

  const { chartColors, brandPrimary, brandAccent } = useMemo(() => {
    const colors = ThemeService.getColors(themeConfig);
    return {
      brandPrimary: colors.primary, // Lourd/Fort (Revenus)
      brandAccent: colors.accent,   // Clair/Adouci (Dépenses)
      chartColors: [
        colors.primary,
        colors.secondary,
        colors.accent,
        '#3b82f6', // Bleu
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
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-bold text-gray-900">Tendances Historiques</h2>
        <div className="flex bg-white/40 backdrop-blur-md rounded-2xl p-1 gap-1.5 border border-brand-subtle shadow-sm w-full md:w-auto overflow-hidden">
          {[
            { value: 3, label: '3 Mois' },
            { value: 6, label: '6 Mois' },
            { value: 12, label: '12 Mois' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className={`px-2 sm:px-4 py-2 h-10 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all flex-1 md:flex-none whitespace-nowrap min-w-max ${timeRange === opt.value ? 'glass-action-button-active-2026 shadow-md shadow-brand-subtle text-brand-primary' : 'glass-action-button-2026 text-gray-500 hover:text-brand-primary'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Évolution Solde Cumulatif */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">Évolution de la Trésorerie</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <AreaChart data={filteredData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenus" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandPrimary} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={brandPrimary} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorCouts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandAccent} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={brandAccent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.05)', strokeWidth: 2 }} />
              <Legend
                iconType="circle"
                verticalAlign="bottom"
                wrapperStyle={{
                  paddingTop: '20px',
                  fontSize: '11px',
                  width: '100%'
                }}
              />
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
                stroke={brandAccent}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCouts)"
                activeDot={{ r: 6, strokeWidth: 0, fill: brandAccent }}
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
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
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
                  labelLine={false}
                  label={renderCustomizedLabel}
                >
                  {expenseData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{
                    fontSize: '12px',
                    paddingTop: '10px',
                    width: '100%'
                  }}
                />
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
                <Legend
                  iconType="circle"
                  verticalAlign="bottom"
                  wrapperStyle={{
                    paddingTop: '20px',
                    fontSize: '12px',
                    width: '100%'
                  }}
                />
                <Bar dataKey="Revenus" fill={brandPrimary} radius={[4, 4, 4, 4]} isAnimationActive={false} />
                <Bar dataKey="Coûts Opérationnels" fill={brandAccent} radius={[4, 4, 4, 4]} isAnimationActive={false} />
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
