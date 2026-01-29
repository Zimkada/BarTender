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
        return 'glass-action-button-active-2026 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all duration-200';
    }
    return 'glass-action-button-2026 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all duration-200 opacity-70';
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
            <Card variant="elevated" padding="sm" className="border-brand-subtle bg-white/40 backdrop-blur-md overflow-hidden relative">
                <div className="absolute -top-10 -left-10 w-24 h-24 bg-brand-primary/5 blur-3xl rounded-full"></div>
                <div className="flex flex-col mb-4 relative z-10">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter leading-none">Nos</h3>
                    <h4 className="text-sm font-black text-brand-primary uppercase tracking-tighter leading-tight">Catégories</h4>
                </div>
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
                                className="glass-action-button-active-2026 hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight"
                            >
                                <Plus size={16} />
                                Nouveau
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
