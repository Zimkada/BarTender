import React from 'react';
import { Plus } from 'lucide-react';
import { Category } from '../types';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onAddCategory: () => void;
}

export function CategoryTabs({ categories, activeCategory, onCategoryChange, onAddCategory }: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onCategoryChange(category.id)}
          className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap transition-all duration-200 ${
            activeCategory === category.id
              ? 'text-white shadow-lg transform scale-105'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
          style={{
            backgroundColor: activeCategory === category.id ? category.color : undefined,
          }}
        >
          {category.name}
        </button>
      ))}
      <button
        onClick={onAddCategory}
        className="flex items-center gap-2 px-4 py-3 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700 hover:text-white transition-all duration-200 whitespace-nowrap"
      >
        <Plus size={20} />
        Ajouter
      </button>
    </div>
  );
}