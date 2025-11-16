import React from 'react';
import { X, Check, ShoppingCart, TrendingUp, Package } from 'lucide-react';

export function ColorDemo({ onClose }: { onClose: () => void }) {
  const colorSchemes = [
    {
      name: 'Orange actuel',
      description: 'Configuration actuelle',
      header: 'from-amber-500 to-amber-500',
      button: 'bg-amber-500 hover:bg-amber-600',
      badge: 'bg-amber-100 text-amber-600',
      hex: '#f97316'
    },
    {
      name: 'Amber Classique',
      description: 'Bière blonde classique',
      header: 'from-amber-400 to-amber-600',
      button: 'bg-amber-500 hover:bg-amber-600',
      badge: 'bg-amber-100 text-amber-600',
      hex: '#f59e0b'
    },
    {
      name: 'Amber Profond',
      description: 'Bière ambrée',
      header: 'from-amber-500 to-amber-700',
      button: 'bg-amber-600 hover:bg-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      hex: '#d97706'
    },
    {
      name: 'Gold Premium',
      description: 'Doré luxe (IPA/Spéciale)',
      header: 'from-yellow-500 to-amber-600',
      button: 'bg-yellow-600 hover:bg-yellow-700',
      badge: 'bg-yellow-100 text-yellow-700',
      hex: '#ca8a04'
    },
    {
      name: 'Amber Clair',
      description: 'Bière blonde légère',
      header: 'from-amber-300 to-amber-500',
      button: 'bg-amber-400 hover:bg-amber-500',
      badge: 'bg-amber-50 text-amber-600',
      hex: '#fbbf24'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] overflow-y-auto">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-6 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold mb-2">🍺 Palette de couleurs BarTender</h1>
                <p className="text-gray-300 text-sm">Choisissez la nuance qui correspond le mieux à votre ambiance bar</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Color Schemes Grid */}
          <div className="p-6 space-y-8">
            {colorSchemes.map((scheme, index) => (
              <div key={index} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
                {/* Scheme Header */}
                <div className={`bg-gradient-to-r ${scheme.header} text-white p-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{scheme.name}</h2>
                      <p className="text-sm opacity-90">{scheme.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-white/20 px-3 py-1 rounded-full">
                        {scheme.hex}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scheme Content */}
                <div className="p-6 bg-gray-50 grid md:grid-cols-2 gap-6">
                  {/* Buttons Section */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Boutons</h3>
                    <div className="space-y-3">
                      <button className={`${scheme.button} text-white px-6 py-3 rounded-xl font-medium w-full flex items-center justify-center gap-2 transition-colors`}>
                        <Check size={18} />
                        Valider la vente
                      </button>
                      <button className={`${scheme.button} text-white px-6 py-3 rounded-xl font-medium w-full flex items-center justify-center gap-2 transition-colors`}>
                        <ShoppingCart size={18} />
                        Ajouter au panier
                      </button>
                    </div>
                  </div>

                  {/* Badges & Stats */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Badges & Statistiques</h3>
                    <div className="space-y-3">
                      <div className={`${scheme.badge} px-4 py-3 rounded-lg flex items-center justify-between`}>
                        <span className="font-medium">Stock disponible</span>
                        <span className="font-bold text-lg">245</span>
                      </div>
                      <div className={`${scheme.badge} px-4 py-3 rounded-lg flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <TrendingUp size={18} />
                          <span className="font-medium">CA du jour</span>
                        </div>
                        <span className="font-bold text-lg">125.000 F</span>
                      </div>
                    </div>
                  </div>

                  {/* Mini Card Preview */}
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Aperçu carte produit</h3>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-800">Heineken 33cl</h4>
                          <p className="text-sm text-gray-600">Bière blonde</p>
                        </div>
                        <span className={`${scheme.badge} px-3 py-1 rounded-full text-sm font-medium`}>
                          42
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-lg ${scheme.button.includes('amber-6') ? 'text-amber-600' : scheme.button.includes('yellow-6') ? 'text-yellow-600' : 'text-amber-600'}`}>
                          1.500 FCFA
                        </span>
                        <button className={`${scheme.button} text-white px-4 py-2 rounded-lg flex items-center gap-1 transition-colors`}>
                          <Package size={16} />
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-6 bg-gray-100 rounded-b-2xl border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              💡 <strong>Astuce :</strong> L'Amber Classique et l'Amber Profond sont les plus populaires pour les applications bar/restaurant
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
