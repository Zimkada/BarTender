import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';
import { ShoppingCart, ArrowRight, AlertCircle, ShieldCheck, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type DemoPhase =
  | 'intro'
  // Scenario 1: Simplified
  | 'sim_intro'
  | 'sim_mapping'
  | 'sim_action'
  | 'sim_success'
  // Scenario 2: Full
  | 'full_intro'
  | 'full_validate' // Action 1: Validate Rose
  | 'full_reject'   // Action 2: Reject Sandra
  | 'full_success'
  // End
  | 'complete';

export const ManagerTourStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const [phase, setPhase] = useState<DemoPhase>('intro');
  const [loading, setLoading] = useState(false);

  // Sim State
  const [selectedServer, setSelectedServer] = useState('');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
  const [validatedOrders, setValidatedOrders] = useState<string[]>([]);
  const [rejectedOrders, setRejectedOrders] = useState<string[]>([]);

  const handleContinue = async () => {
    setLoading(true);
    try {
      completeStep(OnboardingStep.MANAGER_TOUR, {
        timestamp: new Date().toISOString(),
        completedTour: true
      });
      nextStep();
    } catch (error) {
      console.error('Error finishing tour:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- PREMIUM COMPONENTS ---

  const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/80 backdrop-blur-md border border-white/40 shadow-xl rounded-2xl ${className}`}
    >
      {children}
    </motion.div>
  );

  const renderHeader = () => {
    let title = "Académie BarTender";
    let subtitle = "Maîtrisez votre établissement avec élégance.";
    let gradient = "from-slate-900 via-slate-800 to-slate-900";

    switch (phase) {
      case 'intro':
        title = "🚀 Académie BarTender";
        subtitle = "Devenez un Gérant Pro en moins de 2 minutes.";
        gradient = "from-amber-500 via-amber-600 to-amber-700";
        break;
      case 'sim_intro':
      case 'sim_mapping':
      case 'sim_action':
        title = "Mission : La Vente Directe";
        subtitle = "Le mode simplifié pour une gestion centralisée.";
        gradient = "from-amber-500 via-amber-600 to-amber-700";
        break;
      case 'sim_success':
        title = "Vente Réussie !";
        subtitle = "Mapping parfait, Afi peut être fière.";
        gradient = "from-amber-500 via-amber-600 to-amber-700";
        break;
      case 'full_intro':
      case 'full_validate':
      case 'full_reject':
        title = "Mission : Le Contrôle";
        subtitle = "Le mode complet pour déléguer en toute sécurité.";
        gradient = "from-amber-500 via-amber-600 to-amber-700";
        break;
      case 'full_success':
      case 'complete':
        title = "Certification Obtenue !";
        subtitle = "Vous êtes officiellement un Gérant Certifié.";
        gradient = "from-amber-500 via-amber-600 to-amber-700";
        break;
    }

    return (
      <div className={`p-8 text-center transition-all duration-700 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
        {/* Animated background element */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"
        />
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3 tracking-tight drop-shadow-sm">{title}</h1>
        <p className="text-white/90 text-lg font-medium max-w-lg mx-auto leading-relaxed">{subtitle}</p>
      </div>
    );
  };

  // --- SCENARIO 1: SIMPLIFIED MODE ---
  const renderSimplifiedScenario = () => {
    return (
      <div className="flex flex-col h-full py-4 text-center">
        <AnimatePresence mode="wait">
          {phase === 'sim_intro' && (
            <motion.div
              key="sim-intro"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="space-y-6"
            >
              <div className="w-20 h-20 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto shadow-inner transform rotate-3">
                <ShoppingCart className="text-amber-600 w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">Le Mode Simplifié</h3>
                <p className="text-gray-600 max-w-sm mx-auto leading-relaxed">
                  Centralisez tout sur un seul appareil. Idéal si vos serveurs n'ont pas de smartphone ou pour un service rapide au comptoir.
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-amber-100 flex items-start gap-3 text-left max-w-sm mx-auto">
                <ShieldCheck className="text-amber-500 shrink-0 mt-1" size={20} />
                <p className="text-sm text-amber-800">
                  Le <strong>Mapping</strong> est le "pont" : il lie les noms de serveurs que vous sélectionnez au comptoir aux comptes réels des serveurs pour le calcul automatique du CA.
                </p>
              </div>
              <button
                onClick={() => setPhase('sim_mapping')}
                className="group px-8 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all shadow-lg hover:shadow-amber-200/50 flex items-center gap-2 mx-auto"
              >
                Maîtriser le Mapping <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}

          {phase === 'sim_mapping' && (
            <motion.div
              key="sim-mapping"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <GlassCard className="p-6 max-w-sm mx-auto">
                <h4 className="font-bold text-gray-800 mb-2 text-sm uppercase tracking-widest flex items-center justify-center gap-2">
                  <Zap size={14} className="text-amber-500" /> Le Mapping des Serveurs
                </h4>
                <div className="mb-6 p-2 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Paramètres &gt; Onglet Gestion</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Gestion Équipe &gt; Onglet Caisses</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { from: "Afi", to: "Afi Denise" },
                    { from: "Rose", to: "Rose Sandra" }
                  ].map((m, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      key={m.from}
                      className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm group hover:border-amber-300 transition-colors"
                    >
                      <span className="font-bold text-gray-700">{m.from}</span>
                      <ArrowRight size={14} className="text-amber-300 group-hover:text-amber-500 transition-colors" />
                      <span className="text-xs bg-amber-50 text-amber-700 font-bold px-3 py-1.5 rounded-lg border border-amber-100">
                        {m.to}
                      </span>
                    </motion.div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-6 italic">
                  L'app reconnaît "Afi" et sait que c'est "Afi Denise". Votre Chiffre d'Affaires est ainsi toujours juste.
                </p>
              </GlassCard>
              <button
                onClick={() => setPhase('sim_action')}
                className="px-8 py-4 bg-amber-500 text-white rounded-xl font-bold shadow-xl hover:bg-amber-600 transition-all active:scale-95"
              >
                Enregistrer une vente pour Afi →
              </button>
            </motion.div>
          )}

          {(phase === 'sim_action' || phase === 'sim_success') && (
            <motion.div
              key="sim-action"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm mx-auto"
            >
              <div className="bg-white border-2 border-amber-100 rounded-3xl shadow-2xl overflow-hidden">
                <div className="bg-amber-50/50 p-4 border-b flex justify-between items-center">
                  <span className="font-black text-gray-800 tracking-tight">CAISSE PRO</span>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 font-medium">2x Coca-Cola</span>
                      <span className="font-bold text-gray-900">1 000 FCFA</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 font-medium">1x Beaufort</span>
                      <span className="font-bold text-gray-900">600 FCFA</span>
                    </div>
                    <div className="pt-4 border-t-2 border-dashed border-gray-100 flex justify-between items-baseline">
                      <span className="text-lg font-bold text-gray-900">Total</span>
                      <span className="text-2xl font-black text-amber-600">1 600 FCFA</span>
                    </div>
                  </div>

                  <div className={`space-y-2 mt-6 p-1 rounded-2xl transition-all ${!selectedServer ? 'ring-4 ring-amber-400/20' : ''}`}>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
                      Vendeur responsable
                    </label>
                    <select
                      className="w-full p-4 bg-gray-50 border-none rounded-xl font-bold text-gray-800 transition-all focus:ring-2 focus:ring-amber-500 focus:bg-white"
                      value={selectedServer}
                      onChange={(e) => setSelectedServer(e.target.value)}
                      disabled={phase === 'sim_success'}
                    >
                      <option value="">-- Qui a vendu ? --</option>
                      <option value="Afi">Afi</option>
                      <option value="Sandra">Sandra</option>
                      <option value="Rose">Rose</option>
                    </select>
                  </div>

                  <div className={`space-y-2 p-1 rounded-2xl transition-all ${selectedServer && !selectedPaymentMode ? 'ring-4 ring-amber-400/20' : ''}`}>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
                      Mode de paiement
                    </label>
                    <select
                      className="w-full p-4 bg-gray-50 border-none rounded-xl font-bold text-gray-800 transition-all focus:ring-2 focus:ring-amber-500 focus:bg-white"
                      value={selectedPaymentMode}
                      onChange={(e) => setSelectedPaymentMode(e.target.value)}
                      disabled={phase === 'sim_success'}
                    >
                      <option value="">-- Mode de paiement --</option>
                      <option value="cash">Espèces</option>
                      <option value="momo">Mobile Money</option>
                      <option value="card">Carte Bancaire</option>
                    </select>
                  </div>

                  <button
                    disabled={!selectedServer || !selectedPaymentMode || phase === 'sim_success'}
                    onClick={() => setPhase('sim_success')}
                    className={`w-full py-5 rounded-2xl font-black text-lg transition-all transform shadow-lg
                        ${(!selectedServer || !selectedPaymentMode)
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                        : phase === 'sim_success'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                      }`}
                  >
                    {phase === 'sim_success' ? "Vente Encaissée ✓" : "Valider l'Encaissement"}
                  </button>

                  {phase === 'sim_success' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center space-y-4 pt-4"
                    >
                      <p className="text-sm font-bold text-emerald-700">Parfait ! Afi a été créditée.</p>
                      <button
                        onClick={() => {
                          setPhase('full_intro');
                          setSelectedServer('');
                        }}
                        className="px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-bold shadow-lg hover:shadow-amber-200/50 transition-all flex items-center gap-2 mx-auto"
                      >
                        Mission Suivante <ArrowRight size={18} />
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // --- SCENARIO 2: FULL MODE (Pending Orders) ---
  const renderFullScenario = () => {
    return (
      <div className="flex flex-col h-full py-4 text-center">
        <AnimatePresence mode="wait">
          {phase === 'full_intro' && (
            <motion.div
              key="full-intro"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="w-20 h-20 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto shadow-inner transform -rotate-3">
                <ShieldCheck className="text-amber-600 w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">Le Mode Complet</h3>
                <p className="text-gray-600 max-w-sm mx-auto leading-relaxed">
                  Déléguez en toute sérénité. Vos serveurs ont l'appli, mais vous gardez le dernier mot sur le stock et les ventes.
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-amber-100 flex items-start gap-3 text-left max-w-sm mx-auto">
                <AlertCircle className="text-amber-500 shrink-0 mt-1" size={20} />
                <p className="text-sm text-amber-800">
                  Validez les commandes sérieuses, rejetez les erreurs. Simple et sécurisé.
                </p>
              </div>
              <button
                onClick={() => setPhase('full_validate')}
                className="px-8 py-4 bg-amber-600 text-white rounded-xl font-bold shadow-xl hover:bg-amber-700 transition"
              >
                Accéder au Poste de Contrôle →
              </button>
            </motion.div>
          )}

          {(!phase.includes('intro') && !phase.includes('mapping')) && (
            <motion.div
              key="full-action"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm mx-auto space-y-4"
            >
              <div className="bg-gray-100/50 p-3 rounded-xl border border-dashed border-gray-300 flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <Zap size={10} /> Tableau de Bord / Commandes
              </div>

              {/* Order 1: Rose */}
              <AnimatePresence>
                {!validatedOrders.includes('order1') && (
                  <motion.div
                    exit={{ opacity: 0, scale: 0.9, x: 50 }}
                    className={`bg-white p-5 rounded-2xl shadow-xl border-l-4 transition-all ${phase === 'full_validate' ? 'border-l-amber-500' : 'border-l-gray-300 opacity-50'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center font-black text-amber-600">R</div>
                        <div className="text-left">
                          <div className="font-black text-gray-900">Rose</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">2x Flag • 1 000 FCFA</div>
                        </div>
                      </div>
                      {phase === 'full_validate' && (
                        <div className="bg-amber-100 px-2 py-1 rounded text-[10px] font-black text-amber-600 animate-pulse">ACTION REQUISE</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button disabled className="flex-1 py-2 bg-gray-50 text-gray-300 rounded-lg text-xs font-bold">REJETER</button>
                      <button
                        disabled={phase !== 'full_validate'}
                        onClick={() => {
                          setValidatedOrders([...validatedOrders, 'order1']);
                          setPhase('full_reject');
                        }}
                        className={`flex-1 py-2 rounded-lg text-xs font-black shadow-md transition-all
                            ${phase === 'full_validate' ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-gray-100 text-gray-400'}
                         `}
                      >
                        VALIDER
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Order 2: Sandra */}
              <AnimatePresence>
                {!rejectedOrders.includes('order2') && (
                  <motion.div
                    exit={{ opacity: 0, scale: 0.9, x: -50 }}
                    key="order-sandra"
                    className={`bg-white p-5 rounded-2xl shadow-xl border-l-4 transition-all ${phase === 'full_reject' ? 'border-l-red-500' : 'border-l-gray-300 opacity-50'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-black text-orange-600">S</div>
                        <div className="text-left">
                          <div className="font-black text-gray-900">Sandra</div>
                          <div className="text-[10px] text-red-500 font-black uppercase tracking-tight flex items-center gap-1">
                            <AlertCircle size={10} /> Erreur signalée
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={phase !== 'full_reject'}
                        onClick={() => {
                          setRejectedOrders([...rejectedOrders, 'order2']);
                          setPhase('full_success');
                        }}
                        className={`flex-1 py-2 rounded-lg text-xs font-black shadow-md transition-all
                            ${phase === 'full_reject' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-100 text-gray-400'}
                         `}
                      >
                        REJETER
                      </button>
                      <button disabled className="flex-1 py-2 bg-gray-50 text-gray-300 rounded-lg text-xs font-bold">VALIDER</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {(phase === 'full_success' || phase === 'complete') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="pt-12 space-y-6"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.5 }}
                    className="text-7xl"
                  >
                    🏆
                  </motion.div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-black text-gray-900">Félicitations !</h2>
                    <p className="text-gray-500 font-medium">
                      Vous avez complété votre formation avec succès. Votre bar est prêt pour l'excellence.
                    </p>
                  </div>
                  <LoadingButton
                    onClick={handleContinue}
                    isLoading={loading}
                    className="w-full py-5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-2xl font-black text-lg shadow-2xl hover:shadow-amber-500/40 transform hover:scale-[1.02] transition-all"
                  >
                    Commencer à Gérer
                  </LoadingButton>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-12">
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden min-h-[650px] flex flex-col border border-gray-100">
        {renderHeader()}

        <div className="p-6 md:p-10 bg-gray-50/50 flex-1 relative">
          {phase === 'intro' && (
            <div className="flex flex-col items-center justify-center h-full space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
                <GlassCard className="p-8 group hover:border-amber-400 transition-all cursor-default relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ShoppingCart size={80} />
                  </div>
                  <div className="text-amber-600 mb-3 text-2xl font-black tracking-tighter">1. MODE SIMPLIFIÉ</div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed">
                    Tout le monde utilise le même appareil (caisse centrale). Vous sélectionnez manuellement qui a vendu.
                  </p>
                </GlassCard>
                <GlassCard className="p-8 group hover:border-orange-400 transition-all cursor-default relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ShieldCheck size={80} />
                  </div>
                  <div className="text-orange-600 mb-3 text-2xl font-black tracking-tighter">2. MODE COMPLET</div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed">
                    Chaque serveur a son propre accès. Vous recevez, validez ou rejetez leurs commandes depuis votre poste.
                  </p>
                </GlassCard>
              </div>
              <button
                onClick={() => setPhase('sim_intro')}
                className="group px-12 py-5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl font-black text-lg shadow-2xl hover:shadow-orange-500/40 transform hover:scale-105 transition-all flex items-center gap-3"
              >
                Lancer la Formation <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
              </button>
            </div>
          )}

          {(phase.startsWith('sim')) && renderSimplifiedScenario()}
          {(phase.startsWith('full')) && renderFullScenario()}
        </div>

        {/* Premium footer tracker */}
        <div className="px-10 py-5 bg-white border-t border-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Formation BarTender Pro : Gérant</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ${(i === 1 && phase === 'intro') ||
                  (i === 2 && phase.startsWith('sim')) ||
                  (i === 3 && phase.startsWith('full'))
                  ? 'w-8 bg-amber-500' : 'w-2 bg-gray-200'
                  }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
