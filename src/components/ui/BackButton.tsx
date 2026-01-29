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
    /** Si faux, n'affiche que l'icône (par défaut: false) */
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
        showLabel = false,
        className,
        variant = "glass",
        size,
        ...props
    }, ref) => {
        const Icon = iconType === "arrow" ? ArrowLeft : ChevronLeft;

        return (
            <Button
                variant={variant}
                size={size || (showLabel ? "sm" : "icon")}
                className={cn(
                    "transition-colors font-semibold flex-shrink-0",
                    !showLabel && "w-10 h-10 sm:w-11 sm:h-11 rounded-xl", // Match PageHeader default size & shape (rounded-xl comes from glass class usually, but let's ensure)
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
