import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, Trash2 } from 'lucide-react';
import { Category } from '../types';
import { Button } from './ui/Button';
import { useAuth } from '../context/AuthContext';

interface CategoryContextMenuProps {
  contextMenu: { x: number; y: number; category: Category } | null;
  onClose: () => void;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
}

/**
 * Composant pour afficher le context menu des catégories
 * Utilise Portal pour le rendu en dehors de la hiérarchie DOM
 * Utilise Framer Motion pour les animations smooth
 */
export function CategoryContextMenu({
  contextMenu,
  onClose,
  onEdit,
  onDelete,
}: CategoryContextMenuProps) {
  const { hasPermission } = useAuth();

  if (!contextMenu) return null;

  return createPortal(
    <AnimatePresence>
      <>
        {/* Backdrop transparent - intercepte les clics pour fermer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998]"
          onClick={onClose}
        />

        {/* Menu contextuel avec animations spring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-48"
          style={{ top: contextMenu.y + 10, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Titre du menu - nom de la catégorie */}
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-semibold truncate text-gray-800">
              {contextMenu.category.name}
            </p>
          </div>

          {/* Actions */}
          <div className="py-1">
            {onEdit && (
              <Button
                onClick={() => onEdit(contextMenu.category)}
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-3 text-gray-700 hover:text-amber-700"
              >
                <Edit size={16} />
                Modifier
              </Button>
            )}
            {hasPermission('canDeleteProducts') && onDelete && (
              <Button
                onClick={() => onDelete(contextMenu.category)}
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
  );
}
