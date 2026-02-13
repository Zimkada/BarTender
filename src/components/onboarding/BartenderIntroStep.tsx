import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { Beer, Users, BarChart3, ClipboardList, ArrowRight, Star, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export const BartenderIntroStep: React.FC = () => {
  const { completeStep, nextStep, previousStep } = useOnboarding();
  const { currentBar } = useBar();
  const [loading, setLoading] = useState(false);

  const barName = currentBar?.name || 'Votre Bar';

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

  const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/90 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl ${className}`}
    >
      {children}
    </motion.div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="backdrop-blur-xl bg-white/80 border border-white/40 shadow-2xl rounded-2xl ring-1 ring-black/5 overflow-hidden">
        {/* Header Section */}
        <div className="p-8 md:p-12 text-center bg-[image:var(--brand-gradient)] relative overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
            transition={{ duration: 20, repeat: Infinity }}
            className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-16 h-16 md:w-20 md:h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 shadow-lg border border-white/30"
          >
            <Star className="text-white w-8 h-8 md:w-10 md:h-10 fill-current" />
          </motion.div>
          <h1 className="text-2xl md:text-5xl font-black text-white mb-3 md:mb-4 tracking-tight drop-shadow-md leading-tight">Bienvenue chez {barName}</h1>
          <p className="text-white/90 text-sm md:text-lg font-medium max-w-lg mx-auto leading-relaxed px-4 md:px-0">
            Vous commencez aujourd'hui une nouvelle aventure. Voici comment BarTender va vous aider à briller.
          </p>
        </div>

        <div className="p-6 md:p-10 space-y-10">
          {/* Main Missions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard className="p-6 border-l-4 border-l-[hsl(var(--brand-hue),var(--brand-saturation),50%)] !bg-white/60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-[hsl(var(--brand-hue),var(--brand-saturation),90%)] rounded-xl text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">
                  <Beer size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),15%)] mb-1">Mission : Maître du Stock</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Chaque vente enregistrée décrémente automatiquement le stock. Pas de trous, pas d'erreurs.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 border-l-4 border-l-[hsl(var(--brand-hue),var(--brand-saturation),60%)] !bg-white/60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-[hsl(var(--brand-hue),var(--brand-saturation),90%)] rounded-xl text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),15%)] mb-1">Stats Personnelles</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Suivez vos propres performances, vos ventes totales et vos meilleurs produits servis.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 border-l-4 border-l-[hsl(var(--brand-hue),var(--brand-saturation),40%)] !bg-white/60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-[hsl(var(--brand-hue),var(--brand-saturation),90%)] rounded-xl text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">
                  <ClipboardList size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),15%)] mb-1">Zéro Stress</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Consultez l'historique de vos commandes et les retours validés en un clin d'œil.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 border-l-4 border-l-[hsl(var(--brand-hue),var(--brand-saturation),70%)] !bg-white/60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-[hsl(var(--brand-hue),var(--brand-saturation),90%)] rounded-xl text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),15%)] mb-1">Confiance Totale</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Toutes les transactions sont sécurisées et validées par votre gérant. Travaillez l'esprit libre.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Workflow Section */}
          <div className="bg-[hsl(var(--brand-hue),var(--brand-saturation),20%)] rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Users size={120} />
            </div>
            <h3 className="text-lg md:text-xl font-bold mb-4 md:mb-6 flex items-center gap-2">
              <Star size={18} className="text-amber-400 fill-current" />
              Votre travail en 3 gestes :
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-lg">1</div>
                <p className="font-bold">Sélectionner</p>
                <p className="text-xs text-white/70">Choisissez les produits demandés par le client dans la liste.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-lg">2</div>
                <p className="font-bold">Ajuster</p>
                <p className="text-xs text-white/70">Vérifiez les quantités et le prix total avec le client.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-lg">3</div>
                <p className="font-bold">Encaisser</p>
                <p className="text-xs text-white/70">Finalisez la vente pour enregistrer la transaction.</p>
              </div>
            </div>
          </div>

          {/* Button Section */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between pt-6 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)]">
            <button
              type="button"
              onClick={previousStep}
              className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
            >
              Retour à l'accueil
            </button>
            <LoadingButton
              type="submit"
              onClick={handleUnderstand}
              isLoading={loading}
              className="w-full md:w-auto px-12 py-4 bg-[image:var(--brand-gradient)] text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              C'est parti <ArrowRight size={20} />
            </LoadingButton>
          </div>
        </div>

        <div className="bg-[hsl(var(--brand-hue),var(--brand-saturation),98%)] p-4 text-center text-[10px] uppercase font-black tracking-[0.2em] text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)]">
          Module de Formation Officiel BarTender - 2026
        </div>
      </div>
    </div>
  );
};
