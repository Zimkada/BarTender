// src/pages/PromotionsPage.tsx
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Construction } from 'lucide-react';

/**
 * PromotionsPage - Gestion des promotions (placeholder)
 * Route: /promotions
 */
export default function PromotionsPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/20 rounded-lg">
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <Gift size={28} />
              <div>
                <h1 className="text-xl font-bold">Promotions</h1>
                <p className="text-amber-100 text-sm">Gérez vos offres promotionnelles</p>
              </div>
            </div>
          </div>
        </div>
        <div className="p-12 text-center">
          <Construction size={64} className="mx-auto text-amber-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Fonctionnalité en développement</h2>
          <p className="text-gray-600">Les promotions seront bientôt disponibles.</p>
        </div>
      </div>
    </div>
  );
}
