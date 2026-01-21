import * as React from "react";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Button, ButtonProps } from "./Button";
import { cn } from "../../lib/utils";

/**
 * Props pour le composant BackButton
 * @extends ButtonProps - Hérite de toutes les propriétés du composant Button standard
 */
export interface BackButtonProps extends ButtonProps {
    /** Le texte à afficher à côté de l'icône (par défaut: "Retour") */
    label?: string;
    /** Le type d'icône à utiliser (par défaut: "arrow") */
    iconType?: 'arrow' | 'chevron';
    /** Si faux, n'affiche que l'icône (par défaut: true) */
    showLabel?: boolean;
}

/**
 * Un composant de retour en arrière unifié pour le design system.
 * Utilisé pour la navigation interne (ex: quitter un formulaire, revenir à une étape).
 */
export const BackButton = React.forwardRef<HTMLButtonElement, BackButtonProps>(
    ({
        label = "Retour",
        iconType = "arrow",
        showLabel = true,
        className,
        variant = "ghost",
        size,
        ...props
    }, ref) => {
        const Icon = iconType === "arrow" ? ArrowLeft : ChevronLeft;

        return (
            <Button
                variant={variant}
                size={size || (showLabel ? "sm" : "icon")}
                className={cn(
                    "text-gray-500 hover:text-gray-900 transition-colors font-semibold",
                    !showLabel && "rounded-full",
                    className
                )}
                ref={ref}
                {...props}
            >
                <Icon
                    size={showLabel ? 18 : 22}
                    className={cn(showLabel && "mr-1.5")}
                />
                {showLabel && <span>{label}</span>}
            </Button>
        );
    }
);

BackButton.displayName = "BackButton";
