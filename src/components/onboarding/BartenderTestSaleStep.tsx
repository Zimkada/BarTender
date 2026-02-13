import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';
import { CheckCircle2, LayoutDashboard, Rocket, Zap, ShieldCheck, Star } from 'lucide-react';
import { motion } from 'framer-motion';

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

  const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`backdrop-blur-md bg-white/60 border border-white/40 shadow-xl rounded-2xl ${className}`}
    >
      {children}
    </motion.div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="backdrop-blur-xl bg-white/80 border border-white/40 shadow-2xl rounded-3xl overflow-hidden ring-1 ring-black/5">
        {/* Success Header */}
        <div className="p-12 text-center bg-[image:var(--brand-gradient)] relative overflow-hidden text-white">
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, -90, 0] }}
            transition={{ duration: 20, repeat: Infinity }}
            className="absolute -top-24 -left-24 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none"
          />

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl border-4 border-white/30"
          >
            <CheckCircle2 size={56} className="text-white" />
          </motion.div>

          <h1 className="text-2xl md:text-5xl font-black mb-3 md:mb-4 tracking-tighter drop-shadow-sm leading-tight">Certification Terminée !</h1>
          <p className="text-white/90 text-base md:text-xl font-medium max-w-lg mx-auto leading-relaxed px-4 md:px-0">
            Félicitations. Vous avez complété avec succès votre formation BarTender Academy.
          </p>
        </div>

        <div className="p-6 md:p-12 space-y-8 md:space-y-12 bg-[hsl(var(--brand-hue),var(--brand-saturation),99%)]">
          {/* Summary Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard className="p-6 text-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                <Star size={24} />
              </div>
              <h4 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] text-sm mb-1 italic">Niveau</h4>
              <p className="text-xl font-black text-[hsl(var(--brand-hue),var(--brand-saturation),50%)]">CERTIFIÉ</p>
            </GlassCard>

            <GlassCard className="p-6 text-center border-t-4 border-amber-400">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4 text-amber-600">
                <Zap size={24} />
              </div>
              <h4 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] text-sm mb-1 italic">Vitesse</h4>
              <p className="text-xl font-black text-amber-600">OPTIMAL</p>
            </GlassCard>

            <GlassCard className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                <ShieldCheck size={24} />
              </div>
              <h4 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] text-sm mb-1 italic">Sécurité</h4>
              <p className="text-xl font-black text-blue-600">GARANTIE</p>
            </GlassCard>
          </div>

          <div className="space-y-6">
            <h3 className="text-center text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] font-black text-xs uppercase tracking-[0.3em]">Vos Prochaines Étapes</h3>

            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="flex items-center gap-5 p-5 bg-white rounded-2xl border border-white/60 shadow-sm group hover:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] transition-all">
                <div className="w-10 h-10 bg-[hsl(var(--brand-hue),var(--brand-saturation),95%)] rounded-lg flex items-center justify-center text-[hsl(var(--brand-hue),var(--brand-saturation),60%)] group-hover:bg-[hsl(var(--brand-hue),var(--brand-saturation),60%)] group-hover:text-white transition-all">
                  <Rocket size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800">Coup d'envoi</h4>
                  <p className="text-sm text-gray-500">Accédez à votre tableau de bord personnel.</p>
                </div>
              </div>

              <div className="flex items-center gap-5 p-5 bg-white rounded-2xl border border-white/60 shadow-sm group hover:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] transition-all">
                <div className="w-10 h-10 bg-[hsl(var(--brand-hue),var(--brand-saturation),95%)] rounded-lg flex items-center justify-center text-[hsl(var(--brand-hue),var(--brand-saturation),60%)] group-hover:bg-[hsl(var(--brand-hue),var(--brand-saturation),60%)] group-hover:text-white transition-all">
                  <Zap size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800">Première Vente</h4>
                  <p className="text-sm text-gray-500">Commencez à enregistrer vos ventes réelles dès maintenant.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tips Banner */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-[hsl(var(--brand-hue),var(--brand-saturation),15%)] rounded-3xl p-8 text-white flex flex-col md:flex-row items-center gap-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--brand-hue),var(--brand-saturation),50%)]/20 rounded-full -mr-16 -mt-16 blur-xl" />
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/10">
              <LayoutDashboard size={32} className="text-[hsl(var(--brand-hue),var(--brand-saturation),60%)]" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="font-bold text-xl mb-1">Rappel de Pro</h4>
              <p className="text-white/60 text-sm leading-relaxed">
                Toutes vos ventes sont suivies individuellement. Plus vous êtes précis, plus vous gagnez la confiance de votre équipe.
              </p>
            </div>
          </motion.div>

          {/* Action Button */}
          <div className="flex justify-center pt-8 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)]">
            <LoadingButton
              onClick={handleFinish}
              isLoading={loading}
              className="px-16 py-5 bg-[image:var(--brand-gradient)] text-white rounded-2xl font-black shadow-xl hover:shadow-[hsl(var(--brand-hue),var(--brand-saturation),50%)]/40 hover:-translate-y-1 transition-all uppercase tracking-[0.1em] text-lg flex items-center gap-3"
            >
              Lancer le Dashboard <Rocket size={24} />
            </LoadingButton>
          </div>
        </div>

        <div className="bg-[hsl(var(--brand-hue),var(--brand-saturation),98%)] p-4 text-center text-[10px] uppercase font-black tracking-[0.2em] text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">
          Système Certifié BarTender Academy • 2026
        </div>
      </div>
    </div>
  );
};
