import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Category } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onAddCategory?: () => void;
  onEditCategory?: (category: Category) => void;
  onDeleteCategory?: (categoryId: string) => void;
}

export function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
  onAddCategory,
  onEditCategory,
  onDeleteCategory
}: CategoryTabsProps) {
  const { hasPermission } = useAuth();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; category: Category } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  const canEdit = hasPermission('canEditProducts') && !!onEditCategory;

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
      e.preventDefault(); // Prevent scrolling and other touch actions
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

  const tabVariants = {
    active: { scale: 1.02, transition: { type: "spring" as const, stiffness: 400, damping: 15 } },
    inactive: { scale: 1, transition: { duration: 0.2 } }
  } as const;

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-amber-100">
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => (
          <motion.button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
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
            variants={tabVariants}
            initial="inactive"
            animate={activeCategory === category.id ? "active" : "inactive"}
            whileHover={{ y: canEdit ? -2 : 0 }}
            whileTap={{ scale: 0.98 }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium whitespace-nowrap transition-all ${activeCategory === category.id
                ? 'bg-gradient-to-br from-amber-50 to-amber-50 text-amber-600 shadow-md border border-amber-300 font-semibold'
                : 'bg-transparent text-gray-600 hover:bg-white/50'
              }`}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name}
          </motion.button>
        ))}
        {hasPermission('canAddProducts') && onAddCategory && (
          <motion.button
            onClick={onAddCategory}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-full font-medium hover:bg-amber-200 whitespace-nowrap transition-colors"
          >
            <Plus size={16} />
            <span>Ajouter</span>
          </motion.button>
        )}
      </div>

      {contextMenu && createPortal(
        <AnimatePresence>
          <>
            {/* Backdrop transparent pour garantir z-index au-dessus de tout */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9998]"
              onClick={() => setContextMenu(null)}
            />

            {/* Menu contextuel */}
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
                  <button
                    onClick={() => {
                      onEditCategory(contextMenu.category);
                      setContextMenu(null);
                    }}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-colors"
                  >
                    <Edit size={16} />
                    Modifier
                  </button>
                )}
                {hasPermission('canDeleteProducts') && onDeleteCategory && (
                  <button
                    onClick={() => {
                      onDeleteCategory(contextMenu.category.id);
                      setContextMenu(null);
                    }}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 size={16} />
                    Supprimer
                  </button>
                )}
              </div>
            </motion.div>
          </>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
