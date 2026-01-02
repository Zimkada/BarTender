import React, { useState, lazy, Suspense } from 'react';
import { Select } from './ui/Select';
import { ResponsiveContainer } from './charts/RechartsWrapper';

// Lazy load Recharts components
const RechartsWrapper = lazy(() => import('./charts/RechartsWrapper'));

// Palette BarTender (cohérente avec l'application)
const COLORS = [
  '#10b981', // Vert emerald-500 (Approvisionnements)
  '#3b82f6', // Bleu blue-500 (Eau)
  '#eab308', // Jaune yellow-500 (Électricité)
  '#6b7280', // Gris gray-500 (Entretien)
  '#a855f7', // Violet purple-500 (Custom)
  '#f97316', // Orange amber-500
];

const AnalyticsCharts = ({ data, expensesByCategory }) => {
  const [timeRange, setTimeRange] = useState(12);

  const filteredData = data.slice(-timeRange);

  const expenseData = Object.entries(expensesByCategory)
    .filter(([key]) => key !== 'investment')
    .map(([, value]) => ({ name: value.label, value: value.amount }));

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
      <div>
        <h3 className="font-semibold mb-4">Évolution de la Trésorerie</h3>
        <ResponsiveContainer width="100%" height={300}>
          <Suspense fallback={<div>Loading Line Chart...</div>}>
            <RechartsWrapper.LineChart data={filteredData}>
              <RechartsWrapper.CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <RechartsWrapper.XAxis dataKey="name" stroke="#6b7280" />
              <RechartsWrapper.YAxis stroke="#6b7280" />
              <RechartsWrapper.Tooltip />
              <RechartsWrapper.Legend />
              <RechartsWrapper.Line
                type="monotone"
                dataKey="Revenus"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 5, strokeWidth: 0 }}
                activeDot={{ r: 7 }}
                isAnimationActive={false}
              />
              <RechartsWrapper.Line
                type="monotone"
                dataKey="Coûts Opérationnels"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ fill: '#f97316', r: 5, strokeWidth: 0 }}
                activeDot={{ r: 7 }}
                isAnimationActive={false}
              />
            </RechartsWrapper.LineChart>
          </Suspense>
        </ResponsiveContainer>
      </div>

      {/* Répartition Dépenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <h3 className="font-semibold mb-4">Répartition des Dépenses Opérationnelles</h3>
          <ResponsiveContainer width="100%" height={300}>
            <Suspense fallback={<div>Loading Pie Chart...</div>}>
              <RechartsWrapper.PieChart>
                <RechartsWrapper.Pie
                  data={expenseData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  isAnimationActive={false}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {expenseData.map((entry, index) => (
                    <RechartsWrapper.Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </RechartsWrapper.Pie>
                <RechartsWrapper.Tooltip />
                <RechartsWrapper.Legend />
              </RechartsWrapper.PieChart>
            </Suspense>
          </ResponsiveContainer>
        </div>

        {/* Revenus vs Dépenses */}
        <div>
          <h3 className="font-semibold mb-4">Revenus vs. Coûts Opérationnels</h3>
          <ResponsiveContainer width="100%" height={300}>
            <Suspense fallback={<div>Loading Bar Chart...</div>}>
              <RechartsWrapper.BarChart data={filteredData}>
                <RechartsWrapper.CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <RechartsWrapper.XAxis dataKey="name" stroke="#6b7280" />
                <RechartsWrapper.YAxis stroke="#6b7280" />
                <RechartsWrapper.Tooltip />
                <RechartsWrapper.Legend />
                <RechartsWrapper.Bar dataKey="Revenus" fill="#10b981" isAnimationActive={false} />
                <RechartsWrapper.Bar dataKey="Coûts Opérationnels" fill="#f97316" isAnimationActive={false} />
              </RechartsWrapper.BarChart>
            </Suspense>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsCharts;
