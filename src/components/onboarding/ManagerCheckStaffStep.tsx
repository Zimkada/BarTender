import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';

export const ManagerCheckStaffStep: React.FC = () => {
  const { stepData, completeStep, nextStep, previousStep } = useOnboarding();
  const [loading, setLoading] = useState(false);

  const staffData = stepData[OnboardingStep.OWNER_SETUP_STAFF] as any;
  const serverCount = staffData?.serverNames?.length || 0;

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.MANAGER_CHECK_STAFF, {
        staffVerified: true,
        timestamp: new Date().toISOString(),
      });
      nextStep();
    } catch (error) {
      console.error('Error confirming staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasStaff = serverCount > 0;

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-h1 text-foreground mb-2">Statut de l'équipe</h1>
          <p className="text-body-sm text-muted-foreground">
            Vérifiez si votre équipe de serveurs est configurée.
          </p>
        </div>

        <form onSubmit={handleContinue} className="space-y-5">
          {hasStaff ? (
            <div className="p-5 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-card text-green-600 flex items-center justify-center font-bold flex-shrink-0">✓</span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-h3 text-green-900">Équipe prête</h2>
                  <p className="text-body-sm text-green-800 mt-0.5">
                    <span className="font-semibold tabular-nums">{serverCount} serveur{serverCount > 1 ? 's' : ''}</span> déjà configuré{serverCount > 1 ? 's' : ''} par le propriétaire.
                  </p>
                  <div className="mt-3 space-y-1">
                    {staffData?.serverNames?.map((name: string, idx: number) => (
                      <div key={idx} className="text-caption text-green-800">• {name}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-card text-amber-600 flex items-center justify-center font-bold flex-shrink-0">!</span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-h3 text-amber-900">Aucun serveur détecté</h2>
                  <p className="text-body-sm text-amber-800 mt-0.5">
                    Pour suivre correctement les performances, vous devez avoir des comptes serveurs enregistrés.
                  </p>
                  <p className="mt-2 text-caption text-amber-800">
                    <span className="font-semibold">💡 Que faire :</span> contactez le propriétaire pour ajouter des serveurs et attribuer chaque vente à la bonne personne.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-muted border border-border rounded-xl">
            <h3 className="text-body-sm font-semibold text-foreground mb-2">À propos des serveurs</h3>
            <ul className="text-caption text-foreground/70 space-y-1">
              <li className="flex items-center gap-2"><span className="text-brand-primary">✓</span> Chaque vente est attribuée à un serveur précis</li>
              <li className="flex items-center gap-2"><span className="text-brand-primary">✓</span> Permet le suivi individuel du chiffre d'affaires</li>
              <li className="flex items-center gap-2"><span className="text-brand-primary">✓</span> Indispensable pour un reporting fiable</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t border-border">
            <button
              type="button"
              onClick={previousStep}
              className="h-11 px-5 text-body-sm font-medium text-foreground/80 border border-border rounded-xl hover:border-brand-primary hover:text-brand-primary transition-colors"
            >
              Retour
            </button>
            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Continuation…"
              className="ml-auto btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold"
            >
              Continuer
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};
