import React from 'react';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * RoleDetectedStep
 * Displays the detected user role and its responsibilities
 */
export const RoleDetectedStep: React.FC = () => {
  const { userRole, nextStep } = useOnboarding();

  const getRoleInfo = () => {
    switch (userRole) {
      case 'promoteur':
        return {
          icon: '👑',
          title: 'Bar Owner',
          description: 'You have full control over your bar',
          responsibilities: [
            '✅ Create and manage your bar',
            '✅ Add managers and staff',
            '✅ Manage products and inventory',
            '✅ View sales and analytics',
            '✅ Update bar settings',
          ],
        };
      case 'gérant':
        return {
          icon: '👨‍💼',
          title: 'Manager',
          description: 'You manage day-to-day operations',
          responsibilities: [
            '✅ Create sales and transactions',
            '✅ Manage inventory',
            '✅ View analytics and reports',
            '❌ Cannot manage team',
            '❌ Cannot change bar settings',
          ],
        };
      case 'serveur':
        return {
          icon: '🍺',
          title: 'Bartender/Server',
          description: 'You process customer orders',
          responsibilities: [
            '✅ Create sales',
            '✅ Process payments',
            '✅ View basic inventory',
            '❌ Cannot manage team',
            '❌ Cannot view analytics',
          ],
        };
      default:
        return {
          icon: '❓',
          title: 'Unknown Role',
          description: 'Your role is not recognized',
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
          <h1 className="text-3xl font-bold text-gray-900">You're set up as a {roleInfo.title}</h1>
          <p className="mt-2 text-gray-600 text-lg">{roleInfo.description}</p>
        </div>

        {/* Responsibilities */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Permissions:</h2>
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
            <strong>Note:</strong> Your role was assigned by your bar owner. If you think this is incorrect, please contact them.
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex justify-center">
          <button
            onClick={nextStep}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
