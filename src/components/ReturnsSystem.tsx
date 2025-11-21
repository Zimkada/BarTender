import { useState, useMemo } from 'react';
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
import { useStockManagement } from '../hooks/useStockManagement';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { Sale, CartItem, Return, ReturnReason, ReturnReasonConfig } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';
import { getSaleDate } from '../utils/saleHelpers';

interface ReturnsSystemProps {
  isOpen: boolean;
  onClose: () => void;
}

const returnReasons: Record<ReturnReason, ReturnReasonConfig> = {
  defective: {
    label: 'Défectueux',
    description: 'Remboursé, pas remis en stock',
    icon: '⚠️',
    color: 'red',
    autoRestock: false,
    autoRefund: true
  },
  wrong_item: {
    label: 'Erreur article',
    description: 'Remboursé + remis en stock',
    icon: '🔄',
    color: 'orange',
    autoRestock: true,
    autoRefund: true
  },
  customer_change: {
    label: 'Non consommé',
    description: 'Pas remboursé, remis en stock',
    icon: '↩️',
    color: 'blue',
    autoRestock: true,
    autoRefund: false
  },
  expired: {
    label: 'Périmé',
    description: 'Remboursé, pas remis en stock',
    icon: '📅',
    color: 'purple',
    autoRestock: false,
    autoRefund: true
  },
  other: {
    label: 'Autre (manuel)',
    description: 'Gérant décide remboursement et stock',
    icon: '✏️',
    color: 'gray',
    autoRestock: false,
    autoRefund: false
  }
};

