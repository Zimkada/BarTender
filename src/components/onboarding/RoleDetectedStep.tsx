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
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-card border border-border shadow-sm rounded-2xl p-6 md:p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center text-3xl">
            {roleInfo.icon}
          </div>
          <h1 className="text-h1 text-foreground mb-2 leading-tight">
            Vous êtes <span className="text-brand-primary">{roleInfo.title}</span>
          </h1>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            {roleInfo.description}
          </p>
        </div>

        {/* Responsibilities */}
        <div className="mb-8">
          <h2 className="text-micro text-muted-foreground mb-4 text-center">Vos responsabilités principales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roleInfo.responsibilities.map((responsibility, index) => (
              <div key={index} className="flex items-center gap-3 p-3.5 bg-muted border border-border rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center text-caption font-semibold tabular-nums flex-shrink-0">
                  {index + 1}
                </div>
                <span className="text-body-sm text-foreground/80">{responsibility}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-muted border border-border rounded-xl mb-6 flex items-start gap-3">
          <span className="text-base mt-0.5">ℹ️</span>
          <p className="text-caption text-foreground/70 leading-relaxed">
            <span className="font-semibold text-foreground">Note :</span> Votre rôle a été assigné par le propriétaire du bar. Si vous pensez que c'est incorrect, veuillez le contacter avant de commencer votre service.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border items-center justify-between">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="text-caption text-muted-foreground hover:text-foreground/70 font-medium px-3 py-2 transition-colors order-2 sm:order-1"
          >
            Compléter plus tard
          </button>

          <button
            onClick={nextStep}
            className="btn-brand w-full sm:w-auto h-11 px-6 rounded-xl text-body-sm font-semibold order-1 sm:order-2"
          >
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
};
