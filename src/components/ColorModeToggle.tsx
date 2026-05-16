import React from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useColorMode, ColorMode } from '../context/ColorModeContext';

interface ColorModeToggleProps {
  /** Variant 'header' = glass button cohérent avec liquid-gold-header (white/15 + border-white/20) */
  variant?: 'header' | 'default';
  className?: string;
}

/**
 * Bouton cyclique de bascule entre les modes d'affichage.
 * Cycle : Système → Clair → Sombre → Système → ...
 *
 * Pattern utilisé par Vercel, Linear, GitHub : un seul bouton qui change d'icône
 * (Monitor / Sun / Moon) selon le mode actuel. Aucun menu, aucun popover —
 * 1 clic = 1 transition. L'utilisateur découvre rapidement les 3 états en cliquant.
 */
export function ColorModeToggle({ variant = 'default', className = '' }: ColorModeToggleProps) {
  const { colorMode, setColorMode } = useColorMode();

  const next: ColorMode =
    colorMode === 'system' ? 'light' : colorMode === 'light' ? 'dark' : 'system';

  const Icon =
    colorMode === 'system' ? Monitor : colorMode === 'light' ? Sun : Moon;

  const label =
    colorMode === 'system'
      ? 'Mode actuel : Système. Cliquer pour passer en mode Clair.'
      : colorMode === 'light'
        ? 'Mode actuel : Clair. Cliquer pour passer en mode Sombre.'
        : 'Mode actuel : Sombre. Cliquer pour suivre le système.';

  const tooltip =
    colorMode === 'system' ? 'Système' : colorMode === 'light' ? 'Clair' : 'Sombre';

  const baseClasses =
    variant === 'header'
      ? 'p-1.5 sm:p-2 glass-button-2026 rounded-xl text-white active:scale-95 transition-all flex-shrink-0'
      : 'p-2 rounded-lg text-foreground/70 hover:text-foreground hover:bg-muted transition-colors';

  return (
    <button
      onClick={() => setColorMode(next)}
      className={`${baseClasses} ${className}`}
      aria-label={label}
      title={tooltip}
    >
      <Icon size={variant === 'header' ? 16 : 18} />
    </button>
  );
}