export function ReturnsSystem({ isOpen, onClose }: ReturnsSystemProps) {
  const {
    sales,
    returns,
    addReturn,
    updateReturn,
    getReturnsBySale
  } = useAppContext();
  const {
    increasePhysicalStock,
    consignments
  } = useStockManagement();
  const { currentBar, barMembers } = useBarContext();
  const users = barMembers.map(m => m.user).filter(Boolean);
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();

  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;

  const canReturnSale = (sale: Sale): { allowed: boolean; reason: string } => {
    const saleBusinessDay = getBusinessDay(getSaleDate(sale), closeHour);
    const currentBusinessDay = getCurrentBusinessDay(closeHour);
    const now = new Date();

    if (!isSameDay(saleBusinessDay, currentBusinessDay)) {
      return {
        allowed: false,
        reason: `Caisse du ${saleBusinessDay.toLocaleDateString('fr-FR')} déjà clôturée. Retours impossibles.`
      };
    }

    const nextCloseTime = new Date(currentBusinessDay);
    nextCloseTime.setDate(nextCloseTime.getDate() + 1);
    nextCloseTime.setHours(closeHour, 0, 0, 0);

    if (now >= nextCloseTime) {
      return {
        allowed: false,
        reason: `Clôture caisse à ${closeHour}h déjà effectuée. Retours impossibles.`
      };
    }

    return {
      allowed: true,
      reason: `Retour autorisé (avant clôture ${closeHour}h)`
    };
  };

  const getReturnableSales = useMemo((): Sale[] => {
    const currentBusinessDay = getCurrentBusinessDay(closeHour);
    return sales.filter(sale => {
      if (sale.status !== 'validated') return false;
      const saleDate = getSaleDate(sale);
      const saleBusinessDay = getBusinessDay(saleDate, closeHour);
      return isSameDay(saleBusinessDay, currentBusinessDay);
    });
  }, [sales, closeHour]);

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

    const returnCheck = canReturnSale(sale);
    if (!returnCheck.allowed) {
      showError(returnCheck.reason);
      return;
    }

    const existingReturns = getReturnsBySale(saleId);
    const alreadyReturnedQty = existingReturns
      .filter(r => r.productId === productId && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantityReturned, 0);

    // ✅ Tenir compte des consignations actives
    const alreadyConsignedQty = consignments
      .filter(c => c.saleId === saleId && c.productId === productId && c.status === 'active')
      .reduce((sum, c) => sum + c.quantity, 0);

    const remainingQty = item.quantity - alreadyReturnedQty - alreadyConsignedQty;

    if (quantity > remainingQty) {
      showError(`Impossible : ${alreadyReturnedQty} déjà retourné(s), ${alreadyConsignedQty} consigné(s). Reste ${remainingQty} disponible(s).`);
      return;
    }

    if (remainingQty <= 0) {
      showError(`Ce produit n'est plus disponible pour retour (${alreadyReturnedQty} retourné(s), ${alreadyConsignedQty} consigné(s))`);
      return;
    }

    const reasonConfig = returnReasons[reason];
    const finalRefund = reason === 'other' ? (customRefund ?? false) : reasonConfig.autoRefund;
    const finalRestock = reason === 'other' ? (customRestock ?? false) : reasonConfig.autoRestock;

    const newReturn = addReturn({
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
      customRestock: reason === 'other' ? customRestock : undefined,
      originalSeller: sale.createdBy
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

  const approveReturn = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem) return;

    let newStatus: Return['status'] = 'approved';

    if (returnItem.autoRestock) {
      increasePhysicalStock(returnItem.productId, returnItem.quantityReturned);
      newStatus = 'restocked';
      const refundInfo = returnItem.isRefunded ? ` + Remboursement ${formatPrice(returnItem.refundAmount)}` : '';
      showSuccess(`Retour approuvé - ${returnItem.quantityReturned}x ${returnItem.productName} remis en stock${refundInfo}`);
    } else {
      const refundInfo = returnItem.isRefunded ? ` - Remboursement ${formatPrice(returnItem.refundAmount)}` : '';
      showSuccess(`Retour approuvé${refundInfo} - Choix de remise en stock disponible`);
    }

    updateReturn(returnId, {
      status: newStatus,
      restockedAt: returnItem.autoRestock ? new Date() : undefined
    });
  };

  const manualRestock = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem || returnItem.status !== 'approved') return;

    increasePhysicalStock(returnItem.productId, returnItem.quantityReturned);

    updateReturn(returnId, {
      status: 'restocked',
      restockedAt: new Date()
    });

    showSuccess(`${returnItem.quantityReturned}x ${returnItem.productName} remis en stock`);
  };

  const rejectReturn = (returnId: string) => {
    updateReturn(returnId, { status: 'rejected' });
    showSuccess('Retour rejeté');
  };

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
            className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RotateCcw size={28} />
                <div>
                  <h2 className="text-xl font-bold">Système de retours</h2>
                  <p className="text-sm text-amber-100">Gérer les retours produits</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateReturn(true)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  <span className="text-sm font-medium">Nouveau retour</span>
                </button>
                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-amber-50 to-amber-50">
              {!showCreateReturn ? (
                <>
                  <div className="flex flex-wrap gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <Search size={16} className="text-gray-400" />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-3 py-2 border border-amber-200 rounded-lg bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-gray-400" />
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                        className="px-3 py-2 border border-amber-200 rounded-lg bg-white"
                      >
                        <option value="all">Tous les statuts</option>
                        <option value="pending">En attente</option>
                        <option value="approved">Approuvés</option>
                        <option value="rejected">Rejetés</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {filteredReturns.length === 0 ? (
                      <div className="text-center py-12">
                        <RotateCcw size={48} className="text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-600 mb-2">Aucun retour</h3>
                        <p className="text-gray-500">Les retours apparaîtront ici</p>
                      </div>
                    ) : (
                      filteredReturns.map(returnItem => {
                        let originalSeller = null;
                        if (returnItem.originalSeller) {
                          originalSeller = users.find(u => u.id === returnItem.originalSeller);
                        } else {
                          const originalSale = sales.find(s => s.id === returnItem.saleId);
                          if (originalSale?.createdBy) {
                            originalSeller = users.find(u => u.id === originalSale.createdBy);
                          }
                        }

                        return (
                          <motion.div
                            key={returnItem.id}
                            whileHover={{ y: -2 }}
                            className="bg-white rounded-xl p-4 shadow-sm border border-amber-100"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${returnItem.status === 'restocked' ? 'bg-green-500' :
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
                                  {originalSeller && (
                                    <p className="text-xs text-purple-600 mt-1">
                                      👤 Vendeur: {originalSeller.name}
                                    </p>
                                  )}
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

                            <div className="flex flex-wrap items-center justify-between gap-y-2">
                              <div className="flex items-center gap-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${returnReasons[returnItem.reason].color === 'red' ? 'bg-red-100 text-red-700' :
                                  returnReasons[returnItem.reason].color === 'orange' ? 'bg-amber-100 text-amber-700' :
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
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
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
                  consignments={consignments}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
              <AlertTriangle className="text-amber-600" size={24} />
              <h3 className="text-lg font-bold text-gray-800">Retour - Autre raison</h3>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Ce motif nécessite une décision manuelle. Précisez les actions à prendre :
            </p>

            <div className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  rows={4}
                  placeholder="Expliquez la raison du retour (obligatoire)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>

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

            <div className="flex gap-3 mt-6">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
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

function CreateReturnForm({
  returnableSales,
  returnReasons,
  onCreateReturn,
  onCancel,
  selectedSale,
  onSelectSale,
  canReturnSale,
  closeHour,
  consignments
}: {
  returnableSales: Sale[];
  returnReasons: Record<ReturnReason, ReturnReasonConfig>;
  onCreateReturn: (saleId: string, productId: string, quantity: number, reason: ReturnReason, notes?: string, customRefund?: boolean, customRestock?: boolean) => void;
  onCancel: () => void;
  selectedSale: Sale | null;
  onSelectSale: (sale: Sale) => void;
  canReturnSale: (sale: Sale) => { allowed: boolean; reason: string };
  closeHour: number;
  consignments: any[];
}) {
  const { getReturnsBySale } = useAppContext();
  const { currentBar, barMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();

  const users = barMembers.map(m => m.user).filter(Boolean);
  const [selectedProduct, setSelectedProduct] = useState<CartItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [notes, setNotes] = useState('');
  const [showOtherReasonDialog, setShowOtherReasonDialog] = useState(false);
  const [filterSeller, setFilterSeller] = useState<string>('all'); // ✅ Filtre vendeur

  const reasonConfig = returnReasons[reason];

  const getAlreadyReturned = (productId: string): number => {
    if (!selectedSale) return 0;
    return getReturnsBySale(selectedSale.id)
      .filter(r => r.productId === productId && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantityReturned, 0);
  };

  const getAlreadyConsigned = (productId: string): number => {
    if (!selectedSale) return 0;
    return consignments
      .filter(c => c.saleId === selectedSale.id && c.productId === productId && c.status === 'active')
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  const availableQty = selectedProduct
    ? selectedProduct.quantity - getAlreadyReturned(selectedProduct.product.id) - getAlreadyConsigned(selectedProduct.product.id)
    : 0;

  // ✅ Filtrer ventes par vendeur sélectionné
  const filteredSalesBySeller = useMemo(() => {
    if (filterSeller === 'all') return returnableSales;
    return returnableSales.filter(sale => sale.createdBy === filterSeller);
  }, [returnableSales, filterSeller]);

  // ✅ Liste unique des vendeurs ayant des ventes
  const sellersWithSales = useMemo(() => {
    const sellerIds = new Set(returnableSales.map(sale => sale.createdBy).filter(Boolean));
    return users.filter(user => sellerIds.has(user.id));
  }, [returnableSales, users]);

  const handleSubmit = () => {
    if (!selectedSale || !selectedProduct) return;

    if (reason === 'other') {
      setShowOtherReasonDialog(true);
      return;
    }

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ventes de la journée commerciale actuelle
            </label>

            {/* ✅ Filtre vendeur */}
            {sellersWithSales.length > 1 && (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <select
                    value={filterSeller}
                    onChange={(e) => setFilterSeller(e.target.value)}
                    className="px-3 py-2 border border-amber-200 rounded-lg bg-white text-sm"
                  >
                    <option value="all">Tous les vendeurs ({returnableSales.length})</option>
                    {sellersWithSales.map(seller => {
                      const count = returnableSales.filter(s => s.createdBy === seller.id).length;
                      return (
                        <option key={seller.id} value={seller.id}>
                          {seller.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}

            {filteredSalesBySeller.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500">
                  {returnableSales.length === 0
                    ? 'Aucune vente dans la journée commerciale actuelle'
                    : 'Aucune vente pour ce vendeur'
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {filteredSalesBySeller.map(sale => {
                  const returnCheck = canReturnSale(sale);
                  const seller = sale.createdBy ? users.find(u => u.id === sale.createdBy) : null;

                  return (
                    <motion.button
                      key={sale.id}
                      onClick={() => returnCheck.allowed && onSelectSale(sale)}
                      whileHover={returnCheck.allowed ? { scale: 1.02 } : {}}
                      disabled={!returnCheck.allowed}
                      className={`p-3 text-left rounded-lg border-2 transition-colors ${selectedSale?.id === sale.id
                        ? 'border-amber-500 bg-amber-50'
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
                            {getSaleDate(sale).toLocaleTimeString('fr-FR')} • {sale.items.length} articles
                          </p>
                          {seller && (
                            <p className="text-xs text-purple-600 mt-0.5">
                              👤 {seller.name}
                            </p>
                          )}
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

          {selectedSale && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Produit à retourner
              </label>
              <div className="space-y-2">
                {selectedSale.items.map((item: CartItem, index: number) => {
                  const alreadyReturned = getAlreadyReturned(item.product.id);
                  const alreadyConsigned = getAlreadyConsigned(item.product.id);
                  const available = item.quantity - alreadyReturned - alreadyConsigned;
                  const isFullyUnavailable = available <= 0;

                  return (
                    <motion.button
                      key={index}
                      onClick={() => !isFullyUnavailable && setSelectedProduct(item)}
                      whileHover={!isFullyUnavailable ? { scale: 1.01 } : {}}
                      disabled={isFullyUnavailable}
                      className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${isFullyUnavailable
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
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-sm text-gray-600">
                              Vendu: {item.quantity}
                            </p>
                            {alreadyReturned > 0 && (
                              <>
                                <span className="text-gray-400">•</span>
                                <p className="text-sm text-amber-600">
                                  Retourné: {alreadyReturned}
                                </p>
                              </>
                            )}
                            {alreadyConsigned > 0 && (
                              <>
                                <span className="text-gray-400">•</span>
                                <p className="text-sm text-purple-600">
                                  Consigné: {alreadyConsigned}
                                </p>
                              </>
                            )}
                            <span className="text-gray-400">•</span>
                            <p className={`text-sm font-medium ${isFullyUnavailable ? 'text-red-600' : 'text-green-600'}`}>
                              Disponible: {available}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-blue-600 font-semibold">
                            {item.product.price} FCFA
                          </p>
                          {isFullyUnavailable && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full mt-1 inline-block">
                              Indisponible
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

          {selectedProduct && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantité à retourner
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={availableQty}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white focus:border-amber-400 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum disponible : {availableQty}
                  </p>
                </div>

                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Raison du retour
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value as ReturnReason)}
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white text-base"
                  >
                    {Object.entries(returnReasons).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.icon} {value.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    {returnReasons[reason].description}
                  </p>
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
                  className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white"
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
                        📦 Remis en stock auto
                      </span>
                    ) : (
                      <span className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                        ❌ Pas de remise en stock
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
