import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';

export const ManagerRoleConfirmStep: React.FC = () => {
  const { completeStep, nextStep, previousStep } = useOnboarding();
  const { currentBar } = useBar();
  const [loading, setLoading] = useState(false);

  const barName = currentBar?.name || 'Votre bar';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.MANAGER_ROLE_CONFIRM, {
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming role:', error);
    } finally {
      setLoading(false);
    }
  };

  const responsibilities = [
    { title: 'Créer des ventes', desc: 'Enregistrer les transactions, appliquer les promotions.' },
    { title: 'Opérations (stock & retours)', desc: 'Gérer le stock, les approvisionnements, les retours et consignations.' },
    { title: 'Voir les analytiques', desc: 'Ventes quotidiennes, top produits, performance de l\'équipe.' },
  ];

  const delegableTasks = [
    'Configurer les paramètres du bar',
    'Ajouter des produits au catalogue',
    'Initialiser le stock',
    'Créer des comptes serveurs',
  ];

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-h1 text-gray-900 mb-2">Bienvenue, gérant</h1>
          <p className="text-body-sm text-gray-500">
            Vous avez été ajouté au bar <span className="font-semibold text-gray-900">{barName}</span>.
          </p>
        </div>

        <form onSubmit={handleConfirm} className="space-y-5">
          {/* Role Overview */}
          <div className="p-5 bg-brand-subtle border border-brand-subtle rounded-xl">
            <h2 className="text-h3 text-gray-900 mb-3">Votre rôle</h2>
            <div className="space-y-3">
              {responsibilities.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-white text-brand-primary flex items-center justify-center text-caption font-bold flex-shrink-0 mt-0.5">✓</span>
                  <div>
                    <p className="text-body-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-caption text-gray-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delegable Tasks */}
          <div className="p-5 bg-gray-50 border border-gray-100 rounded-xl">
            <h2 className="text-body-sm font-semibold text-gray-900 mb-1">💡 Vous pouvez aider le propriétaire</h2>
            <p className="text-caption text-gray-600 mb-3">
              Le propriétaire peut vous demander de configurer certaines tâches pour le bar.
            </p>
            <div className="space-y-2">
              {delegableTasks.map((task) => (
                <div key={task} className="flex items-center gap-2.5">
                  <span className="text-brand-primary text-caption font-bold">✓</span>
                  <span className="text-body-sm text-gray-700">{task}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-5 bg-gray-50 border border-gray-100 rounded-xl">
            <h3 className="text-body-sm font-semibold text-gray-900 mb-3">Prochaines étapes</h3>
            <ol className="text-body-sm text-gray-700 space-y-2">
              {['Tour rapide du tableau de bord', 'Apprendre à créer votre première vente', 'Commencer à travailler !'].map((step, idx) => (
                <li key={idx} className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-subtle text-brand-primary flex items-center justify-center text-caption font-semibold tabular-nums flex-shrink-0">{idx + 1}</span>
                  <span className="flex-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Tip */}
          <div className="p-4 bg-brand-subtle/50 border border-brand-subtle rounded-xl">
            <p className="text-caption text-gray-700 leading-relaxed">
              <span className="font-semibold text-gray-900">💡 Conseil :</span> cliquez sur le bouton <span className="font-medium text-brand-primary">Guide (?)</span> en haut à droite pour lancer une visite guidée.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={previousStep}
              className="h-11 px-5 text-body-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:border-brand-primary hover:text-brand-primary transition-colors"
            >
              Retour
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Continuation…"
              className="ml-auto btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold"
            >
              J'ai compris
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
