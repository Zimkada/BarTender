import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { Beer, BarChart3, ClipboardList, ArrowRight, Star, ShieldCheck } from 'lucide-react';

export const BartenderIntroStep: React.FC = () => {
  const { completeStep, nextStep, previousStep } = useOnboarding();
  const { currentBar } = useBar();
  const [loading, setLoading] = useState(false);

  const barName = currentBar?.name || 'Votre bar';

  const handleUnderstand = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_INTRO, {
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming intro:', error);
    } finally {
      setLoading(false);
    }
  };

  const missions = [
    { icon: Beer, title: 'Maître du stock', desc: 'Chaque vente décrémente automatiquement le stock. Pas de trous, pas d\'erreurs.' },
    { icon: BarChart3, title: 'Stats personnelles', desc: 'Suivez vos performances, vos ventes totales et vos meilleurs produits servis.' },
    { icon: ClipboardList, title: 'Zéro stress', desc: 'Consultez l\'historique de vos commandes et les retours validés en un clin d\'œil.' },
    { icon: ShieldCheck, title: 'Confiance totale', desc: 'Toutes les transactions sont sécurisées et validées par votre gérant.' },
  ];

  const workflow = [
    { num: 1, label: 'Sélectionner', desc: 'Choisissez les produits demandés par le client.' },
    { num: 2, label: 'Ajuster', desc: 'Vérifiez les quantités et le prix total.' },
    { num: 3, label: 'Encaisser', desc: 'Finalisez la vente pour enregistrer la transaction.' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-8 md:p-10 text-center bg-brand-gradient text-white">
          <div className="w-14 h-14 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <Star className="text-white w-7 h-7 fill-current" />
          </div>
          <h1 className="text-h1 text-white mb-2">Bienvenue chez {barName}</h1>
          <p className="text-body text-white/85 max-w-lg mx-auto">
            Voici comment BarTender va vous aider à briller au quotidien.
          </p>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* Missions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {missions.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-brand-subtle rounded-lg text-brand-primary flex items-center justify-center flex-shrink-0">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-body-sm font-semibold text-gray-900 mb-0.5">{title}</h3>
                    <p className="text-caption text-gray-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Workflow Section */}
          <div className="bg-gray-900 rounded-2xl p-6 text-white">
            <h3 className="text-body-sm font-semibold mb-5 flex items-center gap-2">
              <Star size={14} className="text-brand-primary fill-current" />
              Votre travail en 3 gestes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {workflow.map((step) => (
                <div key={step.num} className="space-y-2">
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-body-sm font-semibold tabular-nums">{step.num}</div>
                  <p className="text-body-sm font-semibold">{step.label}</p>
                  <p className="text-caption text-white/60 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={previousStep}
              className="text-caption text-gray-400 hover:text-gray-600 font-medium px-3 py-2 transition-colors order-2 sm:order-1"
            >
              Retour à l'accueil
            </button>
            <LoadingButton
              type="submit"
              onClick={handleUnderstand}
              isLoading={loading}
              className="btn-brand w-full sm:w-auto h-11 px-6 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2 order-1 sm:order-2"
            >
              C'est parti <ArrowRight size={16} />
            </LoadingButton>
          </div>
        </div>

        <div className="bg-gray-50 p-3 text-center text-micro text-gray-400 border-t border-gray-100">
          Module de formation officiel BarTender — 2026
        </div>
      </div>
    </div>
  );
};
