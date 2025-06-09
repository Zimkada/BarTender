import React from 'react';
import { Plus } from 'lucide-react';
import { Category } from '../types';
import { motion } from 'framer-motion';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onAddCategory?: () => void; // Optionnel maintenant
}



export function CategoryTabs({ categories, activeCategory, onCategoryChange, onAddCategory }: CategoryTabsProps) {
  const tabVariants = {
    active: {
      scale: 1.02,
      transition: { type: "spring", stiffness: 400, damping: 15 }
    },
    inactive: {
      scale: 1,
      transition: { duration: 0.2 }
    }
  };

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-orange-100">
      <motion.div 
        className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {categories.map((category) => (
          <motion.button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            variants={tabVariants}
            initial="inactive"
            animate={activeCategory === category.id ? "active" : "inactive"}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium whitespace-nowrap transition-all ${
              activeCategory === category.id
                ? 'bg-white text-gray-800 shadow-md border border-orange-200'
                : 'bg-transparent text-gray-600 hover:bg-white/50'
            }`}
          >
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </motion.button>
        ))}
      {onAddCategory && (
        <motion.button
          onClick={onAddCategory}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-medium hover:bg-orange-200 whitespace-nowrap transition-colors"
        >
          <Plus size={16} />
          <span>Ajouter</span>
        </motion.button>
        )}
      </motion.div>
    </div>
  );
}