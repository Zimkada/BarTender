import React, { useState } from 'react';
import { Select } from './ui/Select';
import {
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
} from './charts/RechartsWrapper';

// Palette brand (Vision 2026)
const COLORS = [
  'var(--brand-primary)', // Brand Primary
  '#3b82f6', // Bleu (Services/Eau)
  'var(--brand-dark)',    // Brand Dark
  '#6b7280', // Gris
  '#a855f7', // Violet
  '#10b981', // Emeraude
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
          <LineChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="Revenus"
              stroke="var(--brand-primary)"
              strokeWidth={3}
              dot={{ fill: 'var(--brand-primary)', r: 5, strokeWidth: 0 }}
              activeDot={{ r: 7 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Coûts Opérationnels"
              stroke="var(--brand-dark)"
              strokeWidth={3}
              dot={{ fill: 'var(--brand-dark)', r: 5, strokeWidth: 0 }}
              activeDot={{ r: 7 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Répartition Dépenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <h3 className="font-semibold mb-4">Répartition des Dépenses Opérationnelles</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
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
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Revenus vs Dépenses */}
        <div>
          <h3 className="font-semibold mb-4">Revenus vs. Coûts Opérationnels</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Revenus" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Coûts Opérationnels" fill="var(--brand-dark)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsCharts;
