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

  // Training mode: Bar is already set up, user just needs to learn the system
  const isTrainingMode = barIsAlreadySetup && (userRole === 'gerant' || userRole === 'serveur' || userRole === 'manager' || userRole === 'bartender');

  if (isTrainingMode) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4">
        <div className="backdrop-blur-xl bg-white/80 border border-white/40 shadow-2xl rounded-2xl p-5 md:p-10 ring-1 ring-black/5 relative overflow-hidden text-center">
          {/* Decorative Top Gradient */}
          <div className="absolute top-0 left-0 w-full h-2 bg-[image:var(--brand-gradient)]" />

          {/* Logo/Header */}
          <div className="mb-4 md:mb-8">
            <div className="inline-block mb-3 md:mb-6 p-3 md:p-4 rounded-full bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] shadow-inner">
              <div className="text-3xl md:text-5xl">🎓</div>
            </div>
            <h1 className="text-2xl md:text-4xl font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),10%)] mb-2">Bienvenue dans l'Académie</h1>
            <p className="text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] text-base md:text-lg font-medium">
              Formation rapide pour maîtriser l'application
            </p>
          </div>

          {/* Intro Text */}
          <div className="mb-6 md:mb-8">
            <p className="text-gray-600 mb-4 leading-relaxed text-sm md:text-base">
              Le bar est déjà configuré ! Nous allons vous montrer comment utiliser l'application efficacement dans votre rôle quotidien.
            </p>
          </div>

          {/* Features Preview */}
          <div className="mb-8 space-y-3 text-left">
            <h2 className="text-sm uppercase tracking-wider font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] mb-4 text-center">Ce que vous allez apprendre</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
                <span className="text-2xl filter drop-shadow-sm">🎯</span>
                <div className="flex-1">
                  <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Votre rôle</p>
                  <p className="text-sm text-gray-500">Comprendre vos responsabilités</p>
                </div>
              </div>

              <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
                <span className="text-2xl filter drop-shadow-sm">🖥️</span>
                <div className="flex-1">
                  <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Interface</p>
                  <p className="text-sm text-gray-500">Navigation et fonctionnalités clés</p>
                </div>
              </div>

              <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
                <span className="text-2xl filter drop-shadow-sm">⚡</span>
                <div className="flex-1">
                  <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Simulation</p>
                  <p className="text-sm text-gray-500">Exercices interactifs</p>
                </div>
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="p-3 md:p-4 bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] rounded-xl text-center mb-6 md:mb-8">
            <p className="text-sm text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] font-medium">
              <strong>⏱️ Formation rapide : 2-3 minutes</strong>
            </p>
          </div>

          {/* CTA Button */}
          <div className="flex flex-col sm:flex-row gap-4 mt-6 pt-6 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] items-center justify-between">
            <button
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
            >
              Passer la formation
            </button>

            <button
              onClick={nextStep}
              className="px-8 py-3 bg-[image:var(--brand-gradient)] text-white w-full sm:w-auto rounded-xl hover:brightness-110 transition font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transform duration-200"
            >
              Commencer la formation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Configuration mode: Original welcome for new bar setup
  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="backdrop-blur-xl bg-white/80 border border-white/40 shadow-2xl rounded-2xl p-5 md:p-10 ring-1 ring-black/5 relative overflow-hidden text-center">
        {/* Decorative Top Gradient */}
        <div className="absolute top-0 left-0 w-full h-2 bg-[image:var(--brand-gradient)]" />

        {/* Logo/Header */}
        <div className="mb-4 md:mb-8">
          <div className="inline-block mb-3 md:mb-6 p-3 md:p-4 rounded-full bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] shadow-inner">
            <div className="text-3xl md:text-5xl">🍹</div>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),10%)] mb-2">Bienvenue sur BarTender</h1>
          <p className="text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] text-base md:text-lg font-medium">
            Votre solution de gestion de bar, simplifiée
          </p>
        </div>

        {/* Intro Text */}
        <div className="mb-6 md:mb-8">
          <p className="text-gray-600 mb-4 leading-relaxed text-sm md:text-base">
            Configurons votre bar en quelques minutes. Nous vous guiderons à travers les étapes essentielles pour être prêt pour votre première vente.
          </p>
        </div>

        {/* Features Preview */}
        <div className="mb-8 space-y-3 text-left">
          <h2 className="text-sm uppercase tracking-wider font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] mb-4 text-center">Ce que vous allez configurer</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
              <span className="text-2xl filter drop-shadow-sm">📍</span>
              <div className="flex-1">
                <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Détails</p>
                <p className="text-sm text-gray-500">Nom, localisation</p>
              </div>
            </div>

            <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
              <span className="text-2xl filter drop-shadow-sm">👥</span>
              <div className="flex-1">
                <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Équipe</p>
                <p className="text-sm text-gray-500">Gérants et serveurs</p>
              </div>
            </div>

            <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
              <span className="text-2xl filter drop-shadow-sm">🍻</span>
              <div className="flex-1">
                <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Produits</p>
                <p className="text-sm text-gray-500">Votre carte</p>
              </div>
            </div>

            <div className="flex md:flex-col items-center md:text-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm">
              <span className="text-2xl filter drop-shadow-sm">📦</span>
              <div className="flex-1">
                <p className="font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),20%)]">Inventaire</p>
                <p className="text-sm text-gray-500">Stock initial</p>
              </div>
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="p-3 md:p-4 bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] rounded-xl text-center mb-6 md:mb-8">
          <p className="text-sm text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] font-medium">
            <strong>⏱️ Cela prend environ 3-5 minutes</strong>
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row gap-4 mt-6 pt-6 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] items-center justify-between">
          <button
            onClick={() => {
              window.location.href = '/dashboard';
            }}
            className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
          >
            Compléter plus tard
          </button>

          <button
            onClick={nextStep}
            className="px-8 py-3 bg-[image:var(--brand-gradient)] text-white w-full sm:w-auto rounded-xl hover:brightness-110 transition font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transform duration-200"
          >
            Commencer
          </button>
        </div>
      </div>
    </div>
  );
};
