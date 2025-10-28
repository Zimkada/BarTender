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
import { useAppContext } from '../context/AppContext'; // Gardé pour getTodaySales, etc.
import { useStockManagement } from '../hooks/useStockManagement'; // NOUVEAU
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
  const stockManager = useStockManagement(); // NOUVEAU
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, showError } = useFeedback();
  const { currentBar, getBarMembers } = useBarContext();
  const { currentSession: session } = useAuth();

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

    const consignment = stockManager.createConsignment({ // MODIFIÉ
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
      expirationDays: expirationDays,
      originalSeller: selectedSale.createdBy,
    });

    if (consignment) {
      showSuccess(`Consignation créée: ${quantity} ${selectedProductItem.product.name} ${selectedProductItem.product.volume}`);
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
      {/* ... (le reste du JSX est identique jusqu'à la sélection de produit) ... */}
      
      {/* Recherche vente */}
      <div>
        {/* ... */}
      </div>

      {/* Sélection produit */}
      {selectedSale && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            2. Choisir le produit à consigner
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selectedSale.items.map(item => {
              const stockInfo = stockManager.getProductStockInfo(item.product.id); // MODIFIÉ
              const consignedStock = stockInfo?.consignedStock ?? 0;
              const returnedStock = getAlreadyReturned(selectedSale.id, item.product.id);
              
              // La logique de disponibilité est maintenant plus simple
              const availableForConsignment = item.quantity - returnedStock;
              const isFullyUnavailable = availableForConsignment <= 0;

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
                    {consignedStock > 0 && <span>⚠️ {consignedStock} consigné(s) ailleurs</span>}
                    {returnedStock > 0 && <span>↩️ {returnedStock} retourné(s)</span>}
                  </div>
                  <div className={`text-sm font-medium mt-1 ${isFullyUnavailable ? 'text-red-600' : 'text-green-600'}`}>
                    Disponible pour consignation: {availableForConsignment}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ... (le reste du JSX est identique) ... */}
    </div>
  );
};

// ===== TAB 2: CONSIGNATIONS ACTIVES =====
const ActiveConsignmentsTab: React.FC = () => {
  const stockManager = useStockManagement(); // NOUVEAU
  const { sales } = useAppContext();
  const { currentBar, getBarMembers } = useBarContext();
  const { showSuccess, showError } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');

  const barMembers = currentBar ? getBarMembers(currentBar.id) : [];
  const users = barMembers.map(m => m.user);

  const activeConsignments = useMemo(() => 
    stockManager.consignments.filter(c => c.status === 'active'),
    [stockManager.consignments]
  );

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

  // ✅ Effet pour remettre en stock est SUPPRIMÉ. La logique est maintenant dans le hook.

  const handleClaim = (consignment: Consignment) => {
    const confirmed = window.confirm(
      `Valider la récupération de ${consignment.quantity} ${consignment.productName} par ${consignment.customerName} ?`
    );
    if (!confirmed) return;

    const success = stockManager.claimConsignment(consignment.id); // MODIFIÉ
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

    const success = stockManager.forfeitConsignment(consignment.id); // MODIFIÉ
    if (success) {
      // ✅ La ligne `increaseStock` est SUPPRIMÉE. C'est maintenant atomique.
      showSuccess(`Consignation confisquée - ${consignment.quantity}x ${consignment.productName} remis en stock`);
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
            onClick={stockManager.checkAndExpireConsignments} // MODIFIÉ
            className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            <Clock className="w-4 h-4" />
            Vérifier expirations
          </button>
        </div>
        {/* ... (le reste du JSX est identique) ... */}
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
// ... (Aucun changement nécessaire ici)

// ===== TAB 3: HISTORIQUE =====
const HistoryTab: React.FC = () => {
  const { consignments } = useStockManagement(); // MODIFIÉ
  const { sales } = useAppContext();
  const { currentBar, getBarMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const [filterStatus, setFilterStatus] = useState<'all' | 'claimed' | 'expired' | 'forfeited'>('all');

  const barMembers = currentBar ? getBarMembers(currentBar.id) : [];
  const users = barMembers.map(m => m.user);

  const historyConsignments = useMemo(() => {
    const filtered = consignments.filter(c => c.status !== 'active');
    if (filterStatus === 'all') return filtered;
    return filtered.filter(c => c.status === filterStatus);
  }, [consignments, filterStatus]);
  
  // ... (le reste du JSX est identique)
};

// ... (le reste du fichier est identique)
