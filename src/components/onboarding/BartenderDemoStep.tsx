import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { LoadingButton } from '../ui/LoadingButton';
import { Beer, Coffee, Banknote, CheckCircle, MousePointer2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type DemoState = 'intro' | 'picking' | 'paying' | 'success';

export const BartenderDemoStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [demoState, setDemoState] = useState<DemoState>('intro');
  const [cartTotal, setCartTotal] = useState(0);

  // Mock products for the simulation
  const products = [
    { id: 'p1', name: 'Heineken', price: 1000, icon: <Beer className="w-8 h-8 text-amber-500" /> },
    { id: 'p2', name: 'Espresso', price: 500, icon: <Coffee className="w-8 h-8 text-amber-800" /> },
    { id: 'p3', name: 'Coca Cola', price: 800, icon: <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs">Co</div> },
    { id: 'p4', name: 'Eau', price: 500, icon: <div className="w-8 h-8 rounded-full bg-blue-400 text-white flex items-center justify-center font-bold text-xs">H2O</div> },
  ];

  const handleProductClick = (productName: string, price: number) => {
    if (demoState !== 'picking') return;

    if (productName === 'Heineken') {
      setCartTotal(price);
      setDemoState('paying');
    } else {
      // Shake effect or feedback could be added here
      alert("Le client a demandé une Heineken ! 😉");
    }
  };

  const handlePay = () => {
    if (demoState !== 'paying') return;
    setDemoState('success');
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      completeStep(OnboardingStep.BARTENDER_DEMO, {
        timestamp: new Date().toISOString(),
        completedSimulation: true
      });
      nextStep();
    } catch (error) {
      console.error('Error continuing:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="bg-white rounded-xl shadow-xl overflow-hidden">
        {/* Header / Instructions */}
        <div className={`p-6 text-center transition-colors duration-300 ${demoState === 'success' ? 'bg-green-600' : 'bg-slate-900'
          }`}>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            {demoState === 'intro' && "🎓 Simulation : Votre Première Vente"}
            {demoState === 'picking' && "🛒 Le client commande une Heineken..."}
            {demoState === 'paying' && "💰 Parfait ! Encaissez 1000 FCFA"}
            {demoState === 'success' && "🎉 Bravo ! Vente réussie !"}
          </h1>
          <p className="text-white/80">
            {demoState === 'intro' && "Apprenons à encaisser une commande en 10 secondes."}
            {demoState === 'picking' && "Appuyez sur le produit 'Heineken' pour l'ajouter."}
            {demoState === 'paying' && "Cliquez sur le bouton 'Encaisser' en bas à droite."}
            {demoState === 'success' && "C'était facile, non ? Vous êtes prêt."}
          </p>
        </div>

        {/* Simulation Area */}
        <div className="p-8 bg-gray-50 min-h-[400px] flex flex-col md:flex-row gap-8">
          {/* Left: Product Grid */}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Produits disponibles</h3>
            <div className="grid grid-cols-2 gap-4">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProductClick(p.name, p.price)}
                  disabled={demoState !== 'picking' && demoState !== 'intro'}
                  className={`relative p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all transform hover:scale-105 active:scale-95
                                        ${demoState === 'picking'
                      ? 'bg-white border-blue-200 shadow-sm hover:border-blue-500 hover:shadow-md cursor-pointer'
                      : 'bg-gray-100 border-transparent opacity-50 cursor-not-allowed'
                    }
                                        ${p.name === 'Heineken' && demoState === 'picking' ? 'ring-4 ring-blue-400/30 animate-pulse border-blue-500' : ''}
                                    `}
                >
                  {p.name === 'Heineken' && demoState === 'picking' && (
                    <div className="absolute -top-3 -right-3 bg-blue-600 text-white p-1.5 rounded-full shadow-lg animate-bounce">
                      <MousePointer2 size={20} className="fill-current" />
                    </div>
                  )}
                  {p.icon}
                  <div className="text-center">
                    <div className="font-bold text-gray-900">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.price} FCFA</div>
                  </div>
                </button>
              ))}
            </div>

            {demoState === 'intro' && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setDemoState('picking')}
                  className="px-8 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-700 transition transform hover:scale-105"
                >
                  Commencer la démo
                </button>
              </div>
            )}
          </div>

          {/* Right: Register/Cart */}
          <div className="w-full md:w-80 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
              <h3 className="font-bold text-gray-700">Ticket de caisse</h3>
            </div>

            <div className="flex-1 p-4 space-y-4">
              {cartTotal > 0 ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-between items-center py-2 border-b border-dashed border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">1x</span>
                    <span>Heineken</span>
                  </div>
                  <span className="font-mono">{cartTotal} FCFA</span>
                </motion.div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                  Panier vide
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-xl space-y-4">
              <div className="flex justify-between items-center text-lg font-bold text-gray-900">
                <span>Total</span>
                <span>{cartTotal} FCFA</span>
              </div>

              {demoState === 'paying' || demoState === 'success' ? (
                <button
                  onClick={handlePay}
                  disabled={demoState === 'success'}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                                        ${demoState === 'success'
                      ? 'bg-green-500 text-white'
                      : 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                    }`}
                >
                  {demoState === 'success' ? (
                    <>
                      <CheckCircle size={24} />
                      Payé !
                    </>
                  ) : (
                    <>
                      <Banknote size={24} />
                      Encaisser
                    </>
                  )}
                </button>
              ) : (
                <div className="w-full py-4 bg-gray-200 rounded-xl text-gray-400 font-bold text-center cursor-not-allowed">
                  En attente...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="p-4 bg-white border-t border-gray-100 flex justify-between items-center">
          <div className="text-sm text-gray-500 hidden sm:block">
            Étape {demoState === 'intro' ? 1 : demoState === 'picking' ? 2 : demoState === 'paying' ? 3 : 4} sur 4
          </div>

          {demoState === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="ml-auto"
            >
              <LoadingButton
                onClick={handleContinue}
                isLoading={loading}
                className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold shadow-md"
              >
                Terminer la formation
              </LoadingButton>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};
