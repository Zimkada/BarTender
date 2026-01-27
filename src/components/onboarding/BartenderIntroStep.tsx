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
      <div className="bg-slate-50 rounded-3xl overflow-hidden shadow-2xl border border-gray-200">
        {/* Header Section */}
        <div className="p-8 md:p-12 text-center bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 relative overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
            transition={{ duration: 20, repeat: Infinity }}
            className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg border border-white/30"
          >
            <Star className="text-white w-10 h-10 fill-current" />
          </motion.div>
          <h1 className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">Bienvenue chez {barName}</h1>
          <p className="text-purple-100 text-lg font-medium max-w-lg mx-auto leading-relaxed">
            Vous commencez aujourd'hui une nouvelle aventure. Voici comment BarTender va vous aider à briller.
          </p>
        </div>

        <div className="p-6 md:p-10 space-y-10">
          {/* Main Missions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard className="p-6 border-l-4 border-purple-500">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-100 rounded-xl text-purple-600">
                  <Beer size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 mb-1">Mission : Maître du Stock</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Chaque vente enregistrée décrémente automatiquement le stock. Pas de trous, pas d'erreurs.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 border-l-4 border-indigo-500">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 mb-1">Stats Personnelles</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Suivez vos propres performances, vos ventes totales et vos meilleurs produits servis.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 border-l-4 border-blue-500">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                  <ClipboardList size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 mb-1">Zéro Stress</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Consultez l'historique de vos commandes et les retours validés en un clin d'œil.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 border-l-4 border-emerald-500">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 mb-1">Confiance Totale</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Toutes les transactions sont sécurisées et validées par votre gérant. Travaillez l'esprit libre.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Workflow Section */}
          <div className="bg-indigo-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Users size={120} />
            </div>
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Star size={20} className="text-amber-400 fill-current" />
              Votre travail en 3 gestes :
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-lg">1</div>
                <p className="font-bold">Sélectionner</p>
                <p className="text-xs text-indigo-200">Choisissez les produits demandés par le client dans la liste.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-lg">2</div>
                <p className="font-bold">Ajuster</p>
                <p className="text-xs text-indigo-200">Vérifiez les quantités et le prix total avec le client.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-lg">3</div>
                <p className="font-bold">Encaisser</p>
                <p className="text-xs text-indigo-200">Finalisez la vente pour enregistrer la transaction.</p>
              </div>
            </div>
          </div>

          {/* Button Section */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={previousStep}
              className="text-slate-400 hover:text-slate-600 font-bold text-sm px-4 py-2 transition-all"
            >
              Retour à l'accueil
            </button>
            <LoadingButton
              type="submit"
              onClick={handleUnderstand}
              isLoading={loading}
              className="w-full md:w-auto px-12 py-4 bg-purple-600 text-white rounded-2xl font-black shadow-xl hover:bg-purple-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              C'est parti <ArrowRight size={20} />
            </LoadingButton>
          </div>
        </div>

        <div className="bg-slate-100 p-4 text-center text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">
          Module de Formation Officiel BarTender - 2026
        </div>
      </div>
    </div>
  );
};
