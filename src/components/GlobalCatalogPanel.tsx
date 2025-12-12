import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Layers, Package } from 'lucide-react';
import { GlobalCategoriesTab } from './GlobalCategoriesTab';
import { GlobalProductsTab } from './GlobalProductsTab';

interface GlobalCatalogPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function GlobalCatalogPanel({ isOpen, onClose }: GlobalCatalogPanelProps) {
    const [activeTab, setActiveTab] = useState<'categories' | 'products'>('categories');

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-[calc(100%-32px)] md:max-w-5xl lg:max-w-6xl h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-4 md:p-6 text-white relative">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <Globe className="w-8 h-8" />
                            <div>
                                <h2 className="text-xl md:text-2xl font-bold">Catalogue Global</h2>
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
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden bg-gray-50">
                        {activeTab === 'categories' ? (
                            <GlobalCategoriesTab />
                        ) : (
                            <GlobalProductsTab />
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
