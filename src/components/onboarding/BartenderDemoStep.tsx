import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { Beer, ShoppingBag, Banknote, CheckCircle2, ChevronRight, AlertTriangle, Plus, Minus, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type DemoPhase =
  | 'intro'
  | 'picking'
  | 'adjusting'
  | 'alert_stock'
  | 'payment'
  | 'success';

export const BartenderDemoStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const { currentBar } = useBar();
  const currency = currentBar?.settings?.currency || 'FCFA';

  const [phase, setPhase] = useState<DemoPhase>('intro');
  const [loading, setLoading] = useState(false);

  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
  const [showStockWarning, setShowStockWarning] = useState(false);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleContinue = async () => {
    setLoading(true);
    try {
      completeStep(OnboardingStep.BARTENDER_DEMO, {
        timestamp: new Date().toISOString(),
        completedSimulation: true,
      });
      nextStep();
    } catch (error) {
      console.error('Error finishing simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (id: string, name: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        return prev.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id, name, price, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const headerContent: Record<DemoPhase, { title: string; subtitle: string }> = {
    intro: { title: 'Académie serveur', subtitle: 'Apprenez à encaisser vos clients en 2 minutes.' },
    picking: { title: 'Mission : la commande', subtitle: 'Sélectionnez les produits demandés par le client.' },
    adjusting: { title: 'Mission : précision', subtitle: 'Maîtrisez les quantités et les erreurs.' },
    alert_stock: { title: 'Mission : vigilance', subtitle: 'Anticipez les ruptures de stock.' },
    payment: { title: 'Mission : clôture', subtitle: 'Finalisez la vente et encaissez le montant.' },
    success: { title: 'Serveur certifié', subtitle: 'Vous êtes prêt à servir vos premiers clients.' },
  };

  const { title, subtitle } = headerContent[phase];

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden flex flex-col min-h-[600px]">
        {/* Header */}
        <div className="p-8 text-center bg-brand-gradient text-white">
          <h1 className="text-h1 text-white mb-2">{title}</h1>
          <p className="text-body text-white/85 max-w-lg mx-auto">{subtitle}</p>
        </div>

        <div className="flex-1 p-6 md:p-8 flex flex-col items-center justify-center bg-gray-50">
          <AnimatePresence mode="wait">
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-center space-y-6 max-w-md"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center">
                  <Zap className="w-8 h-8" fill="currentColor" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-h2 text-gray-900">Vendez à la vitesse de l'éclair</h2>
                  <p className="text-body-sm text-gray-600 leading-relaxed">
                    Une application lente fait perdre des clients. BarTender est conçu pour la rapidité. On essaye ?
                  </p>
                </div>
                <button
                  onClick={() => setPhase('picking')}
                  className="btn-brand w-full h-11 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2"
                >
                  Démarrer la formation <ChevronRight size={16} />
                </button>
              </motion.div>
            )}

            {(phase === 'picking' || phase === 'adjusting' || phase === 'alert_stock' || phase === 'payment') && (
              <motion.div
                key="simulation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
              >
                {/* Left: Product Selection */}
                <div className="space-y-4">
                  {/* Mission Banner */}
                  <div className="bg-gray-900 text-white p-3 rounded-xl text-caption">
                    <span className="font-semibold text-brand-primary mr-1">Mission :</span>
                    {phase === 'picking' && <>Ajoutez une <span className="font-semibold">Heineken</span> à la commande.</>}
                    {phase === 'adjusting' && <>Ajoutez un <span className="font-semibold">Coca Cola</span> (erreur) à la commande.</>}
                    {phase === 'alert_stock' && <>Gérez l'alerte de stock sur le <span className="font-semibold">Coca Cola</span>.</>}
                    {phase === 'payment' && <>Tout est prêt. <span className="font-semibold">Encaissez</span> la commande.</>}
                  </div>

                  <h3 className="text-micro text-gray-400">Produits</h3>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Heineken */}
                    <button
                      onClick={() => {
                        addToCart('p1', 'Heineken', 1000);
                        if (phase === 'picking') setPhase('adjusting');
                      }}
                      className={`relative p-4 rounded-xl border text-left transition-all ${
                        phase === 'picking'
                          ? 'bg-white border-brand-primary shadow-sm ring-2 ring-brand-primary/20'
                          : 'bg-white border-gray-100 shadow-sm hover:border-brand-subtle'
                      }`}
                    >
                      <div className="w-10 h-10 bg-brand-subtle rounded-lg flex items-center justify-center mb-3 text-brand-primary">
                        <Beer size={20} />
                      </div>
                      <div className="text-body-sm font-semibold text-gray-900">Heineken</div>
                      <div className="text-caption text-gray-500 tabular-nums">1 000 {currency}</div>
                      <div className="absolute top-3 right-3 text-brand-primary">
                        <Plus size={14} />
                      </div>
                    </button>

                    {/* Coca Cola */}
                    <button
                      onClick={() => {
                        if (phase === 'adjusting') setPhase('alert_stock');
                        setShowStockWarning(true);
                        addToCart('p2', 'Coca Cola', 600);
                      }}
                      className={`relative p-4 rounded-xl border text-left transition-all bg-white shadow-sm ${
                        phase === 'adjusting' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-100 hover:border-brand-subtle'
                      }`}
                    >
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-3 text-gray-500 text-caption font-semibold">
                        Co
                      </div>
                      <div className="text-body-sm font-semibold text-gray-900">Coca Cola</div>
                      <div className="text-caption text-gray-500 tabular-nums">600 {currency}</div>
                      {phase === 'alert_stock' && (
                        <div className="absolute top-2 right-2 bg-amber-500 text-white text-micro font-semibold px-2 py-0.5 rounded-full">
                          Stock bas
                        </div>
                      )}
                    </button>
                  </div>

                  <AnimatePresence>
                    {showStockWarning && phase === 'alert_stock' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-3"
                      >
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-semibold text-amber-900">Alerte stock</p>
                          <p className="text-caption text-amber-800 leading-relaxed mt-0.5">
                            Quand un produit s'affiche en orange, il en reste moins de 5. <span className="font-semibold">Signalez-le à votre gérant.</span>
                          </p>
                          <button
                            onClick={() => {
                              setShowStockWarning(false);
                              setPhase('payment');
                            }}
                            className="mt-2 text-caption font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                          >
                            J'ai compris, encaisser →
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right: Cart */}
                <div className="space-y-4">
                  <h3 className="text-micro text-gray-400">Ticket rapide</h3>

                  <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                    <div className="p-3 bg-gray-900 text-white flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ShoppingBag size={16} className="text-brand-primary" />
                        <span className="text-body-sm font-semibold">Commande actuelle</span>
                      </div>
                      <span className="bg-brand-primary text-micro font-semibold px-2 py-0.5 rounded-full">
                        {totalItemsCount} article{totalItemsCount > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex-1 p-3 space-y-2">
                      {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300 py-10">
                          <ShoppingBag size={36} className="opacity-30 mb-2" />
                          <p className="text-caption text-gray-400">Panier vide</p>
                        </div>
                      ) : (
                        cart.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100"
                          >
                            <div className="min-w-0">
                              <div className="text-body-sm font-semibold text-gray-900 truncate">{item.name}</div>
                              <div className="text-micro text-gray-400 tabular-nums">{item.price} {currency} / unité</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateQty(item.id, -1)}
                                className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-body-sm font-semibold text-gray-900 w-4 text-center tabular-nums">{item.qty}</span>
                              <button
                                onClick={() => updateQty(item.id, 1)}
                                className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-brand-primary hover:border-brand-primary transition-colors"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-micro text-gray-400">Total net</span>
                        <span className="text-h2 font-semibold text-brand-primary tabular-nums">{cartTotal.toLocaleString()} {currency}</span>
                      </div>

                      <button
                        disabled={cartTotal === 0 || phase !== 'payment'}
                        onClick={() => setPhase('success')}
                        className={`w-full h-11 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                          phase === 'payment'
                            ? 'btn-brand'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Banknote size={16} /> Encaisser la vente
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-center space-y-6 py-6"
              >
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto border border-green-100">
                  <CheckCircle2 size={40} className="text-green-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-h2 text-gray-900">C'est validé</h2>
                  <p className="text-body-sm text-gray-600 max-w-sm mx-auto">
                    Vous avez maîtrisé le processus de vente BarTender. Prêt à servir vos clients ?
                  </p>
                </div>
                <LoadingButton
                  onClick={handleContinue}
                  isLoading={loading}
                  className="btn-brand w-full max-w-xs h-11 rounded-xl text-body-sm font-semibold"
                >
                  Aller au tableau de bord
                </LoadingButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-3 border-t border-gray-100 flex items-center justify-between text-micro text-gray-400 px-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            Académie serveur v2.0
          </div>
          <div>BarTender © 2026</div>
        </div>
      </div>
    </div>
  );
};
