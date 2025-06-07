import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Category } from '../types';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: Omit<Category, 'id' | 'createdAt'>) => void;
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

export function CategoryModal({ isOpen, onClose, onSave, category }: CategoryModalProps) {
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
    } else {
      setFormData({
        name: '',
        color: '#f59e0b',
      });
    }
  }, [category, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {category ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nom de la catégorie *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="ex: Sodas, Spiritueux"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Couleur de la catégorie *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={`w-full h-12 rounded-lg border-2 transition-all duration-200 ${
                    formData.color === color.value
                      ? 'border-white scale-110'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition-colors"
            >
              {category ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}