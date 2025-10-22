// components/ConsignmentSystem.tsx - Système de gestion des consignations

import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  X,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Phone,
  Calendar,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useConsignments } from '../hooks/useConsignments';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import type { Consignment } from '../types';
import { getSaleDate } from '../utils/saleHelpers';

interface ConsignmentSystemProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'create' | 'active' | 'history';

export const ConsignmentSystem: React.FC<ConsignmentSystemProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const { formatPrice } = useCurrencyFormatter();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Gestion des Consignations</h2>
                <p className="text-orange-100 text-sm">
                  Gérer les produits consignés et récupérations
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="flex">
              <TabButton
                active={activeTab === 'create'}
                onClick={() => setActiveTab('create')}
                icon={<Package className="w-5 h-5" />}
                label="Créer Consignation"
              />
              <TabButton
                active={activeTab === 'active'}
                onClick={() => setActiveTab('active')}
                icon={<Clock className="w-5 h-5" />}
                label="Consignations Actives"
              />
              <TabButton
                active={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                icon={<Archive className="w-5 h-5" />}
                label="Historique"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'create' && <CreateConsignmentTab onClose={onClose} />}
            {activeTab === 'active' && <ActiveConsignmentsTab />}
            {activeTab === 'history' && <HistoryTab />}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ===== TAB BUTTON =====
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 font-medium transition-all ${
      active
        ? 'text-orange-600 border-b-2 border-orange-600 bg-white'
        : 'text-gray-600 hover:text-orange-600 hover:bg-white/50'
    }`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// ===== TAB 1: CRÉER CONSIGNATION =====
interface CreateConsignmentTabProps {
  onClose: () => void;
}

const CreateConsignmentTab: React.FC<CreateConsignmentTabProps> = ({ onClose }) => {
  const { getTodaySales, getReturnsBySale } = useAppContext();
  const { createConsignment, getConsignedStockByProduct } = useConsignments();
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, showError } = useFeedback();
  const { currentBar, getBarMembers } = useBarContext();
  const { currentSession: session } = useAuth();

  // 👥 Obtenir les membres de l'équipe du bar actuel
  const barMembers = currentBar ? getBarMembers(currentBar.id) : [];
  const users = barMembers.map(m => m.user);

  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expirationDays, setExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);

  useEffect(() => {
    setExpirationDays(currentBar?.settings?.consignmentExpirationDays ?? 7);
  }, [currentBar?.settings?.consignmentExpirationDays]);

  if (!currentBar || !session) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 bg-gray-50 rounded-lg h-full">
        <AlertTriangle className="w-12 h-12 text-orange-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-800">Accès non autorisé</h3>
        <p className="text-gray-600 mt-2 max-w-md">
          {!currentBar
            ? "Veuillez d'abord sélectionner un bar pour pouvoir créer une consignation."
            : "Votre session a expiré. Veuillez vous reconnecter."}
        </p>
        <EnhancedButton 
          onClick={onClose} 
          className="mt-6 bg-purple-600 hover:bg-purple-700 text-white">
          Fermer
        </EnhancedButton>
      </div>
    );
  }

  const todaySales = getTodaySales();
  const filteredSales = useMemo(() => {
    if (!searchTerm) return todaySales;
    return todaySales.filter(sale =>
      sale.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [todaySales, searchTerm]);

  const selectedSale = todaySales.find(s => s.id === selectedSaleId);
  const selectedProductItem = selectedSale?.items.find(item => item.product.id === selectedProductId);

  const getAlreadyReturned = (saleId: string, productId: string): number => {
    return getReturnsBySale(saleId)
      .filter(r => r.productId === productId && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantityReturned, 0);
  };

  const maxQuantity = selectedProductItem
    ? selectedProductItem.quantity - getAlreadyReturned(selectedSale!.id, selectedProductItem.product.id)
    : 0;

  const handleCreateConsignment = () => {
    if (!selectedSale || !selectedProductItem) {
      showError('Veuillez sélectionner une vente et un produit');
      return;
    }

    if (quantity < 1 || quantity > maxQuantity) {
      showError(`Quantité invalide (max: ${maxQuantity})`);
      return;
    }

    if (!customerName.trim()) {
      showError('Veuillez saisir le nom du client');
      return;
    }

    const consignment = createConsignment({
      saleId: selectedSale.id,
      productId: selectedProductItem.product.id,
      productName: selectedProductItem.product.name,
      productVolume: selectedProductItem.product.volume,
      quantity,
      totalAmount: selectedProductItem.product.price * quantity,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      expiresAt: new Date(), // Sera calculé par le hook
      expirationDays: expirationDays, // Passer la valeur de l'état
      originalSeller: selectedSale.createdBy, // ✅ Capturer le vendeur original de la vente
    });

    if (consignment) {
      showSuccess(`Consignation créée: ${quantity} ${selectedProductItem.product.name} ${selectedProductItem.product.volume}`);
      // Reset form
      setSelectedSaleId('');
      setSelectedProductId('');
      setQuantity(1);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
    } else {
      showError('Erreur: Impossible de créer. Le bar est-il sélectionné et la session active ?');
    }
  };

  return (
    <div className="space-y-6">
      {/* Instruction */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-purple-800">
          <p className="font-semibold mb-1">Comment créer une consignation ?</p>
          <ol className="list-decimal list-inside space-y-1 text-purple-700">
            <li>Sélectionnez la vente d'origine (aujourd'hui uniquement)</li>
            <li>Choisissez le produit à consigner</li>
            <li>Indiquez la quantité et les infos client</li>
            <li>Le stock consigné sera réservé automatiquement</li>
          </ol>
        </div>
      </div>

      {/* Recherche vente */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          1. Sélectionner la vente
        </label>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par ID vente..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
          {filteredSales.length === 0 ? (
            <p className="text-gray-500 text-sm col-span-2">Aucune vente trouvée aujourd'hui</p>
          ) : (
            filteredSales.map(sale => {
              // 👤 Trouver le vendeur
              const seller = sale.createdBy ? users.find(u => u.id === sale.createdBy) : null;

              return (
                <button
                  key={sale.id}
                  onClick={() => {
                    setSelectedSaleId(sale.id);
                    setSelectedProductId('');
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedSaleId === sale.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="font-medium text-gray-900 text-sm mb-1">#{sale.id}</div>
                  <div className="text-xs text-gray-600">
                    {sale.items.length} article(s) · {formatPrice(sale.total)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {getSaleDate(sale).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {seller && (
                    <div className="text-xs text-purple-600 mt-1">
                      👤 {seller.name}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Sélection produit */}
      {selectedSale && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            2. Choisir le produit à consigner
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selectedSale.items.map(item => {
              const consignedStock = getConsignedStockByProduct(item.product.id);
              const returnedStock = getAlreadyReturned(selectedSale.id, item.product.id);
              const available = item.quantity - consignedStock - returnedStock;
              const isFullyUnavailable = available <= 0;

              return (
                <button
                  key={item.product.id}
                  onClick={() => {
                    if (!isFullyUnavailable) {
                      setSelectedProductId(item.product.id);
                      setQuantity(1);
                    }
                  }}
                  disabled={isFullyUnavailable}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    isFullyUnavailable
                      ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                      : selectedProductId === item.product.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{item.product.name}</div>
                  <div className="text-sm text-gray-600">{item.product.volume}</div>
                  <div className="text-sm text-purple-600 font-medium mt-1">
                    {formatPrice(item.product.price)} × {item.quantity}
                  </div>
                  <div className="text-xs text-orange-600 mt-1 space-x-2">
                    {consignedStock > 0 && <span>⚠️ {consignedStock} consigné(s)</span>}
                    {returnedStock > 0 && <span>↩️ {returnedStock} retourné(s)</span>}
                  </div>
                  <div className={`text-sm font-medium mt-1 ${isFullyUnavailable ? 'text-red-600' : 'text-green-600'}`}>
                    Disponible: {available}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantité et infos client */}
      {selectedProductItem && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              3. Quantité à consigner
            </label>
            <input
              type="number"
              min="1"
              max={maxQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum: {maxQuantity}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline w-4 h-4 mr-1" />
                Nom du client *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: Jean Dupont"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="inline w-4 h-4 mr-1" />
                Téléphone (optionnel)
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Ex: +229 XX XX XX XX"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informations complémentaires..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-1" />
              Durée d'expiration (jours)
            </label>
            <input
              type="number"
              min="1"
              value={expirationDays}
              onChange={(e) => setExpirationDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Modifiez pour définir une durée spécifique pour cette consigne uniquement.</p>
          </div>

          {/* Récapitulatif */}
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h4 className="font-semibold text-purple-900 mb-2">Récapitulatif</h4>
            <div className="space-y-1 text-sm text-purple-800">
              <p>• Produit: {selectedProductItem.product.name} {selectedProductItem.product.volume}</p>
              <p>• Quantité: {quantity}</p>
              <p>• Montant: {formatPrice(selectedProductItem.product.price * quantity)} (déjà payé)</p>
              <p>• Client: {customerName || '(non saisi)'}</p>
            </div>
          </div>

          <EnhancedButton
            onClick={handleCreateConsignment}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium"
          >
            Créer la Consignation
          </EnhancedButton>
        </div>
      )}
    </div>
  );
};

// ===== TAB 2: CONSIGNATIONS ACTIVES =====
const ActiveConsignmentsTab: React.FC = () => {
  const { getActiveConsignments, claimConsignment, forfeitConsignment, checkAndExpireConsignments } = useConsignments();
  const { products, decreaseStock, sales } = useAppContext();
  const { currentBar, getBarMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, showError } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');

  // 👥 Obtenir les membres de l'équipe du bar actuel
  const barMembers = currentBar ? getBarMembers(currentBar.id) : [];
  const users = barMembers.map(m => m.user);

  const activeConsignments = getActiveConsignments();

  const filteredConsignments = useMemo(() => {
    if (!searchTerm) return activeConsignments;
    const term = searchTerm.toLowerCase();
    return activeConsignments.filter(c =>
      c.customerName?.toLowerCase().includes(term) ||
      c.customerPhone?.includes(term) ||
      c.productName.toLowerCase().includes(term) ||
      c.id.toLowerCase().includes(term)
    );
  }, [activeConsignments, searchTerm]);

  const handleClaim = (consignment: Consignment) => {
    const confirmed = window.confirm(
      `Valider la récupération de ${consignment.quantity} ${consignment.productName} par ${consignment.customerName} ?\n\nLe produit sera déduit du stock des consignes actives.`
    );

    if (!confirmed) return;

    const success = claimConsignment(consignment.id);
    if (success) {
      showSuccess(`Consignation récupérée: ${consignment.quantity} ${consignment.productName}`);
    } else {
      showError('Erreur lors de la récupération');
    }
  };

  const handleForfeit = (consignment: Consignment) => {
    const confirmed = window.confirm(
      `Confisquer la consignation de ${consignment.customerName} ?\n\nLe produit sera retiré du stock des consignes et redeviendra immédiatement vendable.`
    );

    if (!confirmed) return;

    const success = forfeitConsignment(consignment.id);
    if (success) {
      showSuccess('Consignation confisquée, stock libéré');
    } else {
      showError('Erreur lors de la confiscation');
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 rounded-lg px-4 py-2">
            <span className="text-2xl font-bold text-purple-600">{activeConsignments.length}</span>
            <span className="text-sm text-purple-700 ml-2">actif(s)</span>
          </div>
          <button
            onClick={checkAndExpireConsignments}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            <Clock className="w-4 h-4" />
            Vérifier expirations
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par client, produit, ID..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Liste */}
      {filteredConsignments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-3 opacity-50" />
          <p>Aucune consignation active</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredConsignments.map(consignment => (
            <ConsignmentCard
              key={consignment.id}
              consignment={consignment}
              onClaim={() => handleClaim(consignment)}
              onForfeit={() => handleForfeit(consignment)}
              users={users}
              sales={sales}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===== CONSIGNMENT CARD =====
interface ConsignmentCardProps {
  consignment: Consignment;
  onClaim: () => void;
  onForfeit: () => void;
  users: any[]; // ✅ Ajouter users pour afficher vendeur
  sales: any[]; // ✅ Ajouter sales pour fallback
}

const ConsignmentCard: React.FC<ConsignmentCardProps> = ({ consignment, onClaim, onForfeit, users, sales }) => {
  const { formatPrice } = useCurrencyFormatter();

  // 👤 Trouver le vendeur original
  // Fallback : si originalSeller n'existe pas (ancienne consignation), chercher dans la vente originale
  let originalSeller = null;
  if (consignment.originalSeller) {
    originalSeller = users.find((u: any) => u.id === consignment.originalSeller);
  } else {
    // Fallback pour anciennes consignations
    const originalSale = sales.find((s: any) => s.id === consignment.saleId);
    if (originalSale?.createdBy) {
      originalSeller = users.find((u: any) => u.id === originalSale.createdBy);
    }
  }

  const expiresAt = new Date(consignment.expiresAt);
  const now = new Date();
  const hoursLeft = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
  const isExpiringSoon = hoursLeft <= 24;

  return (
    <div className="bg-white border-2 border-purple-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-900">{consignment.customerName}</h4>
          {consignment.customerPhone && (
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {consignment.customerPhone}
            </p>
          )}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          isExpiringSoon ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {hoursLeft > 48 ? `${Math.floor(hoursLeft / 24)}j` : `${hoursLeft}h`}
        </div>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Produit:</span>
          <span className="font-medium">{consignment.productName} {consignment.productVolume}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Quantité:</span>
          <span className="font-medium">{consignment.quantity}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Montant:</span>
          <span className="font-medium text-purple-600">{formatPrice(consignment.totalAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Expire le:</span>
          <span className="text-xs">{expiresAt.toLocaleDateString('fr-FR')}</span>
        </div>
        {originalSeller && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Vendeur:</span>
            <span className="text-xs font-medium text-purple-600">👤 {originalSeller.name}</span>
          </div>
        )}
      </div>

      {consignment.notes && (
        <div className="bg-gray-50 rounded p-2 mb-4">
          <p className="text-xs text-gray-600">{consignment.notes}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClaim}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Récupéré
        </button>
        <button
          onClick={onForfeit}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <XCircle className="w-4 h-4" />
          Confisquer
        </button>
      </div>
    </div>
  );
};

// ===== TAB 3: HISTORIQUE =====
const HistoryTab: React.FC = () => {
  const { consignments } = useConsignments();
  const { sales } = useAppContext();
  const { currentBar, getBarMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const [filterStatus, setFilterStatus] = useState<'all' | 'claimed' | 'expired' | 'forfeited'>('all');

  // 👥 Obtenir les membres de l'équipe du bar actuel
  const barMembers = currentBar ? getBarMembers(currentBar.id) : [];
  const users = barMembers.map(m => m.user);

  const historyConsignments = useMemo(() => {
    const filtered = consignments.filter(c => c.status !== 'active');
    if (filterStatus === 'all') return filtered;
    return filtered.filter(c => c.status === filterStatus);
  }, [consignments, filterStatus]);

  const sortedHistory = useMemo(() => {
    return [...historyConsignments].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [historyConsignments]);

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: 'Tout' },
          { value: 'claimed', label: 'Récupérés' },
          { value: 'expired', label: 'Expirés' },
          { value: 'forfeited', label: 'Confisqués' }
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setFilterStatus(filter.value as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === filter.value
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Liste historique */}
      {sortedHistory.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Archive className="w-16 h-16 mx-auto mb-3 opacity-50" />
          <p>Aucun historique</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedHistory.map(consignment => {
            // 👤 Trouver le vendeur original
            // Fallback : si originalSeller n'existe pas (ancienne consignation), chercher dans la vente originale
            let originalSeller = null;
            if (consignment.originalSeller) {
              originalSeller = users.find((u: any) => u.id === consignment.originalSeller);
            } else {
              // Fallback pour anciennes consignations
              const originalSale = sales.find((s: any) => s.id === consignment.saleId);
              if (originalSale?.createdBy) {
                originalSeller = users.find((u: any) => u.id === originalSale.createdBy);
              }
            }

            return (
              <div
                key={consignment.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{consignment.customerName}</h4>
                    <p className="text-sm text-gray-600">
                      {consignment.quantity} × {consignment.productName} {consignment.productVolume}
                    </p>
                    {originalSeller && (
                      <p className="text-xs text-purple-600 mt-1">
                        👤 Vendeur: {originalSeller.name}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={consignment.status} />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Créé: {new Date(consignment.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span>{formatPrice(consignment.totalAmount)}</span>
                </div>

                {consignment.claimedAt && (
                  <div className="text-xs text-green-600 mt-1">
                    Récupéré le {new Date(consignment.claimedAt).toLocaleDateString('fr-FR')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ===== STATUS BADGE =====
const StatusBadge: React.FC<{ status: Consignment['status'] }> = ({ status }) => {
  const configs = {
    active: { label: 'Actif', color: 'bg-purple-100 text-purple-700' },
    claimed: { label: 'Récupéré', color: 'bg-green-100 text-green-700' },
    expired: { label: 'Expiré', color: 'bg-orange-100 text-orange-700' },
    forfeited: { label: 'Confisqué', color: 'bg-red-100 text-red-700' }
  };

  const config = configs[status];

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
};
