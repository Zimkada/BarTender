import React, { useState, useEffect } from 'react';
import { X, Globe, PenTool, Check, Info } from 'lucide-react';
import { Category } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { CategoriesService } from '../services/supabase/categories.service';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Spinner } from './ui/Spinner';

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
    if (isOpen) {
      loadGlobalCategories();
    }
  }, [isOpen]);

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

  // Check for duplicate global category name
  const duplicateGlobal = !category && mode === 'custom' && formData.name.trim()
    ? globalCategories.find(gc => gc.name.toLowerCase() === formData.name.trim().toLowerCase())
    : null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={category ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
      size="default"
      footer={
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            form="category-form"
            disabled={mode === 'global' && !selectedGlobalId}
            className="flex-1"
          >
            {category ? 'Modifier' : (mode === 'global' ? 'Ajouter la sélection' : 'Créer')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {!category && (
          <div className="flex p-1 gap-1 border-b border-amber-50 shrink-0 bg-gray-100 rounded-lg">
            <Button
                onClick={() => setMode('global')}
                variant={mode === 'global' ? 'secondary' : 'ghost'}
                className="flex-1"
            >
                <Globe size={16} className="mr-2" />
                Catalogue Global
            </Button>
            <Button
                onClick={() => setMode('custom')}
                variant={mode === 'custom' ? 'secondary' : 'ghost'}
                className="flex-1"
            >
                <PenTool size={16} className="mr-2" />
                Personnalisé
            </Button>
          </div>
        )}

        <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
          {mode === 'global' ? (
            <div className="space-y-2">
              {isLoadingGlobal ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
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
                <Label htmlFor="categoryName">Nom de la catégorie *</Label>
                <Input
                    id="categoryName"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ex: Sodas, Spiritueux"
                />
              </div>

              {duplicateGlobal && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-col gap-3"
                >
                  <div className="flex items-start gap-2">
                    <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-sm text-blue-700">
                      Une catégorie globale <strong>{duplicateGlobal.name}</strong> existe déjà.
                      Il est recommandé de l'utiliser pour bénéficier des mises à jour automatiques.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('global');
                      setSelectedGlobalId(duplicateGlobal.id);
                    }}
                    className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded-lg self-end transition-colors shadow-sm"
                  >
                    Utiliser la catégorie globale
                  </button>
                </motion.div>
              )}

              <div>
                <Label htmlFor="categoryColor">Couleur de la catégorie *</Label>
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
    </Modal>
  );
}