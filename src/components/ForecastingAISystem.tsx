import { useState } from 'react';
import {
  ShoppingCart,
  Check,
  BarChart3,
  DollarSign
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '../hooks/useViewport';
import { TabbedPageHeader } from './common/PageHeader/patterns/TabbedPageHeader';

type ForecastView = 'sales' | 'advanced';

export function ForecastingAISystem() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const [activeTab, setActiveTab] = useState<ForecastView>('sales');

  const tabsConfig = [
    { id: 'sales', label: isMobile ? 'Prévisions' : 'Prévisions de Ventes', icon: BarChart3 },
    { id: 'advanced', label: isMobile ? 'Assistant IA' : 'Assistant Intelligent IA', icon: ShoppingCart },
  ];

  return (
    <div className="flex flex-col gap-4">
      <TabbedPageHeader
        title="📈 Prévisions et IA"
        subtitle="Analyses prédictives et assistant intelligent"
        tabs={tabsConfig}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as ForecastView)}
        guideId="forecasting-guide"
        onBack={() => navigate(-1)}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          <>
            {activeTab === 'sales' && (
              <SalesForecastView />
            )}

            {activeTab === 'advanced' && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400 py-12 px-6">
                  <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-inner">
                    <ShoppingCart size={40} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Assistant IA Intelligent</h3>
                  <p className="text-gray-500 max-w-sm mx-auto leading-relaxed">
                    {/* TODO: Intégrer l'Assistant avec un LLM (OpenAI/Mistral) pour l'analyse conversationnelle des données */}
                    Votre coach personnel entraîné sur vos données arrive bientôt pour répondre à vos questions sur la rentabilité.
                  </p>
                  <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    En cours de développement
                  </div>
                </div>
              </div>
            )}
          </>
        </div>
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function SalesForecastView() {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6 lg:p-12">
      <div className="text-center max-w-2xl bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <DollarSign size={40} className="text-amber-500" />
        </div>
        <h3 className="text-2xl font-bold text-gray-800 mb-3">
          Prévisions de Croissance
        </h3>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          {/* TODO: Implémenter le graphique de projection linéaire basé sur les services passés */}
          Nous collectons les données de vos ventes pour générer des courbes de tendance fiables.
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 text-left">
          <h4 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
            <Check size={18} /> Vision Stratégique :
          </h4>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-amber-800/80">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>CA estimé sur le mois prochain</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>Optimisation des heures de pointe</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>Tendance de consommation hebdomadaire</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>Ajustement dynamique des marges</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
