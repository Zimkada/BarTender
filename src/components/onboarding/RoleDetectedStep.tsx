import React from 'react';
import { useOnboarding } from '../../context/OnboardingContext';

/**
 * RoleDetectedStep
 * Displays the detected user role and its responsibilities
 * Adapts message based on whether bar is already set up (training mode) or not (configuration mode)
 * Language: French (Français)
 */
export const RoleDetectedStep: React.FC = () => {
  const { userRole, nextStep, barIsAlreadySetup } = useOnboarding();

  // Training mode: Bar is already set up, user just needs to learn the system
  const isTrainingMode = barIsAlreadySetup && (userRole === 'gerant' || userRole === 'serveur' || userRole === 'manager' || userRole === 'bartender');

  const getRoleInfo = () => {
    switch (userRole) {
      case 'promoteur':
      case 'owner':
        return {
          icon: '👑',
          title: 'Promoteur / Propriétaire',
          description: isTrainingMode
            ? 'Vous avez un contrôle total sur le bar. Cette formation vous montrera comment gérer efficacement votre établissement.'
            : 'Vous avez un contrôle total sur le bar, les gérants, les produits et les rapports financiers.',
          responsibilities: isTrainingMode
            ? [
              'Consulter les rapports financiers en temps réel',
              'Superviser les gérants et serveurs',
              'Analyser les performances de vente',
              'Gérer les paramètres du bar',
            ]
            : [
              'Configurer les détails du bar',
              'Ajouter des gérants et serveurs',
              'Créer votre catalogue de produits',
              'Initialiser votre stock',
            ],
        };
      case 'gerant':
      case 'manager':
        return {
          icon: '👔',
          title: 'Gérant',
          description: isTrainingMode
            ? 'Vous gérez les opérations quotidiennes. Cette formation vous montrera comment utiliser l\'application efficacement.'
            : 'Vous gérez les opérations quotidiennes, validez les ventes et supervisez l\'équipe.',
          responsibilities: isTrainingMode
            ? [
              'Consulter le tableau de bord en temps réel',
              'Valider les ventes et gérer les retours',
              'Superviser les serveurs et leurs performances',
              'Analyser les rapports de vente',
            ]
            : [
              'Gérer le personnel et les serveurs',
              'Valider les ventes et les retours',
              'Superviser les niveaux de stock',
              'Consulter les rapports de vente',
            ],
        };
      case 'serveur':
      case 'bartender':
        return {
          icon: '🍹',
          title: 'Serveur / Barman',
          description: isTrainingMode
            ? 'Vous enregistrez les ventes et servez les clients. Cette formation vous montrera comment utiliser l\'application rapidement.'
            : 'Vous enregistrez les ventes et servez les clients.',
          responsibilities: isTrainingMode
            ? [
              'Enregistrer rapidement les ventes',
              'Utiliser les raccourcis pour gagner du temps',
              'Gérer les retours clients',
              'Consulter votre historique de ventes',
            ]
            : [
              'Prendre les commandes des clients',
              'Enregistrer les ventes sur l\'application',
              'Gérer les retours si nécessaire',
            ],
        };
      default:
        return {
          icon: '❓',
          title: 'Rôle inconnu',
          description: 'Votre rôle n\'est pas reconnu',
          responsibilities: [],
        };
    }
  };

  const roleInfo = getRoleInfo();

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="backdrop-blur-xl bg-white/80 border border-white/40 shadow-2xl rounded-2xl p-5 md:p-10 ring-1 ring-black/5 relative overflow-hidden">

        {/* Decorative Top Gradient */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-[image:var(--brand-gradient)]" />

        {/* Header */}
        <div className="text-center mb-6 md:mb-10">
          <div className="inline-block p-4 md:p-6 rounded-full bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] shadow-inner mb-4 md:mb-6">
            <div className="text-5xl md:text-6xl animate-bounce-slow">{roleInfo.icon}</div>
          </div>
          <h1 className="text-xl md:text-4xl font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),10%)] mb-3 leading-tight">
            Vous êtes configuré en tant que <span className="bg-clip-text text-transparent bg-[image:var(--brand-gradient)]">{roleInfo.title}</span>
          </h1>
          <p className="mt-2 text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] text-base md:text-lg font-medium max-w-2xl mx-auto">
            {roleInfo.description}
          </p>
        </div>

        {/* Responsibilities */}
        <div className="mb-10">
          <h2 className="text-sm uppercase tracking-wider font-bold text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] mb-4 text-center">Vos responsabilités principales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roleInfo.responsibilities.map((responsibility, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-white/50 border border-white/60 rounded-xl hover:bg-white/80 transition-colors shadow-sm group">
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--brand-hue),var(--brand-saturation),90%)] flex items-center justify-center text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] font-bold text-sm group-hover:scale-110 transition-transform">
                  {index + 1}
                </div>
                <span className="text-[hsl(var(--brand-hue),var(--brand-saturation),20%)] font-medium">{responsibility}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="p-5 bg-[hsl(var(--brand-hue),var(--brand-saturation),94%)] border border-[hsl(var(--brand-hue),var(--brand-saturation),85%)] rounded-xl mb-8 flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <p className="text-sm text-[hsl(var(--brand-hue),var(--brand-saturation),30%)] leading-relaxed">
            <strong>Note :</strong> Votre rôle a été assigné par le propriétaire du bar. Si vous pensez que c'est incorrect, veuillez le contacter avant de commencer votre service.
          </p>
        </div>

        {/* CTA Button */}
        {/* Footer Actions Standardisé */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-[hsl(var(--brand-hue),var(--brand-saturation),90%)] items-center justify-between">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
          >
            Compléter plus tard
          </button>

          <button
            onClick={nextStep}
            className="px-8 py-3 bg-[image:var(--brand-gradient)] text-white rounded-xl hover:brightness-110 transition font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transform duration-200"
          >
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
};
