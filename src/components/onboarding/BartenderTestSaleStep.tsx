import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';
import { CheckCircle2, LayoutDashboard, Rocket, Zap, ShieldCheck, Star } from 'lucide-react';

export const BartenderTestSaleStep: React.FC = () => {
  const navigate = useNavigate();
  const { completeStep, completeOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      completeStep(OnboardingStep.BARTENDER_TEST_SALE, {
        timestamp: new Date().toISOString(),
      });

      completeOnboarding();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Error finishing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { icon: Star, label: 'Niveau', value: 'Certifié' },
    { icon: Zap, label: 'Vitesse', value: 'Optimale' },
    { icon: ShieldCheck, label: 'Sécurité', value: 'Garantie' },
  ];

  const nextSteps = [
    { icon: Rocket, title: 'Coup d\'envoi', desc: 'Accédez à votre tableau de bord personnel.' },
    { icon: Zap, title: 'Première vente', desc: 'Commencez à enregistrer vos ventes réelles dès maintenant.' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
        {/* Success Header */}
        <div className="p-10 text-center bg-brand-gradient text-white">
          <div className="w-16 h-16 bg-card/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white/20">
            <CheckCircle2 size={32} className="text-white" />
          </div>
          <h1 className="text-h1 text-white mb-2">Certification terminée</h1>
          <p className="text-body text-white/85 max-w-md mx-auto">
            Vous avez complété votre formation BarTender Academy.
          </p>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="text-center p-4 bg-muted border border-border rounded-xl">
                <div className="w-9 h-9 bg-brand-subtle rounded-lg flex items-center justify-center mx-auto mb-2 text-brand-primary">
                  <Icon size={18} />
                </div>
                <p className="text-micro text-muted-foreground">{label}</p>
                <p className="text-body-sm font-semibold text-brand-primary">{value}</p>
              </div>
            ))}
          </div>

          {/* Next Steps */}
          <div className="space-y-3">
            <h3 className="text-micro text-muted-foreground text-center">Vos prochaines étapes</h3>
            <div className="space-y-2.5">
              {nextSteps.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-3 p-3.5 bg-muted border border-border rounded-xl">
                  <div className="w-9 h-9 bg-brand-subtle rounded-lg flex items-center justify-center text-brand-primary flex-shrink-0">
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-body-sm font-semibold text-foreground">{title}</h4>
                    <p className="text-caption text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips Banner */}
          <div className="bg-gray-900 rounded-2xl p-5 text-white flex items-center gap-4">
            <div className="w-11 h-11 bg-card/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
              <LayoutDashboard size={20} className="text-brand-primary" />
            </div>
            <div className="flex-1">
              <h4 className="text-body-sm font-semibold mb-0.5">Rappel</h4>
              <p className="text-caption text-white/70 leading-relaxed">
                Toutes vos ventes sont suivies individuellement. Plus vous êtes précis, plus vous gagnez la confiance de votre équipe.
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center pt-6 border-t border-border">
            <LoadingButton
              onClick={handleFinish}
              isLoading={loading}
              className="btn-brand h-12 px-8 rounded-xl text-body-sm font-semibold flex items-center gap-2"
            >
              Lancer le tableau de bord <Rocket size={16} />
            </LoadingButton>
          </div>
        </div>

        <div className="bg-muted p-3 text-center text-micro text-muted-foreground border-t border-border">
          Système certifié BarTender Academy — 2026
        </div>
      </div>
    </div>
  );
};
