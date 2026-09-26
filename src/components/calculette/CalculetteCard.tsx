/**
 * CalculetteCard — carte d'un article sur l'écran de chiffrage.
 *
 * ⛔⛔ NE PAS REMPLACER PAR `ProductCard`. C'est délibéré :
 *
 *   `ProductCard` est construit AUTOUR DU STOCK. `availableStock` y alimente le
 *   badge, `isLowStock`, `isMaxReached` et le plafond du pavé
 *   (`maxQuantity = displayStock + quantityInCart`). Le neutraliser en passant
 *   `Infinity` afficherait littéralement « Infinity » dans le badge ET dans
 *   « N disponibles » du pavé. Et un « MAX » empêcherait de chiffrer 4 casiers.
 *
 * ⭐ ICI LE STOCK N'EXISTE PAS, à dessein. Chiffrer ne consomme rien : un
 * produit épuisé, un plat coupé se chiffrent. Leur ABSENCE de badge de stock
 * est aussi ce qui distingue visuellement cet écran de celui de la vente.
 */

import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { ProductCardImage } from '../ProductCardImage';
import { QuantityPad } from '../common/QuantityPad';

interface CalculetteCardProps {
  name: string;
  /**
   * Prix UNITAIRE À ANNONCER, déjà mis en forme par l'appelant.
   *
   * ⛔⛔ UNE CHAÎNE ET NON UN NOMBRE, et c'est le coeur du composant. Trois
   * réalités distinctes doivent pouvoir s'afficher ici, et aucune ne se déduit
   * d'un simple `number` :
   *   · un prix ferme                → « 1 000 F »
   *   · un plat à formats            → « 1 000 F - 2 500 F » (fourchette)
   *   · un produit sous promotion    → le prix REMISÉ, celui que la caisse
   *                                    facturera
   * Recalculer le prix ici rouvrirait la porte au défaut que cet écran doit
   * éviter avant tout : annoncer au client un montant que la caisse ne fera
   * pas payer.
   */
  priceLabel: string;
  /**
   * Prix barré — le prix AVANT remise, quand une promotion s'applique.
   * `undefined` = aucune promotion, rien n'est barré.
   */
  originalPriceLabel?: string;
  image?: string | null;
  /** Quantité déjà sélectionnée — 0 = aucune pastille. */
  quantity: number;
  /**
   * Quantité annoncée par le pavé.
   *
   * ⛔ Pour un PLAT À FORMATS, l'appelant DOIT passer 0 et non `quantity` :
   * la pastille cumule les formats d'un même plat (un Grand + deux Petits → 3)
   * alors que le pavé REMPLACE UNE SEULE ligne. Annoncer « 3 » puis appliquer
   * 6 à la ligne Grand donnerait 8 — un chiffre jamais demandé. Même règle et
   * même raison que `DishGrid`.
   */
  padCurrentQuantity?: number;
  /**
   * Article indisponible à la vente (produit épuisé, plat « coupé »).
   *
   * ⭐ MARQUEUR VISUEL SEULEMENT — la carte reste PLEINEMENT cliquable, à
   * l'inverse de `DishGrid` qui la désactive. C'est la raison d'être de cet
   * écran : « c'est 2 500, mais c'est terminé pour ce soir » suppose de
   * pouvoir chiffrer ce qu'on ne peut pas servir. Garder l'article SANS le
   * signaler serait le pire des deux mondes — le serveur annoncerait un prix
   * sans savoir qu'il ne peut pas l'honorer.
   */
  unavailableLabel?: string;
  /** `quantity` REMPLACE la quantité de la ligne (pavé). Absente : +1. */
  onPick: (quantity?: number) => void;
  priority?: boolean;
}

