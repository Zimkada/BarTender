import React, { useState } from 'react';
import { ChefHat, Flame, PackageMinus, ClipboardList, ArrowRight, BookOpen } from 'lucide-react';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { useGuide } from '../../context/GuideContext';
import { LoadingButton } from '../ui/LoadingButton';
import { Button } from '../ui/Button';
import { KITCHEN_SERVICE_GUIDE } from '../../data/guides/kitchen-guides';

/**
 * Accueil du CUISINIER.
 *
 * ⭐ POURQUOI CETTE ETAPE EXISTE (03/09/2026) : le cuisinier tombait dans le
 * `default` de `getStepSequence` - WELCOME → ROLE_DETECTED → COMPLETE, soit
 * AUCUN accueil metier, alors que ses ecrans (file, production, pertes, lots)
 * sont parmi les moins evidents de l'application et que son profil est le
 * moins familier d'un outil numerique.
 *
 * ⛔ VOLONTAIREMENT SANS SIMULATION, contrairement au parcours serveur
 * (`BartenderDemoStep`, 326 lignes) : le contenu pedagogique cuisine EXISTE
 * DEJA et est maintenu - `KITCHEN_SERVICE_GUIDE` couvre la file, le passage a
 * « Pret », la production a l'avance et les pertes. Ecrire une seconde
 * pedagogie ici creerait deux sources a garder synchrones avec le meme ecran :
 * exactement le motif de divergence que ce projet a deja paye.
 *
 * Cette etape ORIENTE donc vers le guide, elle ne le remplace pas.
 *
 * ⚠️ Non bloquante comme tout le parcours (`isMandatory: false`) : le
 * cuisinier peut passer et retrouver le guide via le bouton de la page
 * Cuisine ou l'onglet Formation de son profil.
 */
export const KitchenIntroStep: React.FC = () => {
  const { completeStep, nextStep } = useOnboarding();
  const { currentBar } = useBar();
  const { startTour } = useGuide();
  const [loading, setLoading] = useState(false);

  const barName = currentBar?.name || 'la cuisine';

  const finish = () => {
    completeStep(OnboardingStep.KITCHEN_INTRO, {
      timestamp: new Date().toISOString(),
    });
    nextStep();
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      finish();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Termine l'accueil PUIS ouvre la visite guidee : sans `finish()`, le
   * cuisinier qui lance le guide resterait bloque sur cette etape a son
   * retour, et la reverrait a chaque connexion.
   */
  const handleOpenGuide = () => {
    finish();
    startTour(KITCHEN_SERVICE_GUIDE.id, KITCHEN_SERVICE_GUIDE);
  };

  const missions = [
    {
      icon: ClipboardList,
      title: 'Votre file de commandes',
      desc: 'Les plats commandes en salle arrivent chez vous, dans l\'ordre. Rien ne se perd.',
    },
    {
      icon: Flame,
      title: 'Produire a l\'avance',
      desc: 'Preparez vos lots avant le coup de feu : le stock d\'ingredients suit tout seul.',
    },
    {
      icon: PackageMinus,
      title: 'Declarer les pertes',
      desc: 'Un plat rate ou un ingredient perime se declare en deux gestes, sans discussion.',
    },
  ];

  const cycle = [
    { num: 1, label: 'Recue', desc: 'La commande arrive de la salle.' },
    { num: 2, label: 'En cours', desc: 'Vous la commencez : la cuisine sait ou elle en est.' },
    { num: 3, label: 'Prete', desc: 'Le service vient la chercher, les ingredients sont decomptes.' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-8 md:p-10 text-center bg-brand-gradient text-white">
          <div className="w-14 h-14 bg-card/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <ChefHat className="text-white w-7 h-7" />
          </div>
          <h1 className="text-h2 mb-2">Bienvenue en cuisine</h1>
          <p className="text-body-sm text-white/90">
            Votre poste sur {barName}, en trois idees.
          </p>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          {/* Missions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {missions.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.title} className="p-4 rounded-xl border border-border bg-muted/40">
                  <div className="w-9 h-9 rounded-lg bg-brand-subtle flex items-center justify-center mb-3">
                    <Icon size={18} className="text-brand-primary" />
                  </div>
                  <p className="text-body-sm font-semibold text-foreground mb-1">{m.title}</p>
                  <p className="text-caption text-muted-foreground">{m.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Cycle d'une commande */}
          <div>
            <p className="text-body-sm font-semibold text-foreground mb-3">
              Le cycle d'une commande
            </p>
            <div className="space-y-2">
              {cycle.map((c) => (
                <div key={c.num} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-caption font-bold flex items-center justify-center shrink-0">
                    {c.num}
                  </span>
                  <div>
                    <p className="text-body-sm font-medium text-foreground">{c.label}</p>
                    <p className="text-caption text-muted-foreground">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <form onSubmit={handleContinue} className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenGuide}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <BookOpen size={16} />
              <span>Voir la visite guidee</span>
            </Button>
            <LoadingButton type="submit" isLoading={loading} className="flex-1 flex items-center justify-center gap-2">
              <span>C'est compris</span>
              <ArrowRight size={16} />
            </LoadingButton>
          </form>
        </div>
      </div>
    </div>
  );
};

KitchenIntroStep.displayName = 'KitchenIntroStep';

export default KitchenIntroStep;
