import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

interface RefreshLog {
  id: string;
  view_name: string;
  status: 'success' | 'failed' | 'timeout';
  duration_ms: number | null;
  refresh_started_at: string;
  refresh_completed_at: string | null;
  created_at: string;
}

interface RefreshHistoryChartProps {
  logs: RefreshLog[];
  chartType?: 'line' | 'area' | 'bar' | 'pie';
}

const STATUS_COLORS = {
  success: '#10b981', // green-500
  failed: '#ef4444',  // red-500
  timeout: '#f59e0b', // amber-500
};

export function RefreshHistoryChart({ logs, chartType = 'line' }: RefreshHistoryChartProps) {
  // Prepare data for duration timeline
  const durationData = logs
    .filter((log) => log.duration_ms !== null && log.status === 'success')
    .map((log) => ({
      time: new Date(log.created_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      duration: log.duration_ms,
      view: log.view_name,
    }))
    .slice(-20); // Last 20 refreshes

  // Prepare data for status pie chart
  const statusCounts = logs.reduce(
    (acc, log) => {
      acc[log.status] = (acc[log.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const statusData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
    color: STATUS_COLORS[status as keyof typeof STATUS_COLORS],
  }));

  // Prepare data for avg duration by view
  const viewStats = logs.reduce(
    (acc, log) => {
      if (log.status === 'success' && log.duration_ms !== null) {
        if (!acc[log.view_name]) {
          acc[log.view_name] = { total: 0, count: 0 };
        }
        acc[log.view_name].total += log.duration_ms;
        acc[log.view_name].count += 1;
      }
      return acc;
    },
    {} as Record<string, { total: number; count: number }>
  );

  const avgDurationData = Object.entries(viewStats).map(([view, stats]) => ({
    view: view.replace('_mat', '').replace(/_/g, ' '),
    avgDuration: Math.round(stats.total / stats.count),
  }));

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Aucune donnée à afficher
      </div>
    );
  }

  // Line Chart: Duration over time
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={durationData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis label={{ value: 'Durée (ms)', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="duration"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6' }}
            name="Durée (ms)"
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Area Chart: Duration trend
  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={durationData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis label={{ value: 'Durée (ms)', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="duration"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.3}
            name="Durée (ms)"
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Bar Chart: Average duration by view
  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={avgDurationData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="view" angle={-45} textAnchor="end" height={80} />
          <YAxis label={{ value: 'Avg Durée (ms)', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="avgDuration" fill="#8b5cf6" name="Durée Moyenne (ms)" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Pie Chart: Status distribution
  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={statusData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {statusData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
}
