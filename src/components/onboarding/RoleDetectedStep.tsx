import React from 'react';
import { useOnboarding } from '../../context/OnboardingContext';

/**
 * RoleDetectedStep
 * Displays the detected user role and its responsibilities
 * Language: French (Français)
 */
export const RoleDetectedStep: React.FC = () => {
  const { userRole, nextStep } = useOnboarding();

  const getRoleInfo = () => {
    switch (userRole) {
      case 'promoteur':
      case 'owner':
        return {
          icon: '👑',
          title: 'Promoteur / Propriétaire',
          description: 'Vous avez un contrôle total sur le bar, les gérants, les produits et les rapports financiers.',
          responsibilities: [
            'Configurer les détails du bar',
            'Ajouter des gérants et serveurs',
            'Créer votre catalogue de produits',
            'Initialiser votre stock',
          ],
        };
      case 'gerant':
      case 'gérant':
      case 'manager':
        return {
          icon: '👔',
          title: 'Gérant',
          description: 'Vous gérez les opérations quotidiennes, validez les ventes et supervisez l\'équipe.',
          responsibilities: [
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
          description: 'Vous enregistrez les ventes et servez les clients.',
          responsibilities: [
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
        <div className="flex justify-center">
          <button
            onClick={nextStep}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
};
