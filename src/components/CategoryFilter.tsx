// src/components/CategoryFilter.tsx
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from './ui/Card';
import { useCategoryContextMenu } from '../hooks/useCategoryContextMenu';
import { CategoryContextMenu } from './CategoryContextMenu';

// Style caramel premium exact du header
const CARAMEL_PREMIUM_GRADIENT = 'linear-gradient(135deg, hsla(38, 92%, 55%, 1) 0%, hsla(38, 92%, 38%, 1) 100%)';

const getButtonStyles = (isSelected: boolean) => {
    if (isSelected) {
        return {
            className: 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 text-white shadow-lg',
            style: { background: CARAMEL_PREMIUM_GRADIENT, boxShadow: '0 10px 25px -5px hsla(38, 92%, 40%, 0.4)' }
        };
    }
    return {
        className: 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-white/80 text-amber-800 border border-amber-200/50 hover:bg-amber-50 hover:border-amber-300/50 shadow-sm',
        style: {}
    };
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

    // Hook consolidé pour la gestion du context menu
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
                        className={getButtonStyles(selectedCategory === 'all').className}
                        style={getButtonStyles(selectedCategory === 'all').style}
                    >
                        Tout ({totalProducts})
                    </button>

                    {/* Individual category buttons */}
                    {categories.map((category) => {
                        const isSelected = selectedCategory === category.id;
                        const buttonStyles = getButtonStyles(isSelected);
                        return (
                            <button
                                key={category.id}
                                onClick={() => onSelectCategory(category.id)}
                                onMouseDown={(e) => handleMouseDown(e, category)}
                                onMouseUp={handleMouseUp}
                                onTouchStart={(e) => handleTouchStart(e, category)}
                                onTouchEnd={handleTouchEnd}
                                onContextMenu={(e) => handleContextMenu(e, category)}
                                className={buttonStyles.className}
                                style={buttonStyles.style}
                            >
                                {category.name} ({productCounts[category.id] || 0})
                            </button>
                        );
                    })}

                    {/* Add Category Button - Responsive */}
                    {onAddCategory && hasPermission('canAddProducts') && (
                        <>
                            {/* Mobile: Icon-only button */}
                            <motion.button
                                onClick={onAddCategory}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{ background: CARAMEL_PREMIUM_GRADIENT }}
                                className="block sm:hidden flex items-center justify-center w-10 h-10 rounded-lg text-white shadow-md transition-all"
                                title="Ajouter une catégorie"
                            >
                                <Plus size={20} />
                            </motion.button>

                            {/* Desktop: Text button */}
                            <motion.button
                                onClick={onAddCategory}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{ background: CARAMEL_PREMIUM_GRADIENT }}
                                className="hidden sm:flex items-center gap-2 px-4 py-2 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
                            >
                                <Plus size={16} />
                                Ajouter
                            </motion.button>
                        </>
                    )}
                </div>
            </Card>

            {/* Context Menu - Composant consolidé */}
            <CategoryContextMenu
                contextMenu={contextMenu}
                onClose={closeContextMenu}
                onEdit={onEditCategory}
                onDelete={onDeleteCategory}
            />
        </>
    );
}
