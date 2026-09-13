import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, Plus, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { ProductCardImage } from './ProductCardImage';
import { QuantityPad } from './common/QuantityPad';

interface ProductCardProps {
  product: Product;
  /**
   * ⭐ `quantity` REMPLACE la quantité de la ligne (saisie au pavé). Absente,
   * le comportement historique s'applique : +1.
   */
  onAddToCart: (product: Product, quantity?: number) => void;
  availableStock?: number;
  quantityInCart?: number; // ✨ Ajout : Quantité déjà présente dans le panier
  priority?: boolean; // ✨ Pour l'optimisation LCP
  /**
   * Le badge ouvre-t-il le pavé de quantité ? (défaut : oui)
   * ⛔ `false` sur un écran de simple SÉLECTION (cf. `SwapProductSelector`) :
   * proposer une saisie que l'appelant jette est pire que ne rien proposer.
   */
  allowQuantityPad?: boolean;
}

export function ProductCard({ product, onAddToCart, availableStock, quantityInCart = 0, priority = false, allowQuantityPad = true }: ProductCardProps) {
  const { formatPrice } = useCurrencyFormatter();
  const [isPadOpen, setIsPadOpen] = useState(false);

  // Priorité au stock "calculé" (disponible) s'il est fourni, sinon stock physique
  const displayStock = availableStock !== undefined ? availableStock : product.stock;
  const isLowStock = displayStock <= product.alertThreshold;
  const isStockEmpty = displayStock <= 0;

  // 🛡️ Détection du stock maximum atteint dans le panier
  const isMaxReached = quantityInCart >= displayStock && !isStockEmpty;

  const [showFeedback, setShowFeedback] = useState(false);
  const { itemAddedToCart } = useFeedback();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isStockEmpty || isMaxReached) return;

    if (navigator.vibrate) navigator.vibrate(10);

    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 800);

    onAddToCart(product);
    itemAddedToCart(product.name);
  };

  const getStockStatus = () => {
    if (isStockEmpty) return { color: 'bg-red-500', label: 'Épuisé' };
    if (isMaxReached) return { color: 'bg-orange-600', label: 'MAX' };
    if (isLowStock) return { color: 'bg-orange-400', label: displayStock };
    return { color: 'bg-emerald-500', label: displayStock };
  };

  const status = getStockStatus();

  return (
    <motion.div
      whileTap={!isMaxReached ? { scale: 0.97 } : {}}
      animate={showFeedback ? { borderColor: 'var(--brand-primary)' } : {}}
      transition={{ duration: 0.15 }}
      onClick={handleAddToCart}
      className={`
        relative flex flex-col h-full
        rounded-2xl bg-card border shadow-sm
        ${showFeedback
          ? 'border-brand-primary ring-2 ring-brand-primary/20'
          : isMaxReached
            ? 'border-amber-300 dark:border-amber-700/50'
            : 'border-border hover:border-brand-primary/40 hover:shadow-md'
        }
        overflow-hidden cursor-pointer select-none
        touch-manipulation
        transition-all duration-200 ease-out
        ${isStockEmpty ? 'opacity-60' : ''}
        ${isMaxReached ? 'cursor-default' : ''}
      `}
    >
      {/* Stock Badge — DOUBLE RÔLE : afficher le stock, ouvrir le pavé.
          ⭐⭐ C'EST LE DÉCLENCHEUR DU PAVÉ DE QUANTITÉ (objection terrain :
          six bières = six taps). Le tap sur la CARTE reste +1, inchangé.
          ⛔ Écarté : l'appui long sur la carte. À 500 ms, un serveur pressé
          qui relâche trop tôt obtient un +1 SILENCIEUX au lieu du pavé — une
          erreur invisible sur le geste le plus fréquent du service. Ici chaque
          cible fait exactement une chose.
          ⚠️ `stopPropagation` INDISPENSABLE : sans lui, le clic remonterait à
          la carte et ajouterait +1 en plus d'ouvrir le pavé.
          ⛔ INERTE sur stock épuisé seulement — PAS sur « MAX atteint »
          (deux revues, deux erreurs opposées le 13/09/2026) :
          · le neutraliser sur `isMaxReached` PARAÎT juste, mais sur
            `QuickSaleFlow` le stock reçu est DÉJÀ NET du panier : avec 12 en
            stock et 6 au panier, `isMaxReached` est vrai et le pavé devenait
            inerte — impossible de demander le casier plein, sur l'écran même
            qu'il vient soulager ;
          · le laisser actif est donc le bon choix, et le plafond
            (`displayStock + quantityInCart`, cf. plus bas) garantit qu'aucune
            valeur proposée ne dépasse le stock réel. Le pavé reste utile en
            état MAX : il sert justement à RÉDUIRE une ligne trop remplie. */}
      {isStockEmpty || !allowQuantityPad ? (
        <div
          className={`
            absolute top-2 right-2 z-10
            ${status.color} text-white
            text-micro font-semibold px-2 py-0.5 rounded-full
            tabular-nums
          `}
        >
          {status.label}
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsPadOpen(true);
          }}
          aria-label={`Saisir une quantité pour ${product.name}`}
          className={`
            absolute top-2 right-2 z-20
            ${status.color} text-white
            text-micro font-semibold px-2 py-0.5 rounded-full
            tabular-nums
            active:scale-90 transition-transform
            ring-1 ring-white/40
          `}
        >
          {status.label}
        </button>
      )}

      {/* Image */}
      <div className="aspect-square bg-white p-2 flex items-center justify-center relative group border-b border-border overflow-hidden">
        {isLowStock && !isStockEmpty && !isMaxReached && (
          <div className="absolute top-2 left-2 text-amber-600 dark:text-amber-400 bg-card/90 rounded-full p-1 shadow-sm">
            <AlertTriangle size={12} />
          </div>
        )}

        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          {product.image ? (
            <ProductCardImage
              src={product.image}
              alt={product.name}
              priority={priority}
            />
          ) : (
            <div className="w-10 h-10 bg-brand-subtle rounded-xl flex items-center justify-center text-brand-primary/50">
              <Package size={20} strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* Success overlay */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-brand-primary/85 flex items-center justify-center z-20"
            >
              <div className="bg-card rounded-full p-2 shadow-lg">
                <Check className="text-brand-primary w-5 h-5" strokeWidth={3} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="text-body-sm font-semibold text-foreground leading-tight line-clamp-2 min-h-[2.4em]">
            {product.name}
          </h3>
          <p className="text-micro text-muted-foreground mt-0.5 uppercase">{product.volume}</p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-micro text-muted-foreground">Prix</span>
            <span className="text-body-sm font-semibold text-foreground tabular-nums">
              {formatPrice(product.price)}
            </span>
          </div>

          <div
            className={`
              w-8 h-8 rounded-xl flex items-center justify-center
              transition-colors
              ${isStockEmpty || isMaxReached
                ? 'bg-muted text-muted-foreground'
                : 'bg-brand-primary text-white shadow-sm hover:shadow'
              }
            `}
          >
            <Plus size={16} strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* ⭐ Pavé de quantité — SORTI DE LA CARTE PAR UN PORTAL.
          ⛔⛔ SIGNALÉ EN TEST TERRAIN LE 13/09/2026 : le pavé était impossible
          à fermer — ni par un preset, ni par la croix, ni par l'overlay.
          CAUSE : rendu à l'intérieur de la carte, il en héritait deux
          contraintes fatales :
            · `overflow-hidden` sur la racine ROGNE tout descendant ;
            · `motion.div` applique un `transform` (whileTap/animate), ce qui
              fait de la carte le conteneur de référence des descendants
              `position: fixed` — l'overlay `inset-0` du Modal ne couvrait donc
              plus l'écran mais la seule carte, réduite à quelques pixels.
          Les clics n'atteignaient plus aucune cible de fermeture.
          ⭐ `createPortal` rend le pavé directement sous `document.body` : il
          échappe au rognage ET au transform. Il sort aussi de l'arbre DOM de la
          carte, mais React continue d'y propager les événements — d'où le
          `stopPropagation` conservé, sans quoi un clic dans le pavé
          déclencherait encore le `onClick` (+1) de la carte.
          ⚠️ `DishCard` n'avait pas ce défaut : son wrapper `<div relative>` n'a
          ni `overflow-hidden` ni transform. La différence ne se voyait pas en
          lisant un seul des deux fichiers — elle s'est vue au premier clic. */}
      {isPadOpen && createPortal(
        <div onClick={(e) => e.stopPropagation()}>
          <QuantityPad
            open={isPadOpen}
            onClose={() => setIsPadOpen(false)}
            itemName={product.name}
            currentQuantity={quantityInCart}
            /**
             * ⭐⭐ PLAFOND = stock affiché + ce qui est DÉJÀ au panier.
             *
             * ⛔ `displayStock` seul serait FAUX sur l'écran de vente rapide.
             * `QuickSaleFlow` passe un stock dont le panier est déjà déduit
             * (`availableStockByProductId`) : avec 12 en stock et 2 au panier,
             * il vaut 10. Or le pavé REMPLACE la quantité — demander 12 est
             * légitime, et le plafonner à 10 interdirait le casier plein
             * précisément sur l'écran que ce pavé vient soulager.
             *
             * ⚠️ Sur `HomePage`, `getAvailableStock` ne déduit PAS le panier :
             * `quantityInCart` y vaut ce que la ligne porte déjà, et la somme
             * redonne le stock réel. La formule est donc juste des DEUX côtés
             * — c'est ce qui permet de ne pas ajouter une prop de plus.
             */
            maxQuantity={displayStock + quantityInCart}
            onPick={(quantity) => {
              onAddToCart(product, quantity);
              if (navigator.vibrate) navigator.vibrate(10);
              itemAddedToCart(product.name);
            }}
          />
        </div>,
        document.body
      )}
    </motion.div>
  );
}
