/**
 * QuantityPad — saisie d'une quantité en un geste, depuis la grille de vente.
 *
 * ⭐⭐ RÉPOND À L'OBJECTION TERRAIN LA PLUS CONCRÈTE : « la saisie est lourde
 * en période d'affluence ». Six bières de la même marque coûtaient SIX taps sur
 * la même carte ; elles en coûtent deux (badge → « 6 »).
 *
 * ⛔ LE TAP SUR LA CARTE RESTE +1, INCHANGÉ. Ce pavé s'ouvre par le badge de
 * quantité, jamais par la carte elle-même. C'est la raison du choix contre
 * l'appui long : à 500 ms, un serveur pressé qui relâche trop tôt obtient un
 * +1 SILENCIEUX au lieu du pavé — une erreur invisible, sur le geste le plus
 * fréquent du service. Ici, chaque cible fait exactement une chose.
 *
 * ⭐ RACCOURCIS 1·2·3·6·12 : 6 = demi-casier, 12 = casier plein, le motif
 * dominant d'un bar béninois. « Autre » couvre le reste sans plafond arbitraire.
 *
 * ⚠️ Le pavé REMPLACE la quantité, il ne s'y ajoute pas : taper « 6 » sur une
 * ligne qui en porte déjà 2 donne 6, pas 8. C'est la lecture naturelle d'un
 * chiffre qu'on désigne, et elle rend le geste idempotent — un double tap sur
 * « 6 » laisse 6. Le libellé du pavé annonce la quantité courante pour que ce
 * remplacement ne surprenne jamais.
 */

import { useState, useRef, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';

/**
 * ⭐ Valeurs proposées. 6 et 12 portent le gain réel ; 1·2·3 couvrent la
 * commande de table courante et évitent d'ouvrir le clavier pour un petit
 * nombre.
 */
const PRESETS = [1, 2, 3, 6, 12] as const;

interface QuantityPadProps {
  open: boolean;
  onClose: () => void;
  /** Nom de l'article — le pavé doit dire SUR QUOI il agit. */
  itemName: string;
  /** Quantité déjà au panier, annoncée pour expliciter le remplacement. */
  currentQuantity: number;
  /**
   * Plafond éventuel (stock disponible pour une boisson). `undefined` = aucun,
   * cas d'un plat : sa disponibilité dépend des ingrédients, pas d'un stock.
   * ⚠️ `undefined` et NON `Infinity` : l'absence de plafond doit se lire dans
   * le type, pas dans une valeur sentinelle qu'un calcul pourrait propager.
   */
  maxQuantity?: number;
  /** Quantité choisie — REMPLACE la quantité courante. */
  onPick: (quantity: number) => void;
}

export function QuantityPad({
  open,
  onClose,
  itemName,
  currentQuantity,
  maxQuantity,
  onPick,
}: QuantityPadProps) {
  const [draft, setDraft] = useState('');
  const [isFreeEntry, setIsFreeEntry] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⚠️ Réinitialiser à CHAQUE ouverture : sans cela, le pavé rouvert sur un
  // autre produit garderait la saisie libre du précédent.
  useEffect(() => {
    if (open) {
      setDraft('');
      setIsFreeEntry(false);
    }
  }, [open]);

  useEffect(() => {
    if (isFreeEntry) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isFreeEntry]);

  const commit = (quantity: number) => {
    // ⛔ Le plafond est appliqué ICI, en dernier ressort, mais il n'est PAS la
    // seule garde : useCart refuse déjà tout dépassement de stock avec son
    // propre message. On borne pour ne pas déclencher inutilement ce refus sur
    // un geste que l'utilisateur croyait valide.
    const bounded = maxQuantity !== undefined ? Math.min(quantity, maxQuantity) : quantity;
    if (bounded > 0) onPick(bounded);
    onClose();
  };

  const commitFreeEntry = () => {
    const parsed = parseInt(draft, 10);
    // ⚠️ Une saisie vide ou nulle FERME sans rien changer, au lieu de retirer
    // l'article : ce pavé sert à ajouter, le retrait se fait au panier, où il
    // est visible et réversible.
    if (Number.isFinite(parsed) && parsed > 0) {
      commit(parsed);
    } else {
      onClose();
    }
  };

  // ⚠️ Un preset au-dessus du stock est DÉSACTIVÉ, pas masqué : voir « 12 »
  // grisé dit au serveur qu'il n'y a pas de casier plein, alors qu'un bouton
  // absent se lit comme une fonctionnalité manquante.
  const isPresetDisabled = (value: number) =>
    maxQuantity !== undefined && value > maxQuantity;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={itemName}
      size="sm"
    >
      <p className="mb-3 text-caption text-muted-foreground">
        {currentQuantity > 0
          ? `Quantité au panier : ${currentQuantity}. Choisissez la nouvelle quantité.`
          : 'Combien en servez-vous ?'}
      </p>

      {isFreeEntry ? (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitFreeEntry();
              }
            }}
            placeholder="Ex : 24"
            aria-label="Quantité"
            className={cn(
              'w-full rounded-xl border-2 border-brand-primary bg-card',
              'px-4 py-3 text-center text-2xl font-black font-mono text-foreground',
              'outline-none placeholder:text-muted-foreground placeholder:font-normal placeholder:text-base'
            )}
          />
          {maxQuantity !== undefined && (
            <p className="text-center text-caption text-muted-foreground">
              {maxQuantity} disponible{maxQuantity > 1 ? 's' : ''}
            </p>
          )}
          <button
            type="button"
            onClick={commitFreeEntry}
            className="w-full rounded-xl bg-brand-primary px-4 py-3 text-white font-black uppercase tracking-wide text-caption active:scale-95 transition-transform"
          >
            Valider
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((value) => {
            const disabled = isPresetDisabled(value);
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => commit(value)}
                className={cn(
                  'flex h-16 items-center justify-center rounded-xl border-2',
                  'text-2xl font-black font-mono transition-colors',
                  disabled
                    ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-40'
                    : 'border-border bg-card text-foreground hover:border-brand-primary hover:bg-brand-subtle active:scale-95'
                )}
              >
                {value}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsFreeEntry(true)}
            className={cn(
              'flex h-16 items-center justify-center rounded-xl border-2 border-dashed',
              'border-brand-primary/50 bg-brand-primary/5 text-brand-primary',
              'text-caption font-black uppercase tracking-wide',
              'hover:bg-brand-primary/10 active:scale-95 transition-colors'
            )}
          >
            Autre
          </button>
        </div>
      )}
    </Modal>
  );
}

QuantityPad.displayName = 'QuantityPad';
