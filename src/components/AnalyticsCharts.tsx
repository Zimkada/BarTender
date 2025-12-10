import React, { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Select } from './ui/Select';

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
          <LineChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Revenus" stroke="#10b981" strokeWidth={2} />
            <Line type="monotone" dataKey="Coûts Opérationnels" stroke="#f97316" strokeWidth={2} />
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
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Revenus" fill="#10b981" />
              <Bar dataKey="Coûts Opérationnels" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsCharts;
