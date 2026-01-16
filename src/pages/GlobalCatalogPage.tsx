import React, { useState } from 'react';
import { Globe, Layers, Package, Download } from 'lucide-react';
import { GlobalCategoriesTab } from '../components/GlobalCategoriesTab';
import { GlobalProductsTab } from '../components/GlobalProductsTab';
import { LocalProductsCatalogViewer } from '../components/admin/LocalProductsCatalogViewer';
import { AdminPanelErrorBoundary } from '../components/AdminPanelErrorBoundary';

export default function GlobalCatalogPage() {
  const [activeTab, setActiveTab] = useState<'categories' | 'products' | 'local-enrichment'>('categories');

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPanelErrorBoundary fallbackTitle="Erreur dans la gestion du catalogue global">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-4 md:p-6 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Catalogue Global</h1>
              <p className="text-violet-100 text-sm">Gérer le référentiel centralisé des produits et catégories</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-6">
            <button
              onClick={() => setActiveTab('categories')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'categories'
                ? 'bg-white text-violet-600'
                : 'bg-violet-700/50 text-violet-100 hover:bg-violet-700/70'
                }`}
            >
              <Layers className="w-4 h-4" />
              Catégories
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'products'
                ? 'bg-white text-violet-600'
                : 'bg-violet-700/50 text-violet-100 hover:bg-violet-700/70'
                }`}
            >
              <Package className="w-4 h-4" />
              Produits
            </button>
            <button
              onClick={() => setActiveTab('local-enrichment')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'local-enrichment'
                ? 'bg-white text-violet-600'
                : 'bg-violet-700/50 text-violet-100 hover:bg-violet-700/70'
                }`}
            >
              <Download className="w-4 h-4" />
              Enrichissement Local
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-50 rounded-b-2xl">
          {activeTab === 'categories' ? (
            <GlobalCategoriesTab />
          ) : activeTab === 'products' ? (
            <GlobalProductsTab />
          ) : (
            <LocalProductsCatalogViewer />
          )}
        </div>
      </AdminPanelErrorBoundary>
    </div>
  );
}
