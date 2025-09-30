import React, { useState } from 'react';
import {
  RotateCcw,
  //AlertCircle,
  //CheckCircle,
  Package,
  //Calendar,
  //User,
  X,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { Sale, CartItem } from '../types';

// Types pour le système de retours
interface ReturnItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  productVolume: string;
  quantitySold: number;
  quantityReturned: number;
  reason: ReturnReason;
  returnedBy: string;
  returnedAt: Date;
  refundAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'restocked';
  autoRestock: boolean;
  manualRestockRequired: boolean;
  restockedAt?: Date;
  notes?: string;
}

type ReturnReason = 'defective' | 'wrong_item' | 'customer_change' | 'expired' | 'other';

interface ReturnsSystemProps {
  isOpen: boolean;
  onClose: () => void;
}

const returnReasons = {
  defective: { label: 'Produit défectueux', color: 'red', autoRestock: false },
  wrong_item: { label: 'Mauvais article livré', color: 'orange', autoRestock: true },
  customer_change: { label: 'Changement d\'avis client', color: 'blue', autoRestock: true },
  expired: { label: 'Produit expiré', color: 'purple', autoRestock: false },
  other: { label: 'Autre raison', color: 'gray', autoRestock: false }
};

export function ReturnsSystem({ isOpen, onClose }: ReturnsSystemProps) {
  const {
    sales,
    increaseStock
  } = useAppContext();
  const formatPrice = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();

  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  
  // Récupérer les ventes récentes (7 derniers jours)
  const getRecentSales = (): Sale[] => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    return sales.filter(sale => new Date(sale.date) >= weekAgo);
  };

  // Créer un retour
  const createReturn = (
    saleId: string, 
    productId: string, 
    quantity: number, 
    reason: ReturnReason,
    notes?: string
  ) => {
    const sale = sales.find(s => s.id === saleId);
    const item = sale?.items.find(i => i.product.id === productId);
    
    if (!sale || !item || !currentSession) {
      showError('Données invalides');
      return;
    }

    const reasonConfig = returnReasons[reason];
    const newReturn: ReturnItem = {
      id: `return_${Date.now()}`,
      saleId,
      productId,
      productName: item.product.name,
      productVolume: item.product.volume,
      quantitySold: item.quantity,
      quantityReturned: quantity,
      reason,
      returnedBy: currentSession.userId,
      returnedAt: new Date(),
      refundAmount: item.product.price * quantity,
      status: 'pending',
      autoRestock: reasonConfig.autoRestock,
      manualRestockRequired: !reasonConfig.autoRestock,
      notes
    };

    setReturns(prev => [newReturn, ...prev]);
    showSuccess(`Retour créé pour ${quantity}x ${item.product.name}`);
    setShowCreateReturn(false);
    setSelectedSale(null);
  };

  // Approuver un retour
  const approveReturn = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem) return;

    let newStatus: ReturnItem['status'] = 'approved';

    // Remise en stock automatique selon la raison
    if (returnItem.autoRestock) {
      increaseStock(returnItem.productId, returnItem.quantityReturned);
      newStatus = 'restocked';
      showSuccess(`Retour approuvé - ${returnItem.quantityReturned}x ${returnItem.productName} remis en stock automatiquement`);
    } else {
      showSuccess(`Retour approuvé - Choix de remise en stock disponible`);
    }
    
    setReturns(prev => prev.map(r => 
      r.id === returnId ? { ...r, status: newStatus, restockedAt: returnItem.autoRestock ? new Date() : undefined } : r
    ));
  };

  // Remettre en stock manuellement
  const manualRestock = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem || returnItem.status !== 'approved') return;

    increaseStock(returnItem.productId, returnItem.quantityReturned);
    
    setReturns(prev => prev.map(r => 
      r.id === returnId ? { ...r, status: 'restocked', restockedAt: new Date() } : r
    ));
    
    showSuccess(`${returnItem.quantityReturned}x ${returnItem.productName} remis en stock`);
  };

  // Rejeter un retour
  const rejectReturn = (returnId: string) => {
    setReturns(prev => prev.map(r => 
      r.id === returnId ? { ...r, status: 'rejected' } : r
    ));
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
                                  Stock auto
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
                  recentSales={getRecentSales()}
                  onCreateReturn={createReturn}
                  onCancel={() => {
                    setShowCreateReturn(false);
                    setSelectedSale(null);
                  }}
                  selectedSale={selectedSale}
                  onSelectSale={setSelectedSale}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Formulaire de création de retour
function CreateReturnForm({ 
  recentSales, 
  onCreateReturn, 
  onCancel, 
  selectedSale, 
  onSelectSale 
}: {
  recentSales: Sale[];
  onCreateReturn: (saleId: string, productId: string, quantity: number, reason: ReturnReason, notes?: string) => void;
  onCancel: () => void;
  selectedSale: Sale | null;
  onSelectSale: (sale: Sale) => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState<CartItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!selectedSale || !selectedProduct) return;

    onCreateReturn(selectedSale.id, selectedProduct.product.id, quantity, reason, notes || undefined);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">Créer un nouveau retour</h3>

      <div className="space-y-4">
        {/* Sélection de la vente */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Vente (7 derniers jours)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {recentSales.map(sale => (
              <motion.button
                key={sale.id}
                onClick={() => onSelectSale(sale)}
                whileHover={{ scale: 1.02 }}
                className={`p-3 text-left rounded-lg border-2 transition-colors ${
                  selectedSale?.id === sale.id 
                    ? 'border-orange-500 bg-orange-50' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-gray-800">
                  Vente #{sale.id.slice(-6)}
                </p>
                <p className="text-sm text-gray-600">
                  {new Date(sale.date).toLocaleDateString('fr-FR')} • {sale.items.length} articles
                </p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Sélection du produit */}
        {selectedSale && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Produit à retourner
            </label>
            <div className="space-y-2">
              {selectedSale.items.map((item: CartItem, index: number) => (
                <motion.button
                  key={index}
                  onClick={() => setSelectedProduct(item)}
                  whileHover={{ scale: 1.01 }}
                  className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                    selectedProduct === item 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-800">
                        {item.product.name} ({item.product.volume})
                      </p>
                      <p className="text-sm text-gray-600">
                        Quantité vendue: {item.quantity}
                      </p>
                    </div>
                    <p className="text-blue-600 font-semibold">
                      {item.product.price} FCFA
                    </p>
                  </div>
                </motion.button>
              ))}
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
                  max={selectedProduct.quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg bg-white"
                />
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
                  {Object.entries(returnReasons).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label} {value.autoRestock ? '(Stock auto)' : '(Choix manuel)'}
                    </option>
                  ))}
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-700 font-medium">
                Montant du remboursement: {(selectedProduct.product.price * quantity).toLocaleString()} FCFA
              </p>
              <p className="text-blue-600 text-sm">
                {returnReasons[reason].autoRestock ? 'Remise en stock automatique' : 'Choix de remise en stock après approbation'}
              </p>
            </div>
          </>
        )}

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
    </div>
  );
}