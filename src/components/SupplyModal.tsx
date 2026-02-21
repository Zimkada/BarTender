import React, { useState, useEffect, useMemo } from 'react';
import { X, Package, AlertTriangle, AlertCircle } from 'lucide-react';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useBarContext } from '../context/BarContext';
import { useLastSuppliesMap } from '../hooks/queries/useStockQueries';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from './ui/Select';

interface SupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplyData: {
    productId: string;
    quantity: number;
    lotSize: number;
    lotPrice: number;
    supplier: string;
  }) => void;
  products: Product[];
  inline?: boolean;
  initialProductId?: string;
  initialQuantity?: number;
}

export function SupplyModal({ isOpen, onClose, onSave, products, inline = false, initialProductId, initialQuantity }: SupplyModalProps) {
  const { formatPrice } = useCurrencyFormatter();
  const { currentBar } = useBarContext();
  const { data: lastSupplies } = useLastSuppliesMap(currentBar?.id);

  const [formData, setFormData] = useState({
    productId: '',
    quantity: '',
    lotSize: '',
    lotPrice: '',
    supplier: '',
  });

  const [priceConfirmed, setPriceConfirmed] = useState(false);

  // 🛡️ wasOpen Ref: Ensures the form only resets when explicitly OPENED (from closed state)
  // This prevents data loss when 'products' array reference changes due to React Query refetch
  const wasOpen = React.useRef(false);

  // Initialize form with last supply defaults when modal opens
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      const productId = initialProductId || products[0]?.id || '';
      const lastSupply = lastSupplies?.[productId];

      setFormData({
        productId,
        quantity: initialQuantity ? initialQuantity.toString() : '',
        lotSize: lastSupply?.lotSize?.toString() || '',
        lotPrice: lastSupply?.lotPrice?.toString() || '',
        supplier: lastSupply?.supplier || '',
      });
      setPriceConfirmed(false);
    }
    wasOpen.current = isOpen;
  }, [isOpen, products.length, initialProductId, initialQuantity, lastSupplies]);

  // Pre-fill form when product is selected
  useEffect(() => {
    if (formData.productId && lastSupplies) {
      const lastSupply = lastSupplies[formData.productId];
      if (lastSupply && !formData.lotPrice) {
        // Only pre-fill if not already entered
        setFormData(prev => ({
          ...prev,
          lotSize: lastSupply.lotSize?.toString() || prev.lotSize,
          lotPrice: lastSupply.lotPrice?.toString() || prev.lotPrice,
          supplier: lastSupply.supplier || prev.supplier,
        }));
        setPriceConfirmed(false);
      }
    }
  }, [formData.productId, lastSupplies]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check if price confirmation is required but not given
    if (priceRatio > 10 && !priceConfirmed) {
      return; // Prevent submission
    }

    onSave({
      productId: formData.productId,
      quantity: parseInt(formData.quantity),
      lotSize: parseInt(formData.lotSize),
      lotPrice: parseFloat(formData.lotPrice),
      supplier: formData.supplier,
    });
    onClose();
  };

  // Calculate price deviation ratio
  const lastSupply = lastSupplies?.[formData.productId];
  const lastPrice = lastSupply?.lotPrice ?? null;
  const currentPrice = formData.lotPrice ? parseFloat(formData.lotPrice) : null;

  const priceRatio = useMemo(() => {
    if (!lastPrice || !currentPrice || lastPrice === 0) return 1;
    return currentPrice / lastPrice;
  }, [lastPrice, currentPrice]);

  const selectedProduct = products.find(p => p.id === formData.productId);
  const totalLots = formData.quantity && formData.lotSize ?
    Math.floor(parseInt(formData.quantity) / parseInt(formData.lotSize)) : 0;
  const totalCost = totalLots * parseFloat(formData.lotPrice || '0');

  if (!isOpen && !inline) return null;

  const content = (
    <div className={`${inline ? '' : 'bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto'}`}>
      {!inline && (
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Package size={20} className="text-brand-primary" />
            Approvisionnement
          </h2>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            className="text-gray-600 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </motion.button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={`${inline ? '' : 'p-6'} space-y-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Produit *
          </label>
          <Select
            options={products.map(product => ({
              value: product.id,
              label: `${product.name} (${product.volume})`
            }))}
            value={formData.productId}
            onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
            className="w-full"
            required
          />
          {selectedProduct && (
            <p className="text-sm text-gray-600 mt-1">
              Stock actuel: {selectedProduct.stock} | Prix de vente: {formatPrice(selectedProduct.price)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantité totale *
            </label>
            <input
              type="number"
              required
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-800 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-subtle"
              placeholder="48"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantité par lot *
            </label>
            <input
              type="number"
              required
              min="1"
              value={formData.lotSize}
              onChange={(e) => setFormData({ ...formData, lotSize: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-800 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-subtle"
              placeholder="24"
            />
            <p className="text-xs text-gray-500 mt-1">Casier, pack, caisse...</p>
          </div>
        </div>

        {/* Prix par lot avec alerte intelligente */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Prix par lot (FCFA) *
          </label>
          <input
            type="number"
            required
            min="0"
            value={formData.lotPrice}
            onChange={(e) => {
              setFormData({ ...formData, lotPrice: e.target.value });
              setPriceConfirmed(false);
            }}
            className={`w-full px-3 py-2 bg-white border rounded-xl text-gray-800 focus:outline-none focus:ring-2 transition-all ${
              priceRatio > 10
                ? 'border-red-500 focus:border-red-600 focus:ring-red-200'
                : priceRatio > 2
                  ? 'border-amber-500 focus:border-amber-600 focus:ring-amber-200'
                  : 'border-gray-300 focus:border-brand-primary focus:ring-brand-subtle'
            }`}
            placeholder="12000"
          />

          {/* Afficher le dernier prix comme référence */}
          {lastPrice && (
            <p className="text-xs text-gray-500 mt-1.5">
              📊 Dernier prix: <span className="font-semibold text-gray-700">{formatPrice(lastPrice)}</span>
              {lastSupply?.supplier && <span className="text-gray-400"> (fournisseur: {lastSupply.supplier})</span>}
            </p>
          )}

          {/* Alerte orange: prix modérément élevé (2x-10x) */}
          {priceRatio > 2 && priceRatio <= 10 && currentPrice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 flex gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                ⚠️ Ce prix ({formatPrice(currentPrice)}) est <span className="font-semibold">{priceRatio.toFixed(1)}x</span> plus élevé que le dernier approvisionnement.
              </p>
            </motion.div>
          )}

          {/* Alerte rouge: prix très anormal (>10x) + demande confirmation */}
          {priceRatio > 10 && currentPrice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 space-y-2.5"
            >
              <div className="flex gap-2 p-2.5 bg-red-50 border border-red-300 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">
                  🚨 <span className="font-semibold">PRIX EXTRÊMEMENT ÉLEVÉ!</span> Vous avez saisi {formatPrice(currentPrice)}, soit <span className="font-semibold">{priceRatio.toFixed(1)}x</span> le dernier prix ({formatPrice(lastPrice)}).
                </p>
              </div>

              {/* Checkbox de confirmation obligatoire */}
              <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-lg border border-red-200">
                <input
                  type="checkbox"
                  id="priceConfirm"
                  checked={priceConfirmed}
                  onChange={(e) => setPriceConfirmed(e.target.checked)}
                  className="w-4 h-4 text-red-600 border-red-300 rounded cursor-pointer"
                />
                <label htmlFor="priceConfirm" className="text-xs text-red-800 cursor-pointer select-none">
                  ✓ Je confirme ce prix intentionnellement
                </label>
              </div>
            </motion.div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fournisseur *
          </label>
          <input
            type="text"
            required
            value={formData.supplier}
            onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-800 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-subtle"
            placeholder="SOBEBRA"
          />
        </div>

        {totalLots > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-brand-subtle border border-brand-subtle rounded-xl p-3"
          >
            <h4 className="text-gray-800 font-medium mb-2">Résumé de l'approvisionnement</h4>
            <div className="space-y-1 text-sm">
              <p className="text-gray-700">Nombre de lots: <span className="text-gray-800 font-medium">{totalLots}</span></p>
              <p className="text-gray-700">Coût total: <span className="text-brand-primary font-semibold">{formatPrice(totalCost)}</span></p>
              <p className="text-gray-700">Coût par unité: <span className="text-gray-800 font-medium">{formatPrice(totalCost / parseInt(formData.quantity))}</span></p>
            </div>
          </motion.div>
        )}

        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Annuler
          </motion.button>
          <motion.button
            type="submit"
            whileHover={priceRatio <= 10 ? { scale: 1.02 } : {}}
            whileTap={priceRatio <= 10 ? { scale: 0.98 } : {}}
            disabled={priceRatio > 10 && !priceConfirmed}
            className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all ${
              priceRatio > 10 && !priceConfirmed
                ? 'btn-brand opacity-50 cursor-not-allowed'
                : 'btn-brand'
            }`}
          >
            {priceRatio > 10 && !priceConfirmed ? '⚠️ Confirmez le prix' : 'Enregistrer'}
          </motion.button>
        </div>
      </form>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-full max-w-4xl"
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}