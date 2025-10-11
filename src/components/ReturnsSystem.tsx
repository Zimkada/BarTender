import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  Package,
  X,
  Search,
  Filter,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { Sale, CartItem, Return, ReturnReason, ReturnReasonConfig } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';

interface ReturnsSystemProps {
  isOpen: boolean;
  onClose: () => void;
}

// Configuration des motifs de retour
const returnReasons: Record<ReturnReason, ReturnReasonConfig> = {
  defective: {
    label: 'Produit défectueux',
    color: 'red',
    autoRestock: false,  // Ne pas remettre en stock (produit HS)
    autoRefund: true     // Remboursement client (pas sa faute)
  },
  wrong_item: {
    label: 'Mauvais article livré',
    color: 'orange',
    autoRestock: true,   // Remettre en stock (produit OK)
    autoRefund: true     // Remboursement (erreur du bar)
  },
  customer_change: {
    label: 'Produit non consommé',
    color: 'blue',
    autoRestock: true,   // Remettre en stock (produit OK)
    autoRefund: false    // PAS de remboursement (caprice client)
  },
  expired: {
    label: 'Produit expiré',
    color: 'purple',
    autoRestock: false,  // Ne pas remettre en stock (périmé)
    autoRefund: true     // Remboursement (faute du bar)
  },
  other: {
    label: 'Autre raison',
    color: 'gray',
    autoRestock: false,  // Décision manuelle gérant
    autoRefund: false    // Décision manuelle gérant
  }
};

