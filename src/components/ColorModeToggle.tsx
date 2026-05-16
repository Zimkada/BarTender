import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useColorMode } from '../context/ColorModeContext';

interface ColorModeToggleProps {
  /** Variant 'header' = glass button cohérent avec liquid-gold-header (white/15 + border-white/20) */
  variant?: 'header' | 'default';
  className?: string;
}

/**
 * Bouton de bascule entre Clair et Sombre, pour usage en accès rapide (header).
 *
 * Comportement :
 * - Affiche Sun ou Moon selon le mode EFFECTIVEMENT appliqué (resolvedMode).
 *   Jamais l'icône Monitor — pour éviter toute confusion dans le header.
 * - 1 clic = bascule vers l'opposé du mode actuel (force light ↔ dark).
 *   Si l'utilisateur était en mode 'system', le bouton "casse" ce lien et
 *   force désormais light ou dark explicitement.
 * - Pour revenir au mode 'system' (suivre l'OS), l'utilisateur va dans
 *   Profil → Apparence, qui propose les 3 options (Système / Clair / Sombre).
 */
export function ColorModeToggle({ variant = 'default', className = '' }: ColorModeToggleProps) {
  const { resolvedMode, setColorMode } = useColorMode();

  const isDark = resolvedMode === 'dark';
  const Icon = isDark ? Sun : Moon;
  const next = isDark ? 'light' : 'dark';

  const label = isDark
    ? 'Mode actuel : Sombre. Cliquer pour passer en mode Clair.'
    : 'Mode actuel : Clair. Cliquer pour passer en mode Sombre.';

  const tooltip = isDark ? 'Passer en mode Clair' : 'Passer en mode Sombre';

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
