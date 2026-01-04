import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

export interface DropdownMenuItemProps {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  icon?: React.ReactNode;
}

interface DropdownMenuProps {
  items: DropdownMenuItemProps[];
  triggerIcon?: React.ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
}

/**
 * Dropdown Menu Component
 * Responsive menu component for mobile action buttons
 * Auto-closes when clicking outside or on an item
 */
export function DropdownMenu({
  items,
  triggerIcon,
  triggerClassName = '',
  menuClassName = ''
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleItemClick = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  const styles = {
    trigger:
      'p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors relative z-20',
    menu: 'absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-max',
    item: 'px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors flex items-center gap-2 whitespace-nowrap',
    itemDanger: 'px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer transition-colors flex items-center gap-2 whitespace-nowrap',
  };

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={triggerClassName || styles.trigger}
        aria-label="Menu d'actions"
        aria-expanded={isOpen}
      >
        {triggerIcon || <MoreVertical size={18} />}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={menuClassName || styles.menu}
          role="menu"
          aria-orientation="vertical"
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => handleItemClick(item.onClick)}
              className={item.variant === 'danger' ? styles.itemDanger : styles.item}
              role="menuitem"
            >
              {item.icon && <span className="w-4 h-4">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
