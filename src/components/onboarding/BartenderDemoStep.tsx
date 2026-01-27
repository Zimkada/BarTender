import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';
import { Beer, ShoppingBag, Banknote, CheckCircle2, ChevronRight, AlertTriangle, Plus, Minus, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type DemoPhase =
  | 'intro'
  | 'picking'     // Task: Pick 2 Heineken
  | 'adjusting'   // Task: Add a product and remove it
  | 'alert_stock' // Task: Learn about stock warnings
  | 'payment'     // Task: Finalize
  | 'success';

export const BartenderDemoStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const [phase, setPhase] = useState<DemoPhase>('intro');
  const [loading, setLoading] = useState(false);

  // Simulation State
  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
  const [showStockWarning, setShowStockWarning] = useState(false);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleContinue = async () => {
    setLoading(true);
    try {
      completeStep(OnboardingStep.BARTENDER_DEMO, {
        timestamp: new Date().toISOString(),
        completedSimulation: true
      });
      nextStep();
    } catch (error) {
      console.error('Error finishing simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (id: string, name: string, price: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === id);
      if (existing) {
        return prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id, name, price, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.id === id) {
          const newQty = Math.max(0, i.qty + delta);
          return { ...i, qty: newQty };
        }
        return i;
      }).filter(i => i.qty > 0);
    });
  };

  // --- PREMIUM COMPONENTS ---

  const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/90 backdrop-blur-md border border-white/40 shadow-xl rounded-2xl ${className}`}
    >
      {children}
    </motion.div>
  );

  const renderHeader = () => {
    let title = "Académie Serveur";
    let subtitle = "Devenez le roi du comptoir BarTender.";
    let gradient = "from-purple-600 via-indigo-600 to-purple-800";

    switch (phase) {
      case 'intro':
        title = "🚀 Académie Serveur";
        subtitle = "Apprenez à encaisser vos clients en 2 minutes.";
        gradient = "from-purple-600 via-indigo-600 to-purple-800";
        break;
      case 'picking':
        title = "Mission : La Commande";
        subtitle = "Sélectionnez les produits demandés par le client.";
        gradient = "from-indigo-500 to-indigo-700";
        break;
      case 'adjusting':
        title = "Mission : Précision";
        subtitle = "Maîtrisez les quantités et les erreurs.";
        gradient = "from-indigo-600 to-indigo-800";
        break;
      case 'alert_stock':
        title = "Mission : Vigilance";
        subtitle = "Anticipez les ruptures de stock.";
        gradient = "from-amber-500 to-amber-700";
        break;
      case 'payment':
        title = "Mission : Clôture";
        subtitle = "Finalisez la vente et encaissez le montant.";
        gradient = "from-green-500 to-green-700";
        break;
      case 'success':
        title = "Serveur Certifié !";
        subtitle = "Vous êtes maintenant prêt à servir vos premiers clients.";
        gradient = "from-emerald-500 to-teal-600";
        break;
    }

    return (
      <div className={`p-8 text-center transition-all duration-700 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
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

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="bg-slate-50 rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col min-h-[600px]">
        {renderHeader()}

        <div className="flex-1 p-6 md:p-8 flex flex-col items-center justify-center relative bg-grid-slate-100">
          <AnimatePresence mode="wait">
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="text-center space-y-8 max-w-md"
              >
                <div className="w-24 h-24 bg-purple-100 rounded-3xl border-4 border-white shadow-xl flex items-center justify-center mx-auto transform rotate-6">
                  <Zap className="text-purple-600 w-12 h-12" fill="currentColor" />
                </div>
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Vendez à la vitesse de l'éclair</h2>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    Une application lente fait perdre des clients. BarTender est conçu pour la rapidité. On essaye ?
                  </p>
                </div>
                <button
                  onClick={() => setPhase('picking')}
                  className="group w-full py-4 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-xl hover:shadow-purple-200 flex items-center justify-center gap-2"
                >
                  Démarrer la formation <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            )}

            {(phase === 'picking' || phase === 'adjusting' || phase === 'alert_stock' || phase === 'payment') && (
              <motion.div
                key="simulation"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-start"
              >
                {/* Left: Product Selection Simulation */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      Produits <span className="w-6 h-1 bg-slate-200 rounded-full" />
                    </h3>
                    {phase === 'picking' && (
                      <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full animate-pulse border border-amber-200">
                        Mission : Clic sur Heineken
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Simulated Heineken Button */}
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        addToCart('p1', 'Heineken', 1000);
                        if (phase === 'picking') setPhase('adjusting');
                      }}
                      className={`relative p-6 rounded-2xl border-2 text-left transition-all ${phase === 'picking'
                          ? 'bg-white border-indigo-400 shadow-lg ring-4 ring-indigo-100 animate-float'
                          : 'bg-white border-transparent shadow-sm'
                        }`}
                    >
                      <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4 text-green-600">
                        <Beer size={28} />
                      </div>
                      <div className="font-bold text-slate-800">Heineken</div>
                      <div className="text-sm text-slate-400">1 000 FCFA</div>
                      <div className="absolute top-4 right-4 text-blue-500">
                        <Plus size={20} />
                      </div>
                    </motion.button>

                    {/* Simulated Product with Alert */}
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (phase === 'adjusting') setPhase('alert_stock');
                        setShowStockWarning(true);
                        addToCart('p2', 'Coca Cola', 600);
                      }}
                      className={`relative p-6 rounded-2xl border-2 text-left transition-all bg-white shadow-sm border-transparent ${phase === 'adjusting' ? 'border-amber-400 ring-4 ring-amber-100' : ''
                        }`}
                    >
                      <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4 text-red-600 font-black">
                        Co
                      </div>
                      <div className="font-bold text-slate-800">Coca Cola</div>
                      <div className="text-sm text-slate-400">600 FCFA</div>
                      {phase === 'alert_stock' && (
                        <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          STOCK BAS
                        </div>
                      )}
                    </motion.button>
                  </div>

                  <AnimatePresence>
                    {showStockWarning && phase === 'alert_stock' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl flex items-start gap-3"
                      >
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                        <div>
                          <p className="text-sm font-bold text-amber-900">Alerte Stocks !</p>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            Quand un produit s'affiche en orange, c'est qu'il en reste moins de 5. <strong>Signalez-le vite à votre gérant !</strong>
                          </p>
                          <button
                            onClick={() => {
                              setShowStockWarning(false);
                              setPhase('payment');
                            }}
                            className="mt-3 text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all"
                          >
                            J'ai compris, payer →
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right: Cart Simulation */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    Ticket Rapide <span className="w-6 h-1 bg-slate-200 rounded-full" />
                  </h3>

                  <GlassCard className="overflow-hidden flex flex-col min-h-[300px]">
                    <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ShoppingBag size={18} className="text-purple-400" />
                        <span className="font-bold text-sm">Commande Actuelle</span>
                      </div>
                      <span className="bg-purple-600 text-[10px] px-2 py-1 rounded-full font-bold">
                        {totalItemsCount} ARTICLES
                      </span>
                    </div>

                    <div className="flex-1 p-4 space-y-3">
                      <AnimatePresence>
                        {cart.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10">
                            <ShoppingBag size={48} className="opacity-20 mb-2" />
                            <p className="text-xs font-bold uppercase tracking-wider">Panier Vide</p>
                          </div>
                        ) : (
                          cart.map((item, idx) => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100"
                            >
                              <div>
                                <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono italic">{item.price} FCFA / unité</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => updateQty(item.id, -1)}
                                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                                >
                                  <Minus size={14} />
                                </button>
                                <span className="font-black text-slate-900 w-4 text-center">{item.qty}</span>
                                <button
                                  onClick={() => updateQty(item.id, 1)}
                                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-colors"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="p-5 bg-slate-50 border-t border-slate-200 space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Net</span>
                        <span className="text-2xl font-black text-indigo-600 tracking-tighter">{cartTotal.toLocaleString()} FCFA</span>
                      </div>

                      <button
                        disabled={cartTotal === 0 || phase !== 'payment'}
                        onClick={() => setPhase('success')}
                        className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg ${phase === 'payment'
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1 shadow-indigo-200'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                      >
                        <Banknote size={20} /> ENCAISSER LA VENTE
                      </button>
                    </div>
                  </GlassCard>
                </div>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-8 py-10"
              >
                <div className="w-32 h-32 bg-emerald-100 rounded-full flex items-center justify-center mx-auto shadow-xl border-8 border-white">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 8, stiffness: 200 }}
                  >
                    <CheckCircle2 size={64} className="text-emerald-500" />
                  </motion.div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-slate-800">C'est validé !</h2>
                  <p className="text-slate-500 max-w-sm mx-auto font-medium">
                    Vous avez maîtrisé le processus de vente BarTender. Prêt à faire exploser le chiffre d'affaires ?
                  </p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <LoadingButton
                    onClick={handleContinue}
                    isLoading={loading}
                    className="w-full max-w-xs py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl font-bold shadow-xl hover:shadow-emerald-200/50 transition-all flex items-center justify-center gap-2"
                  >
                    Aller au Tableau de Bord
                  </LoadingButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action bar for desktop or contextual info */}
        <div className="bg-slate-100/50 p-4 border-t border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest px-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-300" />
            Académie Serveur v2.0
          </div>
          <div>BarTender © 2026</div>
        </div>
      </div>
    </div>
  );
};
