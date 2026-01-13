import React from 'react';
import { useOnboarding } from '@/context/OnboardingContext';

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
        return {
          icon: '👑',
          title: 'Promoteur',
          description: 'Vous avez le contrôle total sur votre bar',
          responsibilities: [
            '✅ Créer et gérer votre bar',
            '✅ Ajouter des gérants et du personnel',
            '✅ Gérer les produits et l\'inventaire',
            '✅ Afficher les ventes et analyses',
            '✅ Mettre à jour les paramètres du bar',
          ],
        };
      case 'gérant':
        return {
          icon: '👨‍💼',
          title: 'Gérant',
          description: 'Vous gérez les opérations quotidiennes',
          responsibilities: [
            '✅ Créer des ventes et transactions',
            '✅ Gérer l\'inventaire',
            '✅ Afficher les analyses et rapports',
            '❌ Ne peut pas gérer l\'équipe',
            '❌ Ne peut pas modifier les paramètres',
          ],
        };
      case 'serveur':
        return {
          icon: '🍺',
          title: 'Serveur',
          description: 'Vous traitez les commandes des clients',
          responsibilities: [
            '✅ Créer des ventes',
            '✅ Traiter les paiements',
            '✅ Afficher l\'inventaire basique',
            '❌ Ne peut pas gérer l\'équipe',
            '❌ Ne peut pas afficher les analyses',
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
            <strong>Note :</strong> Votre rôle a été assigné par le propriétaire du bar. Si vous pensez que c\'est incorrect, veuillez le contacter.
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
