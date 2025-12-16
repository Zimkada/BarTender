// src/components/CategoryFilter.tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { Edit, Trash2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

const categoryButtonVariants = cva(
    'px-4 py-2 rounded-lg font-medium transition-colors',
    {
        variants: {
            isSelected: {
                true: 'bg-amber-500 text-white',
                false: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            },
        },
        defaultVariants: {
            isSelected: false,
        },
    }
);

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
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; category: Category } | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

    const canEdit = hasPermission('canEditProducts') && !!onEditCategory;
    const totalProducts = Object.values(productCounts).reduce((sum, count) => sum + count, 0);

    const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>, category: Category) => {
        if (!canEdit) return;
        longPressTimer.current = setTimeout(() => {
            setContextMenu({ x: e.clientX, y: e.clientY, category });
        }, 500);
    };

    const handleMouseUp = () => {
        clearTimeout(longPressTimer.current);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>, category: Category) => {
        if (!canEdit) return;
        longPressTimer.current = setTimeout(() => {
            e.preventDefault();
            setContextMenu({ x: e.touches[0].clientX, y: e.touches[0].clientY, category });
        }, 500);
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimer.current);
    };

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        if (contextMenu) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => {
            window.removeEventListener('click', handleClickOutside);
        };
    }, [contextMenu]);

    return (
        <>
            <Card variant="elevated" padding="sm" className="border-amber-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Catégories</h3>
                <div className="flex flex-wrap gap-2">
                    {/* All categories button */}
                    <button
                        onClick={() => onSelectCategory('all')}
                        className={cn(categoryButtonVariants({ isSelected: selectedCategory === 'all' }))}
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
                            onContextMenu={(e) => {
                                if (canEdit) {
                                    e.preventDefault();
                                    setContextMenu({ x: e.clientX, y: e.clientY, category });
                                }
                            }}
                            className={cn(categoryButtonVariants({ isSelected: selectedCategory === category.id }))}
                        >
                            {category.name} ({productCounts[category.id] || 0})
                        </button>
                    ))}

                    {/* Add Category Button - Responsive */}
                    {onAddCategory && hasPermission('canAddProducts') && (
                        <>
                            {/* Mobile: Icon-only button */}
                            <motion.button
                                onClick={onAddCategory}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="block sm:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                title="Ajouter une catégorie"
                            >
                                <Plus size={20} />
                            </motion.button>

                            {/* Desktop: Text button */}
                            <motion.button
                                onClick={onAddCategory}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200 transition-colors"
                            >
                                <Plus size={16} />
                                Ajouter
                            </motion.button>
                        </>
                    )}
                </div>
            </Card>

            {/* Context Menu */}
            {contextMenu && createPortal(
                <AnimatePresence>
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9998]"
                            onClick={() => setContextMenu(null)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-48"
                            style={{ top: contextMenu.y + 10, left: contextMenu.x }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className='px-3 py-2 border-b border-gray-100'>
                                <p className='text-sm font-semibold truncate text-gray-800'>{contextMenu.category.name}</p>
                            </div>
                            <div className='py-1'>
                                {onEditCategory && (
                                    <Button
                                        onClick={() => {
                                            onEditCategory(contextMenu.category);
                                            setContextMenu(null);
                                        }}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start gap-3 text-gray-700 hover:text-amber-700"
                                    >
                                        <Edit size={16} />
                                        Modifier
                                    </Button>
                                )}
                                {hasPermission('canDeleteProducts') && onDeleteCategory && (
                                    <Button
                                        onClick={() => {
                                            onDeleteCategory(contextMenu.category);
                                            setContextMenu(null);
                                        }}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start gap-3 text-red-600 hover:text-red-700"
                                    >
                                        <Trash2 size={16} />
                                        Supprimer
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    </>
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}