export function ReturnsSystem({ isOpen, onClose }: ReturnsSystemProps) {
  const {
    sales,
    returns,
    addReturn,
    updateReturn,
    increaseStock,
    getPendingReturns,
    getReturnsBySale
  } = useAppContext();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError, showWarning } = useFeedback();

  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Heure de clôture caisse
  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;

  /**
   * Vérifie si un retour est autorisé pour une vente
   * Règle métier : Retour UNIQUEMENT avant clôture du jour commercial
   */
  const canReturnSale = (sale: Sale): { allowed: boolean; reason: string } => {
    // Journée commerciale de la vente
    const saleBusinessDay = getBusinessDay(new Date(sale.date), closeHour);

    // Journée commerciale actuelle
    const currentBusinessDay = getCurrentBusinessDay(closeHour);

    // Heure actuelle
    const now = new Date();

    // Cas 1 : Vente d'un jour commercial déjà clôturé
    if (!isSameDay(saleBusinessDay, currentBusinessDay)) {
      return {
        allowed: false,
        reason: `Caisse du ${saleBusinessDay.toLocaleDateString('fr-FR')} déjà clôturée. Retours impossibles.`
      };
    }

    // Cas 2 : Même jour commercial, vérifier si avant clôture
    const nextCloseTime = new Date(currentBusinessDay);
    nextCloseTime.setDate(nextCloseTime.getDate() + 1);
    nextCloseTime.setHours(closeHour, 0, 0, 0);

    if (now >= nextCloseTime) {
      return {
        allowed: false,
        reason: `Clôture caisse à ${closeHour}h déjà effectuée. Retours impossibles.`
      };
    }

    // Cas 3 : Même jour commercial ET avant clôture = OK
    return {
      allowed: true,
      reason: `Retour autorisé (avant clôture ${closeHour}h)`
    };
  };

  // Récupérer les ventes du jour commercial actuel uniquement
  const getReturnableSales = useMemo((): Sale[] => {
    const currentBusinessDay = getCurrentBusinessDay(closeHour);

    return sales.filter(sale => {
      const saleDate = new Date(sale.date);
      const saleBusinessDay = getBusinessDay(saleDate, closeHour);
      return isSameDay(saleBusinessDay, currentBusinessDay);
    });
  }, [sales, closeHour]);

  // Créer un retour
  const createReturn = (
    saleId: string,
    productId: string,
    quantity: number,
    reason: ReturnReason,
    notes?: string,
    customRefund?: boolean,
    customRestock?: boolean
  ) => {
    const sale = sales.find(s => s.id === saleId);
    const item = sale?.items.find(i => i.product.id === productId);

    if (!sale || !item || !currentSession) {
      showError('Données invalides');
      return;
    }

    // Vérifier si retour autorisé (jour commercial + avant clôture)
    const returnCheck = canReturnSale(sale);
    if (!returnCheck.allowed) {
      showError(returnCheck.reason);
      return;
    }

    // ✅ NOUVEAU: Vérifier quantité déjà retournée
    const existingReturns = getReturnsBySale(saleId);
    const alreadyReturnedQty = existingReturns
      .filter(r => r.productId === productId && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantityReturned, 0);

    const remainingQty = item.quantity - alreadyReturnedQty;

    if (quantity > remainingQty) {
      showError(`Impossible : ${alreadyReturnedQty} déjà retourné(s). Reste seulement ${remainingQty} disponible(s).`);
      return;
    }

    if (remainingQty <= 0) {
      showError(`Ce produit a déjà été entièrement retourné (${alreadyReturnedQty}/${item.quantity})`);
      return;
    }

    const reasonConfig = returnReasons[reason];

    // ✅ Gérer les choix personnalisés pour "other"
    const finalRefund = reason === 'other'
      ? (customRefund ?? false)
      : reasonConfig.autoRefund;

    const finalRestock = reason === 'other'
      ? (customRestock ?? false)
      : reasonConfig.autoRestock;

    // Créer retour via AppContext (persistance)
    const newReturn = addReturn({
      barId: currentBar!.id, // ✅ Multi-tenant support
      saleId,
      productId,
      productName: item.product.name,
      productVolume: item.product.volume,
      quantitySold: item.quantity,
      quantityReturned: quantity,
      reason,
      returnedBy: currentSession.userId,
      returnedAt: new Date(),
      refundAmount: finalRefund ? (item.product.price * quantity) : 0,
      isRefunded: finalRefund,
      status: 'pending',
      autoRestock: finalRestock,
      manualRestockRequired: !finalRestock,
      notes,
      customRefund: reason === 'other' ? customRefund : undefined,
      customRestock: reason === 'other' ? customRestock : undefined
    });

    if (newReturn) {
      const refundMsg = finalRefund
        ? ` - Remboursement ${formatPrice(item.product.price * quantity)}`
        : ' - Sans remboursement';
      showSuccess(`Retour créé pour ${quantity}x ${item.product.name}${refundMsg}`);
      setShowCreateReturn(false);
      setSelectedSale(null);
    }
  };

  // Approuver un retour
  const approveReturn = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem) return;

    let newStatus: Return['status'] = 'approved';

    // Remise en stock automatique selon la raison
    if (returnItem.autoRestock) {
      increaseStock(returnItem.productId, returnItem.quantityReturned);
      newStatus = 'restocked';

      const refundInfo = returnItem.isRefunded
        ? ` + Remboursement ${formatPrice(returnItem.refundAmount)}`
        : '';
      showSuccess(`Retour approuvé - ${returnItem.quantityReturned}x ${returnItem.productName} remis en stock${refundInfo}`);
    } else {
      const refundInfo = returnItem.isRefunded
        ? ` - Remboursement ${formatPrice(returnItem.refundAmount)}`
        : '';
      showSuccess(`Retour approuvé${refundInfo} - Choix de remise en stock disponible`);
    }

    updateReturn(returnId, {
      status: newStatus,
      restockedAt: returnItem.autoRestock ? new Date() : undefined
    });
  };

  // Remettre en stock manuellement
  const manualRestock = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem || returnItem.status !== 'approved') return;

    increaseStock(returnItem.productId, returnItem.quantityReturned);

    updateReturn(returnId, {
      status: 'restocked',
      restockedAt: new Date()
    });

    showSuccess(`${returnItem.quantityReturned}x ${returnItem.productName} remis en stock`);
  };

  // Rejeter un retour
  const rejectReturn = (returnId: string) => {
    updateReturn(returnId, { status: 'rejected' });
    showSuccess('Retour rejeté');
  };

  // Filtrer les retours
  const filteredReturns = returns.filter(returnItem => {
    const matchesStatus = filterStatus === 'all' || returnItem.status === filterStatus;
    const matchesSearch = returnItem.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         returnItem.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-2xl w-full max-w-6xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-orange-200">
              <div className="flex items-center gap-3">
                <RotateCcw className="w-8 h-8 text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Système de retours</h2>
                  <p className="text-sm text-gray-600">Gérer les retours produits</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <EnhancedButton
                  variant="primary"
                  onClick={() => setShowCreateReturn(true)}
                  icon={<RotateCcw size={16} />}
                >
                  Nouveau retour
                </EnhancedButton>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {!showCreateReturn ? (
                <>
                  {/* Filtres et recherche */}
                  <div className="flex flex-wrap gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <Search size={16} className="text-gray-400" />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-3 py-2 border border-orange-200 rounded-lg bg-white"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-gray-400" />
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                        className="px-3 py-2 border border-orange-200 rounded-lg bg-white"
                      >
                        <option value="all">Tous les statuts</option>
                        <option value="pending">En attente</option>
                        <option value="approved">Approuvés</option>
                        <option value="rejected">Rejetés</option>
                      </select>
                    </div>
                  </div>

                  {/* Liste des retours */}
                  <div className="space-y-4">
                    {filteredReturns.length === 0 ? (
                      <div className="text-center py-12">
                        <RotateCcw size={48} className="text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-600 mb-2">Aucun retour</h3>
                        <p className="text-gray-500">Les retours apparaîtront ici</p>
                      </div>
                    ) : (
                      filteredReturns.map(returnItem => (
                        <motion.div
                          key={returnItem.id}
                          whileHover={{ y: -2 }}
                          className="bg-white rounded-xl p-4 shadow-sm border border-orange-100"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${
                                returnItem.status === 'restocked' ? 'bg-green-500' :
                                returnItem.status === 'approved' ? 'bg-blue-500' :
                                returnItem.status === 'rejected' ? 'bg-red-500' :
                                'bg-yellow-500'
                              }`} />
                              <div>
                                <h4 className="font-medium text-gray-800">
                                  {returnItem.productName} ({returnItem.productVolume})
                                </h4>
                                <p className="text-sm text-gray-600">
                                  Retour #{returnItem.id.slice(-6)} • {new Date(returnItem.returnedAt).toLocaleDateString('fr-FR')}
                                </p>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <p className="font-semibold text-gray-800">
                                {formatPrice(returnItem.refundAmount)}
                              </p>
                              <p className="text-sm text-gray-600">
                                {returnItem.quantityReturned}/{returnItem.quantitySold} articles
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                returnReasons[returnItem.reason].color === 'red' ? 'bg-red-100 text-red-700' :
                                returnReasons[returnItem.reason].color === 'orange' ? 'bg-orange-100 text-orange-700' :
                                returnReasons[returnItem.reason].color === 'blue' ? 'bg-blue-100 text-blue-700' :
                                returnReasons[returnItem.reason].color === 'purple' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {returnReasons[returnItem.reason].label}
                              </span>
                              
                              {returnItem.autoRestock && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                  📦 Stock auto
                                </span>
                              )}

                              {returnItem.isRefunded && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                  💰 Remboursé
                                </span>
                              )}

                              {!returnItem.isRefunded && returnItem.refundAmount === 0 && (
                                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                                  Sans remboursement
                                </span>
                              )}

                              {returnItem.notes && (
                                <span className="text-sm text-gray-600 italic">
                                  "{returnItem.notes}"
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {returnItem.status === 'pending' && (
                                <>
                                  <EnhancedButton
                                    variant="danger"
                                    size="sm"
                                    onClick={() => rejectReturn(returnItem.id)}
                                  >
                                    Rejeter
                                  </EnhancedButton>
                                  <EnhancedButton
                                    variant="success"
                                    size="sm"
                                    onClick={() => approveReturn(returnItem.id)}
                                  >
                                    Approuver
                                  </EnhancedButton>
                                </>
                              )}

                              {returnItem.status === 'approved' && returnItem.manualRestockRequired && (
                                <EnhancedButton
                                  variant="info"
                                  size="sm"
                                  onClick={() => manualRestock(returnItem.id)}
                                  icon={<Package size={14} />}
                                >
                                  Remettre en stock
                                </EnhancedButton>
                              )}

                              {returnItem.status === 'restocked' && (
                                <span className="text-sm text-green-600 font-medium">
                                  ✅ En stock ({returnItem.restockedAt && new Date(returnItem.restockedAt).toLocaleDateString('fr-FR')})
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                /* Création de retour */
                <CreateReturnForm
                  returnableSales={getReturnableSales}
                  returnReasons={returnReasons}
                  onCreateReturn={createReturn}
                  onCancel={() => {
                    setShowCreateReturn(false);
                    setSelectedSale(null);
                  }}
                  selectedSale={selectedSale}
                  onSelectSale={setSelectedSale}
                  canReturnSale={canReturnSale}
                  closeHour={closeHour}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Modal pour motif "Autre raison" avec choix personnalisés
function OtherReasonDialog({
  isOpen,
  onConfirm,
  onCancel
}: {
  isOpen: boolean;
  onConfirm: (refund: boolean, restock: boolean, notes: string) => void;
  onCancel: () => void;
}) {
  const [customRefund, setCustomRefund] = useState(false);
  const [customRestock, setCustomRestock] = useState(false);
  const [customNotes, setCustomNotes] = useState('');

  const handleSubmit = () => {
    if (!customNotes.trim()) {
      alert('Les notes sont obligatoires pour "Autre raison"');
      return;
    }
    onConfirm(customRefund, customRestock, customNotes);
    // Reset
    setCustomRefund(false);
    setCustomRestock(false);
    setCustomNotes('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-orange-600" size={24} />
              <h3 className="text-lg font-bold text-gray-800">Retour - Autre raison</h3>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Ce motif nécessite une décision manuelle. Précisez les actions à prendre :
            </p>

            <div className="space-y-4">
              {/* Checkbox Remboursement */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customRefund}
                  onChange={(e) => setCustomRefund(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-800">Rembourser le client</p>
                  <p className="text-xs text-gray-500">Le montant sera déduit du CA</p>
                </div>
              </label>

              {/* Checkbox Remise en stock */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customRestock}
                  onChange={(e) => setCustomRestock(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div>
                  <p className="font-medium text-gray-800">Remettre en stock</p>
                  <p className="text-xs text-gray-500">Le produit sera remis en inventaire</p>
                </div>
              </label>

              {/* Notes obligatoires */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  rows={4}
                  placeholder="Expliquez la raison du retour (obligatoire)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Résumé décision */}
              {(customRefund || customRestock || customNotes) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-gray-700 mb-1">Résumé :</p>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Client : {customRefund ? '✅ Remboursé' : '❌ Non remboursé'}</li>
                    <li>• Stock : {customRestock ? '✅ Remis en stock' : '❌ Pas de remise en stock'}</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Boutons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Valider
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Formulaire de création de retour
function CreateReturnForm({
  returnableSales,
  returnReasons,
  onCreateReturn,
  onCancel,
  selectedSale,
  onSelectSale,
  canReturnSale,
  closeHour
}: {
  returnableSales: Sale[];
  returnReasons: Record<ReturnReason, ReturnReasonConfig>;
  onCreateReturn: (saleId: string, productId: string, quantity: number, reason: ReturnReason, notes?: string, customRefund?: boolean, customRestock?: boolean) => void;
  onCancel: () => void;
  selectedSale: Sale | null;
  onSelectSale: (sale: Sale) => void;
  canReturnSale: (sale: Sale) => { allowed: boolean; reason: string };
  closeHour: number;
}) {
  const { returns, getReturnsBySale } = useAppContext();
  const { formatPrice } = useCurrencyFormatter();
  const [selectedProduct, setSelectedProduct] = useState<CartItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [notes, setNotes] = useState('');
  const [showOtherReasonDialog, setShowOtherReasonDialog] = useState(false);

  const reasonConfig = returnReasons[reason];

  // Calculer quantité déjà retournée pour le produit sélectionné
  const getAlreadyReturned = (productId: string): number => {
    if (!selectedSale) return 0;
    const existingReturns = getReturnsBySale(selectedSale.id);
    return existingReturns
      .filter(r => r.productId === productId && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantityReturned, 0);
  };

  // Quantité disponible pour retour
  const availableQty = selectedProduct
    ? selectedProduct.quantity - getAlreadyReturned(selectedProduct.product.id)
    : 0;

  const handleSubmit = () => {
    if (!selectedSale || !selectedProduct) return;

    // Si motif "other", ouvrir modal pour choix personnalisés
    if (reason === 'other') {
      setShowOtherReasonDialog(true);
      return;
    }

    // Sinon, créer retour normalement
    onCreateReturn(selectedSale.id, selectedProduct.product.id, quantity, reason, notes || undefined);
  };

  const handleOtherReasonConfirm = (customRefund: boolean, customRestock: boolean, customNotes: string) => {
    if (!selectedSale || !selectedProduct) return;

    setShowOtherReasonDialog(false);
    onCreateReturn(
      selectedSale.id,
      selectedProduct.product.id,
      quantity,
      reason,
      customNotes,
      customRefund,
      customRestock
    );
  };

  return (
    <>
      <OtherReasonDialog
        isOpen={showOtherReasonDialog}
        onConfirm={handleOtherReasonConfirm}
        onCancel={() => setShowOtherReasonDialog(false)}
      />

      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-800">Créer un nouveau retour</h3>

      <div className="space-y-4">
        {/* Alerte jour commercial */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-blue-600" size={18} />
            <p className="text-blue-700 text-sm font-medium">
              Retours autorisés uniquement AVANT clôture caisse ({closeHour}h)
            </p>
          </div>
          <p className="text-blue-600 text-xs mt-1">
            Seules les ventes de la journée commerciale actuelle sont affichées.
          </p>
        </div>

        {/* Sélection de la vente */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ventes de la journée commerciale actuelle
          </label>
          {returnableSales.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500">Aucune vente dans la journée commerciale actuelle</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {returnableSales.map(sale => {
                const returnCheck = canReturnSale(sale);
                return (
                  <motion.button
                    key={sale.id}
                    onClick={() => returnCheck.allowed && onSelectSale(sale)}
                    whileHover={returnCheck.allowed ? { scale: 1.02 } : {}}
                    disabled={!returnCheck.allowed}
                    className={`p-3 text-left rounded-lg border-2 transition-colors ${
                      selectedSale?.id === sale.id
                        ? 'border-orange-500 bg-orange-50'
                        : returnCheck.allowed
                          ? 'border-gray-200 bg-white hover:border-gray-300'
                          : 'border-red-200 bg-red-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">
                          Vente #{sale.id.slice(-6)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(sale.date).toLocaleTimeString('fr-FR')} • {sale.items.length} articles
                        </p>
                      </div>
                      {returnCheck.allowed ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          ✅ OK
                        </span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                          🚫 Bloqué
                        </span>
                      )}
                    </div>
                    {!returnCheck.allowed && (
                      <p className="text-xs text-red-600 mt-1">{returnCheck.reason}</p>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sélection du produit */}
        {selectedSale && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Produit à retourner
            </label>
            <div className="space-y-2">
              {selectedSale.items.map((item: CartItem, index: number) => {
                const alreadyReturned = getAlreadyReturned(item.product.id);
                const available = item.quantity - alreadyReturned;
                const isFullyReturned = available <= 0;

                return (
                  <motion.button
                    key={index}
                    onClick={() => !isFullyReturned && setSelectedProduct(item)}
                    whileHover={!isFullyReturned ? { scale: 1.01 } : {}}
                    disabled={isFullyReturned}
                    className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                      isFullyReturned
                        ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                        : selectedProduct === item
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-800">
                          {item.product.name} ({item.product.volume})
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-gray-600">
                            Vendu: {item.quantity}
                          </p>
                          {alreadyReturned > 0 && (
                            <>
                              <span className="text-gray-400">•</span>
                              <p className="text-sm text-orange-600">
                                Retourné: {alreadyReturned}
                              </p>
                            </>
                          )}
                          <span className="text-gray-400">•</span>
                          <p className={`text-sm font-medium ${isFullyReturned ? 'text-red-600' : 'text-green-600'}`}>
                            Disponible: {available}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-blue-600 font-semibold">
                          {item.product.price} FCFA
                        </p>
                        {isFullyReturned && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full mt-1 inline-block">
                            Tout retourné
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Détails du retour */}
        {selectedProduct && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantité à retourner
                </label>
                <input
                  type="number"
                  min="1"
                  max={availableQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum disponible : {availableQty}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Raison du retour
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg bg-white"
                >
                  {Object.entries(returnReasons).map(([key, value]) => {
                    // Pour "other", afficher "Choix manuel" au lieu de "Sans rembours."
                    const refundLabel = key === 'other'
                      ? '💰 Choix manuel'
                      : value.autoRefund
                        ? '💰 Remboursé'
                        : '❌ Sans rembours.';

                    return (
                      <option key={key} value={key}>
                        {value.label} • {value.autoRestock ? '📦 Stock auto' : '📦 Choix manuel'} • {refundLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optionnel)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-orange-200 rounded-lg bg-white"
                placeholder="Détails supplémentaires..."
              />
            </div>

            <div className={`border rounded-lg p-4 ${reason === 'other' ? 'bg-yellow-50 border-yellow-200' : reasonConfig.autoRefund ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Montant retour:</span>
                  <span className="text-lg font-bold text-gray-800">
                    {formatPrice(selectedProduct.product.price * quantity)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {reason === 'other' ? (
                    <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
                      💰 Décision manuelle
                    </span>
                  ) : reasonConfig.autoRefund ? (
                    <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                      💰 Client sera remboursé
                    </span>
                  ) : (
                    <span className="text-sm bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                      ❌ Sans remboursement
                    </span>
                  )}

                  {reason === 'other' ? (
                    <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
                      📦 Décision manuelle
                    </span>
                  ) : reasonConfig.autoRestock ? (
                    <span className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                      📦 Stock auto
                    </span>
                  ) : (
                    <span className="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
                      📦 Choix manuel
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-600 mt-2">
                  {reason === 'other'
                    ? 'Le remboursement et la remise en stock seront décidés manuellement.'
                    : reasonConfig.autoRefund && reasonConfig.autoRestock
                      ? 'Client remboursé + Produit remis en stock automatiquement'
                      : reasonConfig.autoRefund && !reasonConfig.autoRestock
                        ? 'Client remboursé + Décision manuelle pour le stock'
                        : !reasonConfig.autoRefund && reasonConfig.autoRestock
                          ? 'Pas de remboursement + Produit remis en stock automatiquement'
                          : 'Pas de remboursement + Décision manuelle pour le stock'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <EnhancedButton
          variant="secondary"
          onClick={onCancel}
        >
          Annuler
        </EnhancedButton>
        <EnhancedButton
          variant="primary"
          disabled={!selectedSale || !selectedProduct}
          onClick={handleSubmit}
        >
          Créer le retour
        </EnhancedButton>
      </div>
    </div>
    </>
  );
}