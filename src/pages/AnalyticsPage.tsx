// src/pages/AnalyticsPage.tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { Button } from '../components/ui/Button';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { useUnifiedExpenses } from '../hooks/pivots/useUnifiedExpenses';

import AnalyticsCharts from '../components/AnalyticsCharts';

/**
 * Page Analytics - Wrapper pour AnalyticsCharts avec données
 * Route: /analytics
 */
export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { currentBar } = useBarContext();
  const { sales } = useUnifiedSales(currentBar?.id);
  const { expenses } = useUnifiedExpenses(currentBar?.id);

  // Générer les données pour les graphiques (12 derniers mois)
  const chartData = useMemo(() => {
    const months: { [key: string]: { revenue: number; costs: number } } = {};
    const now = new Date();

    // Initialiser les 12 derniers mois
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      months[key] = { revenue: 0, costs: 0 };
    }

    // Agréger les ventes
    sales
      .filter(s => s.status === 'validated')
      .forEach(sale => {
        const date = new Date((sale as any).businessDate || (sale as any).createdAt || (sale as any).business_date || (sale as any).created_at);
        const key = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        if (months[key]) {
          months[key].revenue += sale.total;
        }
      });

    // Agréger les dépenses
    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const key = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      if (months[key]) {
        months[key].costs += expense.amount;
      }
    });

    return Object.entries(months).map(([name, data]) => ({
      name,
      'Revenus': data.revenue,
      'Coûts Opérationnels': data.costs,
    }));
  }, [sales, expenses]);

  // Dépenses par catégorie
  const expensesByCategory = useMemo(() => {
    const categories: { [key: string]: { label: string; amount: number } } = {
      supply: { label: 'Approvisionnements', amount: 0 },
      utilities: { label: 'Services', amount: 0 },
      salary: { label: 'Salaires', amount: 0 },
      maintenance: { label: 'Entretien', amount: 0 },
      other: { label: 'Autres', amount: 0 },
    };

    expenses.forEach(expense => {
      const cat = expense.category || 'other';
      if (categories[cat]) {
        categories[cat].amount += expense.amount;
      } else {
        categories.other.amount += expense.amount;
      }
    });

    return categories;
  }, [expenses]);

  if (!currentBar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Sélectionnez un bar pour voir les analytics</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-subtle mb-6 overflow-hidden" data-guide="analytics-header">
        <div className="bg-brand-primary text-white p-6" style={{ background: 'var(--brand-gradient)' }}>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-lg transition-colors hover:bg-white/20"
            >
              <ArrowLeft size={24} />
            </Button>
            <div className="flex items-center gap-3">
              <BarChart3 size={28} />
              <div>
                <h1 className="text-xl font-bold">Analytics</h1>
                <p className="opacity-80 text-sm">Statistiques de {currentBar.name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-subtle p-6 min-h-[400px]" data-guide="analytics-charts">
        <AnalyticsCharts
          data={chartData}
          expensesByCategory={expensesByCategory}
        />
      </div>
    </div>
  );
}
