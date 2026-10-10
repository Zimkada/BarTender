import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import type { SaleSuccess } from './saleSuccess';

/**
 * ⭐ MOMENT « VENTE VALIDÉE » (audit UI/UX, lot 2, 10/10/2026).
 *
 * Avant : un toast d'une seconde (panier) ou RIEN du tout (vente rapide
 * mobile, le tiroir se fermait simplement). Le geste le plus répété du
 * service n'avait pas de conclusion lisible.
 *
 * ⛔ Le libellé dit EXACTEMENT ce qui s'est passé, jamais plus :
 *   · serveur en mode complet : la vente naît `pending`, elle n'est PAS
 *     encaissée tant que le gérant ne l'a pas validée ;
 *   · vente mise sur un bon : le client paiera à la clôture du bon ;
 *   · hors ligne : enregistrée, envoyée au retour du réseau.
 */

const DISPLAY_MS = 1200;

interface SaleSuccessOverlayProps {
  success: SaleSuccess | null;
  onDone: () => void;
}

export function SaleSuccessOverlay({ success, onDone }: SaleSuccessOverlayProps) {
  const { formatPrice } = useCurrencyFormatter();

  // ⚠️ Ref : le minuteur ne doit dépendre QUE d'un nouveau succès. Avec
  // `onDone` en dépendance, une fonction fléchée du parent relancerait le
  // minuteur à chaque rendu (le panier se vide pendant ce moment).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!success) return;
    // Double impulsion : distincte du tap simple d'ajout au panier (10 ms).
    if (navigator.vibrate) navigator.vibrate([15, 50, 15]);
    // ⚠️ Fermeture automatique courte : le serveur enchaîne les ventes, ce
    // moment ne doit jamais devenir une étape à franchir.
    const timer = setTimeout(() => onDoneRef.current(), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [success]);

  // ⚠️ PORTAL : le panier est un tiroir animé en transform ; rendu dedans,
  // l'overlay `fixed` ne couvrirait que le tiroir (cf. ProductCard, 13/09/2026).
  return createPortal(
    <AnimatePresence>
      {success && (
        <motion.div
          key="sale-success"
          role="status"
          aria-live="polite"
          onClick={onDone}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          // ⚠️ Pas de backdrop-blur : coûteux sur les GPU d'entrée de gamme.
          className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="w-full max-w-xs rounded-3xl bg-card p-6 text-center shadow-2xl"
          >
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white"
              style={{ background: 'var(--brand-gradient)' }}
            >
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden="true">
                {/* ⭐ La coche se DESSINE : le moment se lit d'un coup d'œil. */}
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
                />
              </svg>
            </div>
            <p className="text-h3 text-foreground">{success.title}</p>
            {success.amount !== undefined && success.amount > 0 && (
              <p className="mt-1 text-h2 font-bold text-brand-primary tabular-nums">
                {formatPrice(success.amount)}
              </p>
            )}
            {success.details.map((line) => (
              <p key={line} className="mt-1 text-caption text-muted-foreground">
                {line}
              </p>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
