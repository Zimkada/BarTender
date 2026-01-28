// src/components/CategoryFilter.tsx
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from './ui/Card';
import { useCategoryContextMenu } from '../hooks/useCategoryContextMenu';
import { CategoryContextMenu } from './CategoryContextMenu';

// Styles pour les boutons de catégorie
// Utilise la classe CSS glass-action-button-active-2026 qui utilise var(--brand-gradient)
const getButtonClasses = (isSelected: boolean) => {
    if (isSelected) {
        // Bouton actif : utilise le gradient brand via CSS
        return 'glass-action-button-active-2026 px-4 py-2 rounded-lg font-semibold transition-all duration-200';
    }
    return 'glass-action-button-2026 px-4 py-2 rounded-lg font-semibold transition-all duration-200';
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
            <Card variant="elevated" padding="sm" className="border-amber-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Catégories</h3>
                <div className="flex flex-wrap gap-2">
                    {/* All categories button */}
                    <button
                        onClick={() => onSelectCategory('all')}
                        className={getButtonClasses(selectedCategory === 'all')}
                    >
                        Tout ({totalProducts})
                    </button>

                    {/* Individual category buttons */}
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
                            {category.name} ({productCounts[category.id] || 0})
                        </button>
                    ))}

                    {/* Add Category Button */}
                    {onAddCategory && hasPermission('canAddProducts') && (
                        <>
                            {/* Mobile: Icon-only button */}
                            <motion.button
                                onClick={onAddCategory}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="glass-action-button-active-2026 block sm:hidden flex items-center justify-center w-10 h-10 rounded-lg"
                                title="Ajouter une catégorie"
                            >
                                <Plus size={20} />
                            </motion.button>

                            {/* Desktop: Text button */}
                            <motion.button
                                onClick={onAddCategory}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="glass-action-button-active-2026 hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
                            >
                                <Plus size={16} />
                                Ajouter
                            </motion.button>
                        </>
                    )}
                </div>
            </Card>

            <CategoryContextMenu
                contextMenu={contextMenu}
                onClose={closeContextMenu}
                onEdit={onEditCategory}
                onDelete={onDeleteCategory}
            />
        </>
    );
}
