import React, { useState, useEffect } from 'react';
import { X, Globe, PenTool, Check } from 'lucide-react';
import { Category } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { CategoriesService } from '../services/supabase/categories.service';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => void;
  onLinkGlobal?: (globalCategoryId: string) => void;
  category?: Category;
}

const colorOptions = [
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Rouge', value: '#ef4444' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Bordeaux', value: '#dc2626' },
  { name: 'Bleu', value: '#3b82f6' },
  { name: 'Vert', value: '#10b981' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
];

export function CategoryModal({ isOpen, onClose, onSave, onLinkGlobal, category }: CategoryModalProps) {
  const [mode, setMode] = useState<'custom' | 'global'>('custom');
  const [globalCategories, setGlobalCategories] = useState<any[]>([]);
  const [selectedGlobalId, setSelectedGlobalId] = useState<string | null>(null);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    color: '#f59e0b',
  });

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        color: category.color,
      });
      setMode('custom'); // Editing is always custom for now (or updating custom fields of linked?)
    } else {
      setFormData({
        name: '',
        color: '#f59e0b',
      });
      setMode('global'); // Default to global for new categories to encourage standardisation
    }
  }, [category, isOpen]);

  useEffect(() => {
    if (isOpen && mode === 'global') {
      loadGlobalCategories();
    }
  }, [isOpen, mode]);

  const loadGlobalCategories = async () => {
    try {
      setIsLoadingGlobal(true);
      const categories = await CategoriesService.getGlobalCategories();
      setGlobalCategories(categories);
    } catch (error) {
      console.error('Error loading global categories:', error);
    } finally {
      setIsLoadingGlobal(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'global' && selectedGlobalId && onLinkGlobal) {
      onLinkGlobal(selectedGlobalId);
      onClose();
    } else {
      onSave(formData);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-amber-100 flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-amber-100 shrink-0">
              <h2 className="text-xl font-semibold text-gray-800">
                {category ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </motion.button>
            </div>

            {!category && (
              <div className="flex p-2 gap-2 border-b border-amber-50 shrink-0">
                <button
                  onClick={() => setMode('global')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'global'
                      ? 'bg-amber-100 text-amber-700'
                      : 'text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <Globe size={16} />
                  Catalogue Global
                </button>
                <button
                  onClick={() => setMode('custom')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'custom'
                      ? 'bg-amber-100 text-amber-700'
                      : 'text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <PenTool size={16} />
                  Personnalisé
                </button>
              </div>
            )}

            <div className="overflow-y-auto p-6">
              <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
                {mode === 'global' ? (
                  <div className="space-y-2">
                    {isLoadingGlobal ? (
                      <div className="text-center py-8 text-gray-500">Chargement...</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {globalCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedGlobalId(cat.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedGlobalId === cat.id
                                ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                                : 'border-gray-200 hover:border-amber-200 hover:bg-gray-50'
                              }`}
                          >
                            <div
                              className="w-8 h-8 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color || '#ccc' }}
                            />
                            <span className="font-medium text-gray-700">{cat.name}</span>
                            {selectedGlobalId === cat.id && (
                              <Check className="ml-auto text-amber-500" size={20} />
                            )}
                          </button>
                        ))}
                        {globalCategories.length === 0 && (
                          <p className="text-center text-gray-500 py-4">Aucune catégorie globale disponible.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nom de la catégorie *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                        placeholder="ex: Sodas, Spiritueux"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Couleur de la catégorie *
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {colorOptions.map((color) => (
                          <motion.button
                            key={color.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, color: color.value })}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`w-full h-12 rounded-xl border-2 transition-all duration-200 ${formData.color === color.value
                                ? 'border-gray-800 scale-110 shadow-lg'
                                : 'border-gray-300 hover:border-gray-400'
                              }`}
                            style={{ backgroundColor: color.value }}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </form>
            </div>

            <div className="p-6 border-t border-amber-100 bg-gray-50 rounded-b-2xl shrink-0">
              <div className="flex gap-3">
                <motion.button
                  type="button"
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                >
                  Annuler
                </motion.button>
                <motion.button
                  type="submit"
                  form="category-form"
                  disabled={mode === 'global' && !selectedGlobalId}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex-1 py-3 text-white rounded-xl font-medium transition-colors ${mode === 'global' && !selectedGlobalId
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-600'
                    }`}
                >
                  {category ? 'Modifier' : (mode === 'global' ? 'Ajouter la sélection' : 'Créer')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}