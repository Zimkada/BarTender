// src/components/CategoryFilter.tsx
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCategoryContextMenu } from '../hooks/useCategoryContextMenu';
import { CategoryContextMenu } from './CategoryContextMenu';

// Filter chips — style moderne 2026 (Linear/Spotify/Stripe)
// Capitalisation naturelle, poids medium, états clairs sans uppercase
const getButtonClasses = (isSelected: boolean) => {
    const base = 'px-3.5 py-1.5 rounded-full text-caption transition-all duration-150 border';
    if (isSelected) {
        return `${base} bg-brand-primary text-white border-brand-primary shadow-sm font-semibold`;
    }
    return `${base} bg-white text-gray-700 border-gray-200 hover:border-brand-primary/40 hover:bg-brand-subtle font-medium`;
};

interface CategoryFilterProps {
    categories: Category[];
    selectedCategory: string;
    onSelectCategory: (categoryId: string) => void;
    productCounts?: Record<string, number>;
    onEditCategory?: (category: Category) => void;
    onDeleteCategory?: (category: Category) => void;
    onAddCategory?: () => void;
}

export function CategoryFilter({
    categories,
    selectedCategory,
    onSelectCategory,
    productCounts = {},
    onEditCategory,
    onDeleteCategory,
    onAddCategory
}: CategoryFilterProps) {
    const { hasPermission } = useAuth();
    const totalProducts = Object.values(productCounts).reduce((sum, count) => sum + count, 0);

    const {
        contextMenu,
        handleMouseDown,
        handleMouseUp,
        handleTouchStart,
        handleTouchEnd,
        handleContextMenu,
        closeContextMenu,
    } = useCategoryContextMenu({
        onEdit: onEditCategory,
        onDelete: onDeleteCategory,
    });

    return (
        <>
            <div className="space-y-2">
                <p className="text-micro text-gray-500 uppercase">Catégories</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => onSelectCategory('all')}
                        className={getButtonClasses(selectedCategory === 'all')}
                    >
                        Tout <span className="opacity-60 ml-0.5">({totalProducts})</span>
                    </button>

                    {categories.map((category) => (
                        <button
                            key={category.id}
                            onClick={() => onSelectCategory(category.id)}
                            onMouseDown={(e) => handleMouseDown(e, category)}
                            onMouseUp={handleMouseUp}
                            onTouchStart={(e) => handleTouchStart(e, category)}
                            onTouchEnd={handleTouchEnd}
                            onContextMenu={(e) => handleContextMenu(e, category)}
                            className={getButtonClasses(selectedCategory === category.id)}
                        >
                            {category.name} <span className="opacity-60 ml-0.5">({productCounts[category.id] || 0})</span>
                        </button>
                    ))}

                    {onAddCategory && hasPermission('canAddProducts') && (
                        <motion.button
                            onClick={onAddCategory}
                            whileTap={{ scale: 0.96 }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption border border-dashed border-gray-300 text-gray-500 hover:text-brand-primary hover:border-brand-primary/40 transition-colors"
                            title="Ajouter une catégorie"
                        >
                            <Plus size={14} />
                            <span className="hidden sm:inline">Nouvelle</span>
                        </motion.button>
                    )}
                </div>
            </div>

            <CategoryContextMenu
                contextMenu={contextMenu}
                onClose={closeContextMenu}
                onEdit={onEditCategory}
                onDelete={onDeleteCategory}
            />
        </>
    );
}
