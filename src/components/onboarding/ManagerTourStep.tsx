import React, { useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { ShoppingCart, ArrowRight, AlertCircle, ShieldCheck, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type DemoPhase =
  | 'intro'
  | 'sim_intro'
  | 'sim_mapping'
  | 'sim_action'
  | 'sim_success'
  | 'full_intro'
  | 'full_validate'
  | 'full_reject'
  | 'full_success'
  | 'complete';

export const ManagerTourStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const { currentBar } = useBar();
  const currency = currentBar?.settings?.currency || 'FCFA';

  const [phase, setPhase] = useState<DemoPhase>('intro');
  const [loading, setLoading] = useState(false);

  const [selectedServer, setSelectedServer] = useState('');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
  const [validatedOrders, setValidatedOrders] = useState<string[]>([]);
  const [rejectedOrders, setRejectedOrders] = useState<string[]>([]);

  const handleContinue = async () => {
    setLoading(true);
    try {
      completeStep(OnboardingStep.MANAGER_TOUR, {
        timestamp: new Date().toISOString(),
        completedTour: true,
      });
      nextStep();
    } catch (error) {
      console.error('Error finishing tour:', error);
    } finally {
      setLoading(false);
    }
  };

  const headerContent: Record<DemoPhase, { title: string; subtitle: string }> = {
    intro: { title: 'Académie BarTender', subtitle: 'Devenez gérant pro en moins de 2 minutes.' },
    sim_intro: { title: 'Mission : la vente directe', subtitle: 'Le mode simplifié pour une gestion centralisée.' },
    sim_mapping: { title: 'Mission : la vente directe', subtitle: 'Le mode simplifié pour une gestion centralisée.' },
    sim_action: { title: 'Mission : la vente directe', subtitle: 'Le mode simplifié pour une gestion centralisée.' },
    sim_success: { title: 'Vente réussie', subtitle: 'Liaison parfaite, Afi peut être fière.' },
    full_intro: { title: 'Mission : le contrôle', subtitle: 'Le mode complet pour déléguer en toute sécurité.' },
    full_validate: { title: 'Mission : le contrôle', subtitle: 'Validez ou rejetez les commandes serveur.' },
    full_reject: { title: 'Mission : le contrôle', subtitle: 'Validez ou rejetez les commandes serveur.' },
    full_success: { title: 'Certification obtenue', subtitle: 'Vous êtes officiellement gérant certifié.' },
    complete: { title: 'Certification obtenue', subtitle: 'Vous êtes officiellement gérant certifié.' },
  };

  const { title, subtitle } = headerContent[phase];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-8">
      <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden min-h-[600px] flex flex-col">
        {/* Header */}
        <div className="p-6 md:p-8 text-center bg-brand-gradient text-white">
          <h1 className="text-h1 text-white mb-2">{title}</h1>
          <p className="text-body text-white/85 max-w-lg mx-auto">{subtitle}</p>
        </div>

        <div className="p-6 md:p-8 bg-muted flex-1">
          {/* Intro */}
          {phase === 'intro' && (
            <div className="flex flex-col items-center justify-center h-full space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                <div className="p-6 bg-card border border-border rounded-xl shadow-sm">
                  <div className="w-10 h-10 bg-brand-subtle text-brand-primary rounded-lg flex items-center justify-center mb-3">
                    <ShoppingCart size={20} />
                  </div>
                  <div className="text-h3 text-foreground mb-1">1. Mode simplifié</div>
                  <p className="text-caption text-foreground/70 leading-relaxed">
                    Tout le monde utilise le même appareil (caisse centrale). Vous sélectionnez manuellement qui a vendu.
                  </p>
                </div>
                <div className="p-6 bg-card border border-border rounded-xl shadow-sm">
                  <div className="w-10 h-10 bg-brand-subtle text-brand-primary rounded-lg flex items-center justify-center mb-3">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="text-h3 text-foreground mb-1">2. Mode complet</div>
                  <p className="text-caption text-foreground/70 leading-relaxed">
                    Chaque serveur a son propre accès. Vous recevez, validez ou rejetez leurs commandes.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPhase('sim_intro')}
                className="btn-brand h-12 px-8 rounded-xl text-body-sm font-semibold flex items-center gap-2"
              >
                Lancer la formation <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Simplified scenario */}
          {phase.startsWith('sim') && (
            <div className="flex flex-col h-full justify-center">
              <AnimatePresence mode="wait">
                {phase === 'sim_intro' && (
                  <motion.div
                    key="sim-intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-center space-y-5 max-w-md mx-auto"
                  >
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center">
                      <ShoppingCart size={28} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-h2 text-foreground">Le mode simplifié</h3>
                      <p className="text-body-sm text-foreground/70 leading-relaxed">
                        Centralisez tout sur un seul appareil. Idéal si vos serveurs n'ont pas de smartphone ou pour un service rapide au comptoir.
                      </p>
                    </div>
                    <div className="bg-card p-4 rounded-xl border border-border flex items-start gap-3 text-left">
                      <ShieldCheck className="text-brand-primary shrink-0 mt-0.5" size={18} />
                      <p className="text-caption text-foreground/80 leading-relaxed">
                        Le <span className="font-semibold">nom d'affichage</span> est le lien entre les noms sélectionnés au comptoir et les vrais comptes serveurs, pour un calcul de CA automatique.
                      </p>
                    </div>
                    <button
                      onClick={() => setPhase('sim_mapping')}
                      className="btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold flex items-center gap-2 mx-auto"
                    >
                      Comprendre le nom d'affichage <ArrowRight size={16} />
                    </button>
                  </motion.div>
                )}

                {phase === 'sim_mapping' && (
                  <motion.div
                    key="sim-mapping"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-5 max-w-md mx-auto text-center"
                  >
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                      <h4 className="text-micro text-muted-foreground flex items-center justify-center gap-2 mb-3">
                        <Zap size={12} className="text-brand-primary" /> Le nom d'affichage
                      </h4>
                      <div className="mb-5 p-2 bg-brand-subtle/50 border border-brand-subtle rounded-lg space-y-1">
                        <div className="text-caption text-brand-primary">Paramètres → Configuration de gestion</div>
                        <div className="text-caption text-brand-primary">Gestion d'équipe → Nom sur vente</div>
                      </div>
                      <div className="space-y-2">
                        {[
                          { from: 'Afi', to: 'Afi KOFFI' },
                          { from: 'Rose', to: 'Rose BIAOU' },
                        ].map((m) => (
                          <div key={m.from} className="flex items-center justify-between p-3 bg-muted rounded-xl border border-border">
                            <span className="text-body-sm font-semibold text-foreground/80">{m.from}</span>
                            <ArrowRight size={14} className="text-muted-foreground/60" />
                            <span className="text-caption bg-brand-subtle text-brand-primary font-semibold px-3 py-1 rounded-lg border border-brand-subtle">
                              {m.to}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-caption text-muted-foreground mt-4 italic">
                        L'app reconnaît "Afi" comme "Afi KOFFI". Votre CA reste toujours juste.
                      </p>
                    </div>
                    <button
                      onClick={() => setPhase('sim_action')}
                      className="btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold"
                    >
                      Enregistrer une vente pour Afi
                    </button>
                  </motion.div>
                )}

                {(phase === 'sim_action' || phase === 'sim_success') && (
                  <motion.div
                    key="sim-action"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-full max-w-md mx-auto"
                  >
                    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="bg-muted p-3 border-b border-border flex justify-between items-center">
                        <span className="text-body-sm font-semibold text-foreground">Caisse pro</span>
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        </div>
                      </div>

                      <div className="bg-gray-900 text-white p-3 text-caption text-center">
                        <span className="font-semibold text-brand-primary mr-1">Mission :</span>
                        enregistrez cette vente pour <span className="font-semibold">Afi</span> en <span className="font-semibold">espèces</span>.
                      </div>

                      <div className="p-5 space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-body-sm">
                            <span className="text-foreground/70">2x Coca-Cola</span>
                            <span className="font-semibold text-foreground tabular-nums">1 000 {currency}</span>
                          </div>
                          <div className="flex justify-between items-center text-body-sm">
                            <span className="text-foreground/70">1x Beaufort</span>
                            <span className="font-semibold text-foreground tabular-nums">600 {currency}</span>
                          </div>
                          <div className="pt-3 border-t border-dashed border-border flex justify-between items-baseline">
                            <span className="text-body-sm font-semibold text-foreground">Total</span>
                            <span className="text-h2 font-semibold text-brand-primary tabular-nums">1 600 {currency}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-micro text-muted-foreground px-1">Vendeur responsable</label>
                          <select
                            className="w-full h-11 px-3 bg-muted border border-border rounded-xl text-body-sm font-medium text-foreground focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-card outline-none"
                            value={selectedServer}
                            onChange={(e) => setSelectedServer(e.target.value)}
                            disabled={phase === 'sim_success'}
                          >
                            <option value="">— Qui a vendu ? —</option>
                            <option value="Afi">Afi</option>
                            <option value="Rose">Rose</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-micro text-muted-foreground px-1">Mode de paiement</label>
                          <select
                            className="w-full h-11 px-3 bg-muted border border-border rounded-xl text-body-sm font-medium text-foreground focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-card outline-none"
                            value={selectedPaymentMode}
                            onChange={(e) => setSelectedPaymentMode(e.target.value)}
                            disabled={phase === 'sim_success'}
                          >
                            <option value="">— Mode de paiement —</option>
                            <option value="cash">Espèces</option>
                            <option value="momo">Mobile Money</option>
                            <option value="card">Carte bancaire</option>
                          </select>
                        </div>

                        <button
                          disabled={!selectedServer || !selectedPaymentMode || phase === 'sim_success'}
                          onClick={() => setPhase('sim_success')}
                          className={`w-full h-12 rounded-xl text-body-sm font-semibold transition-all ${
                            !selectedServer || !selectedPaymentMode
                              ? 'bg-gray-200 text-muted-foreground cursor-not-allowed'
                              : phase === 'sim_success'
                              ? 'bg-green-500 text-white'
                              : 'btn-brand'
                          }`}
                        >
                          {phase === 'sim_success' ? 'Vente encaissée ✓' : "Valider l'encaissement"}
                        </button>

                        {phase === 'sim_success' && (
                          <div className="text-center space-y-3 pt-3">
                            <p className="text-body-sm font-semibold text-green-700">Parfait ! Afi a été créditée.</p>
                            <button
                              onClick={() => {
                                setPhase('full_intro');
                                setSelectedServer('');
                              }}
                              className="btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold flex items-center gap-2 mx-auto"
                            >
                              Mission suivante <ArrowRight size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Full scenario */}
          {phase.startsWith('full') && (
            <div className="flex flex-col h-full justify-center">
              <AnimatePresence mode="wait">
                {phase === 'full_intro' && (
                  <motion.div
                    key="full-intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-center space-y-5 max-w-md mx-auto"
                  >
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center">
                      <ShieldCheck size={28} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-h2 text-foreground">Le mode complet</h3>
                      <p className="text-body-sm text-foreground/70 leading-relaxed">
                        Déléguez en toute sérénité. Vos serveurs ont l'appli, mais vous gardez le dernier mot sur le stock et les ventes.
                      </p>
                    </div>
                    <div className="bg-card p-4 rounded-xl border border-border flex items-start gap-3 text-left">
                      <AlertCircle className="text-brand-primary shrink-0 mt-0.5" size={18} />
                      <p className="text-caption text-foreground/80 leading-relaxed">
                        Validez les commandes sérieuses, rejetez les erreurs. Simple et sécurisé.
                      </p>
                    </div>
                    <button
                      onClick={() => setPhase('full_validate')}
                      className="btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold"
                    >
                      Accéder au poste de contrôle
                    </button>
                  </motion.div>
                )}

                {!phase.includes('intro') && (
                  <motion.div
                    key="full-action"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-full max-w-md mx-auto space-y-3"
                  >
                    <div className="bg-card border border-dashed border-border p-2.5 rounded-xl flex items-center gap-2 text-micro text-muted-foreground">
                      <Zap size={11} /> Tableau de bord / Commandes
                    </div>

                    <div className="bg-gray-900 text-white p-3 rounded-xl text-caption text-center">
                      <span className="font-semibold text-brand-primary mr-1">Mission :</span>
                      {phase === 'full_validate' ? (
                        <>Validez la commande de <span className="font-semibold">Rose</span>.</>
                      ) : (
                        <>Rejetez la commande incorrecte d'<span className="font-semibold">Afi</span>.</>
                      )}
                    </div>

                    {/* Order Rose */}
                    <AnimatePresence>
                      {!validatedOrders.includes('order1') && (
                        <motion.div
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={`bg-card p-4 rounded-xl shadow-sm border border-border border-l-4 ${
                            phase === 'full_validate' ? 'border-l-brand-primary' : 'border-l-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-brand-subtle rounded-full flex items-center justify-center font-semibold text-brand-primary">R</div>
                              <div className="text-left">
                                <div className="text-body-sm font-semibold text-foreground">Rose</div>
                                <div className="text-caption text-muted-foreground tabular-nums">2x Flag • 1 000 {currency}</div>
                              </div>
                            </div>
                            {phase === 'full_validate' && (
                              <div className="bg-brand-subtle px-2 py-0.5 rounded-full text-micro font-semibold text-brand-primary">Action requise</div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button disabled className="flex-1 h-9 bg-muted text-muted-foreground/60 rounded-lg text-caption font-medium">Rejeter</button>
                            <button
                              disabled={phase !== 'full_validate'}
                              onClick={() => {
                                setValidatedOrders([...validatedOrders, 'order1']);
                                setPhase('full_reject');
                              }}
                              className={`flex-1 h-9 rounded-lg text-caption font-semibold transition-all ${
                                phase === 'full_validate' ? 'btn-brand' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              Valider
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Order Afi */}
                    <AnimatePresence>
                      {!rejectedOrders.includes('order2') && (
                        <motion.div
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          key="order-afi"
                          className={`bg-card p-4 rounded-xl shadow-sm border border-border border-l-4 ${
                            phase === 'full_reject' ? 'border-l-red-500' : 'border-l-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-red-50 rounded-full flex items-center justify-center font-semibold text-red-600">A</div>
                              <div className="text-left">
                                <div className="text-body-sm font-semibold text-foreground">Afi</div>
                                <div className="text-caption text-red-500 flex items-center gap-1">
                                  <AlertCircle size={11} /> Erreur signalée
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
                              className={`flex-1 h-9 rounded-lg text-caption font-semibold transition-all ${
                                phase === 'full_reject' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              Rejeter
                            </button>
                            <button disabled className="flex-1 h-9 bg-muted text-muted-foreground/60 rounded-lg text-caption font-medium">Valider</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {(phase === 'full_success' || phase === 'complete') && (
                      <div className="pt-8 space-y-5 text-center">
                        <div className="text-5xl">🏆</div>
                        <div className="space-y-1">
                          <h2 className="text-h2 text-foreground">Félicitations</h2>
                          <p className="text-body-sm text-foreground/70">
                            Vous avez complété votre formation. Votre bar est prêt pour l'excellence.
                          </p>
                        </div>
                        <LoadingButton
                          onClick={handleContinue}
                          isLoading={loading}
                          className="btn-brand w-full h-12 rounded-xl text-body-sm font-semibold"
                        >
                          Commencer à gérer
                        </LoadingButton>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Progress footer */}
        <div className="px-6 py-3 bg-card border-t border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
            <span className="text-micro text-muted-foreground">Formation gérant</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => {
              const isActive =
                (i === 1 && phase === 'intro') ||
                (i === 2 && phase.startsWith('sim')) ||
                (i === 3 && phase.startsWith('full'));
              return (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    isActive ? 'w-6 bg-brand-primary' : 'w-1.5 bg-gray-200'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