export const CalculetteCard = memo<CalculetteCardProps>(function CalculetteCard({
  name,
  priceLabel,
  originalPriceLabel,
  image,
  quantity,
  padCurrentQuantity,
  unavailableLabel,
  onPick,
  priority = false,
}) {
  const [isPadOpen, setIsPadOpen] = useState(false);

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={() => onPick()}
      className={`
        relative flex flex-col h-full
        rounded-2xl bg-card border shadow-sm
        ${quantity > 0 ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-border'}
        overflow-hidden cursor-pointer select-none touch-manipulation
        transition-all duration-200 ease-out
      `}
    >
      {/*
        ⭐ PASTILLE = QUANTITÉ CHOISIE, et rien d'autre. Sur l'écran de vente
        le même emplacement porte le STOCK — c'est volontairement différent
        ici : deux écrans qui se ressemblent doivent différer là où le regard
        se pose en premier.

        ⚠️ `stopPropagation` INDISPENSABLE : sans lui le clic remonterait à la
        carte et ajouterait +1 en plus d'ouvrir le pavé.
      */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsPadOpen(true);
        }}
        aria-label={`Saisir une quantité pour ${name}`}
        className={`
          absolute top-2 right-2 z-20
          ${quantity > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/60'} text-white
          text-micro font-semibold px-2 py-0.5 rounded-full tabular-nums
          active:scale-90 transition-transform ring-1 ring-white/40
        `}
      >
        {quantity > 0 ? quantity : '+'}
      </button>

      <div className="aspect-square bg-white p-2 flex items-center justify-center border-b border-border overflow-hidden">
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          {image ? (
            <ProductCardImage src={image} alt={name} priority={priority} />
          ) : (
            <div className="w-10 h-10 bg-brand-subtle rounded-xl flex items-center justify-center text-brand-primary/50">
              <Package size={20} strokeWidth={1.5} />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-2 flex flex-col justify-between gap-1">
        <p className="text-caption font-medium text-foreground line-clamp-2 leading-tight">{name}</p>
        <div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <p className="text-body-sm font-black text-foreground tabular-nums">{priceLabel}</p>
            {/* ⭐ Prix barré : le serveur doit pouvoir dire « normalement
                1 000, avec la promo 800 ». Sans lui, le prix remisé seul
                paraîtrait être une erreur de tarif. */}
            {originalPriceLabel && (
              <p className="text-micro text-muted-foreground line-through tabular-nums">
                {originalPriceLabel}
              </p>
            )}
          </div>
          {unavailableLabel && (
            <p className="text-micro font-medium text-red-600 dark:text-red-400">
              {unavailableLabel}
            </p>
          )}
        </div>
      </div>

      {/*
        ⛔⛔ `isPadOpen &&` INDISPENSABLE — sans cette garde, CHAQUE carte de la
        grille monte son propre `Modal`. Sur 40 articles : 40 dialogues, 40
        listeners ESC, et surtout le verrou de défilement de `Modal` dont le
        cleanup est INCONDITIONNEL — démonter une carte voisine (recherche,
        changement de catégorie) libère le verrou d'un pavé encore ouvert, et
        la page défile derrière le dialogue. `ProductCard` et `DishGrid`
        appliquent tous deux cette garde, pour ce défaut constaté en test.

        ⭐⭐ PORTAL : un pavé rendu DANS la carte hérite de ses contraintes de
        mise en page (`overflow-hidden`, transform Framer Motion — cette carte
        a LES DEUX), qui rognent l'overlay `fixed inset-0` et rendent le
        dialogue impossible à fermer. Constaté en test terrain le 13/09/2026.

        ⛔ AUCUN `maxQuantity` : chiffrer 48 bouteilles est légitime. Le pavé
        traite proprement cette absence (aucun preset grisé, aucune mention
        « N disponibles »).
      */}
      {isPadOpen && createPortal(
        <QuantityPad
          open={isPadOpen}
          onClose={() => setIsPadOpen(false)}
          itemName={name}
          currentQuantity={padCurrentQuantity ?? quantity}
          onPick={(picked) => onPick(picked)}
        />,
        document.body
      )}
    </motion.div>
  );
});

CalculetteCard.displayName = 'CalculetteCard';
