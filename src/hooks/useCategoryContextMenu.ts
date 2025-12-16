import { useState, useRef, useEffect } from 'react';
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';

interface ContextMenuState {
  x: number;
  y: number;
  category: Category;
}

interface UseCategoryContextMenuProps {
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
}

/**
 * Hook pour gérer le context menu des catégories
 * Gère: long-press (500ms), right-click, click outside
 */
export function useCategoryContextMenu({
  onEdit,
  onDelete,
}: UseCategoryContextMenuProps) {
  const { hasPermission } = useAuth();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  const canEdit = hasPermission('canEditProducts') && !!onEdit;

  /**
   * Gère le mouse down pour détecter long-press (500ms)
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>, category: Category) => {
    if (!canEdit) return;
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: e.clientX, y: e.clientY, category });
    }, 500);
  };

  /**
   * Annule le timer du long-press si souris relâchée avant 500ms
   */
  const handleMouseUp = () => {
    clearTimeout(longPressTimer.current);
  };

  /**
   * Gère le touch start pour détecter long-press sur mobile (500ms)
   */
  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>, category: Category) => {
    if (!canEdit) return;
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: e.touches[0].clientX, y: e.touches[0].clientY, category });
    }, 500);
  };

  /**
   * Annule le timer du long-press tactile
   */
  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
  };

  /**
   * Gère le right-click pour afficher le context menu
   */
  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>, category: Category) => {
    if (!canEdit) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, category });
  };

  /**
   * Ferme le context menu
   */
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  /**
   * Gère le clic sur "Modifier"
   */
  const handleEdit = (category: Category) => {
    if (onEdit) {
      onEdit(category);
      closeContextMenu();
    }
  };

  /**
   * Gère le clic sur "Supprimer"
   */
  const handleDelete = (category: Category) => {
    if (onDelete) {
      onDelete(category);
      closeContextMenu();
    }
  };

  /**
   * Ferme le menu si on clique en dehors
   */
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    if (contextMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu]);

  return {
    contextMenu,
    canEdit,
    closeContextMenu,
    handleMouseDown,
    handleMouseUp,
    handleTouchStart,
    handleTouchEnd,
    handleContextMenu,
    handleEdit,
    handleDelete,
  };
}
