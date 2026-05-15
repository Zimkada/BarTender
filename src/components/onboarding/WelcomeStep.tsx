import React from 'react';
import { useOnboarding } from '../../context/OnboardingContext';

/**
 * WelcomeStep
 * First step of onboarding - introduces the user to BarTender
 * Adapts message based on whether bar is already set up (training mode) or not (configuration mode)
 * Language: French (Français)
 */
export const WelcomeStep: React.FC = () => {
  const { nextStep, barIsAlreadySetup, userRole } = useOnboarding();

  const isTrainingMode = barIsAlreadySetup && (userRole === 'gerant' || userRole === 'serveur' || userRole === 'manager' || userRole === 'bartender');

  const content = isTrainingMode
    ? {
        icon: '🎓',
        title: "Bienvenue dans l'Académie",
        subtitle: "Formation rapide pour maîtriser l'application",
        intro: "Le bar est déjà configuré ! Nous allons vous montrer comment utiliser l'application efficacement dans votre rôle quotidien.",
        sectionLabel: 'Ce que vous allez apprendre',
        features: [
          { emoji: '🎯', title: 'Votre rôle', desc: 'Comprendre vos responsabilités' },
          { emoji: '🖥️', title: 'Interface', desc: 'Navigation et fonctionnalités clés' },
          { emoji: '⚡', title: 'Simulation', desc: 'Exercices interactifs' },
        ],
        duration: 'Formation rapide : 2-3 minutes',
        skipLabel: 'Passer la formation',
        ctaLabel: 'Commencer la formation',
      }
    : {
        icon: '🍹',
        title: 'Bienvenue sur BarTender',
        subtitle: 'Votre solution de gestion de bar, simplifiée',
        intro: "Configurons votre bar en quelques minutes. Nous vous guiderons à travers les étapes essentielles pour être prêt pour votre première vente.",
        sectionLabel: 'Ce que vous allez configurer',
        features: [
          { emoji: '📍', title: 'Détails', desc: 'Nom, localisation' },
          { emoji: '👥', title: 'Équipe', desc: 'Gérants et serveurs' },
          { emoji: '🍻', title: 'Produits', desc: 'Votre carte' },
          { emoji: '📦', title: 'Inventaire', desc: 'Stock initial' },
        ],
        duration: 'Cela prend environ 3 à 5 minutes',
        skipLabel: 'Compléter plus tard',
        ctaLabel: 'Commencer',
      };

  const gridCols = content.features.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 md:p-10 text-center">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center text-3xl">
            {content.icon}
          </div>
          <h1 className="text-h1 text-gray-900 mb-2">{content.title}</h1>
          <p className="text-body text-gray-500">{content.subtitle}</p>
        </div>

        {/* Intro */}
        <p className="text-body-sm text-gray-600 mb-8 leading-relaxed max-w-xl mx-auto">
          {content.intro}
        </p>

        {/* Features */}
        <div className="mb-8">
          <h2 className="text-micro text-gray-400 mb-4">{content.sectionLabel}</h2>
          <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
            {content.features.map((feature, idx) => (
              <div
                key={idx}
                className="flex md:flex-col items-center md:text-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl"
              >
                <span className="text-2xl flex-shrink-0">{feature.emoji}</span>
                <div className="flex-1 text-left md:text-center">
                  <p className="text-body-sm font-semibold text-gray-900">{feature.title}</p>
                  <p className="text-caption text-gray-500">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="p-3 bg-brand-subtle/50 border border-brand-subtle rounded-xl mb-8">
          <p className="text-caption font-medium text-brand-primary">
            ⏱️ {content.duration}
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100 items-center justify-between">
          <button
            onClick={() => { window.location.href = '/dashboard'; }}
            className="text-caption text-gray-400 hover:text-gray-600 font-medium px-3 py-2 transition-colors order-2 sm:order-1"
          >
            {content.skipLabel}
          </button>

          <button
            onClick={nextStep}
            className="btn-brand w-full sm:w-auto h-11 px-6 rounded-xl text-body-sm font-semibold order-1 sm:order-2"
          >
            {content.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
