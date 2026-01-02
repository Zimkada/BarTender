import React from 'react';

// On étend les props HTML standard du bouton pour une flexibilité maximale
// (par exemple, pour pouvoir passer `disabled`, `type`, etc.).
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // `aria-label` est la seule prop que nous rendons explicitement obligatoire.
  'aria-label': string;
  // L'icône ou tout autre contenu sera passé via `children`.
  children: React.ReactNode;
}

/**
 * Un composant "IconButton" qui force la présence d'un `aria-label` pour l'accessibilité.
 * Il accepte une icône passée en tant que `children` et se comporte comme un <button> standard.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, className, 'aria-label': ariaLabel, ...props }, ref) => {
    
    // Classes de base pour assurer un alignement correct de l'icône.
    // On pourra y ajouter des styles par défaut (taille, couleur, etc.) plus tard si besoin.
    const baseClassName = "inline-flex items-center justify-center";

    return (
      <button
        ref={ref}
        aria-label={ariaLabel}
        // On combine les classes de base avec celles passées en props pour la personnalisation.
        className={[baseClassName, className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
