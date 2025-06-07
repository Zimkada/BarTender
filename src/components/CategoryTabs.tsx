import React from 'react';
import { Plus } from 'lucide-react';
import { Category } from '../types';
import { motion } from 'framer-motion';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onAddCategory: () => void;
}

export function CategoryTabs({ categories, activeCategory, onCategoryChange, onAddCategory }: CategoryTabsProps) {
  const tabVariants = {
    active: {
      scale: 1.05,
      boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.25)",
      transition: { type: "spring", stiffness: 400, damping: 15 }
    },
    inactive: {
      scale: 1,
      boxShadow: "none",
      transition: { duration: 0.2 }
    }
  };

  return (
    <motion.div 
      className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide"
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
          className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap ${
            activeCategory === category.id
              ? 'text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
          style={{
            backgroundColor: activeCategory === category.id ? category.color : undefined,
          }}
        >
          {category.name}
        </motion.button>
      ))}
      <motion.button
        onClick={onAddCategory}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 px-4 py-3 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700 hover:text-white whitespace-nowrap"
      >
        <Plus size={20} />
        <span>Ajouter</span>
      </motion.button>
    </motion.div>
  );
}