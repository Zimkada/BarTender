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
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">{roleInfo.icon}</div>
          <h1 className="text-3xl font-bold text-gray-900">Vous êtes configuré en tant que {roleInfo.title}</h1>
          <p className="mt-2 text-gray-600 text-lg">{roleInfo.description}</p>
        </div>

        {/* Responsibilities */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vos permissions :</h2>
          <div className="space-y-2">
            {roleInfo.responsibilities.map((responsibility, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-gray-700">{responsibility}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-8">
          <p className="text-sm text-blue-900">
            <strong>Note :</strong> Votre rôle a été assigné par le propriétaire du bar. Si vous pensez que c'est incorrect, veuillez le contacter.
          </p>
        </div>

        {/* CTA Button */}
        {/* Footer Actions Standardisé */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-100 items-center justify-between">
          {/* Bouton Retour (onboarding context ne fournit pas prevStep ici, mais on peut simuler ou cacher) 
              Sur RoleDetected, le retour est Welcome
          */}
          <div className="w-20"></div>

          <button
            onClick={() => window.location.href = '/dashboard'}
            className="text-gray-400 hover:text-gray-600 font-medium text-sm underline decoration-gray-300 underline-offset-4 px-4 py-2"
          >
            Compléter plus tard
          </button>

          <button
            onClick={nextStep}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold shadow-md"
          >
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
};
