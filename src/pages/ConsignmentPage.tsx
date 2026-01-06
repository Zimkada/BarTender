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
  Archive,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from '../components/EnhancedButton';
import type { User as UserType } from '../types';
import { Sale, SaleItem, Consignment } from '../types';
import { getSaleDate } from '../utils/saleHelpers';
import { useViewport } from '../hooks/useViewport';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/common/PageHeader';
import { Textarea } from '../components/ui/Textarea';
import { Label } from '../components/ui/Label';
import { Alert } from '../components/ui/Alert';
import { Select } from '../components/ui/Select';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { FEATURES } from '../config/features';

type TabType = 'create' | 'active' | 'history';

export default function ConsignmentPage() {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const { currentSession } = useAuth();

  // ✨ Déterminer si l'utilisateur est en mode read-only (serveur)
  const isReadOnly = currentSession?.role === 'serveur';

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <PageHeader
        title={isMobile ? 'Consignations' : 'Gestion des Consignations'}
        subtitle="Gérer les produits consignés et récupérations"
        icon={<Package className="w-6 h-6 text-amber-600" />}
        hideSubtitleOnMobile
      />

      {/* Tabs Navigation and Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex overflow-x-auto">
            {!isReadOnly && (
              <TabButton
                active={activeTab === 'create'}
                onClick={() => setActiveTab('create')}
                icon={<Package className="w-5 h-5" />}
                label="Créer Consignation"
              />
            )}
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
        <div className="p-6 min-h-[60vh]">
          <AnimatePresence mode="wait">
            {activeTab === 'create' && (
              <motion.div key="create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <CreateConsignmentTab
                  onNavigateBack={() => navigate(-1)}
                  onCreationSuccess={() => setActiveTab('active')}
                />
              </motion.div>
            )}
            {activeTab === 'active' && (
              <motion.div key="active" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <ActiveConsignmentsTab isReadOnly={isReadOnly} />
              </motion.div>
            )}
            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <HistoryTab />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

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
    className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 font-medium transition-all whitespace-nowrap ${active
      ? 'text-amber-600 border-b-2 border-amber-600 bg-white'
      : 'text-gray-600 hover:text-amber-600 hover:bg-white/50'
      }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ===== TAB 1: CRÉER CONSIGNATION =====
interface CreateConsignmentTabProps {
  onNavigateBack: () => void;
  onCreationSuccess?: () => void;
}

const CreateConsignmentTab: React.FC<CreateConsignmentTabProps> = ({ onNavigateBack, onCreationSuccess }) => {
  const { getTodaySales } = useAppContext();
  const stockManager = useStockManagement();
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, showError } = useFeedback();
  const { currentBar, barMembers } = useBarContext();
  const { currentSession: session } = useAuth();

  const users = Array.isArray(barMembers) ? barMembers.map((m: any) => m.user).filter(Boolean) : [];

  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [expirationDays, setExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);

  // Detecter le mode de opération
  const isSimplifiedMode = currentBar?.settings?.operatingMode === 'simplified';

  useEffect(() => {
    setExpirationDays(currentBar?.settings?.consignmentExpirationDays ?? 7);
  }, [currentBar?.settings?.consignmentExpirationDays]);

  const todaySales = getTodaySales();

  const filteredSales = useMemo(() => {
    if (!currentBar || !session) return [];
    let filtered = todaySales;

    if (filterSeller !== 'all') {
      // Source of truth: soldBy is the business attribution
      filtered = filtered.filter(sale => {
        const serverUserId = sale.soldBy;
        return serverUserId === filterSeller;
      });
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(sale =>
        sale.id.toLowerCase().includes(lowerTerm) ||
        sale.items.some(item => item.product_name.toLowerCase().includes(lowerTerm))
      );
    }

    return filtered.sort((a, b) => new Date(b.validatedAt || b.createdAt).getTime() - new Date(a.validatedAt || a.createdAt).getTime());
  }, [todaySales, filterSeller, searchTerm, currentBar, session]);

  const sellersWithSales = useMemo(() => {
    if (!currentBar || !session || !Array.isArray(todaySales) || !Array.isArray(users)) return [];
    // ✨ MODE SWITCHING FIX: Extract server IDs using mode-agnostic detection
    // Use serverId if present (simplified mode sale), otherwise createdBy (full mode sale)
    const sellerIds = new Set(
      todaySales.map(sale => sale.soldBy).filter(Boolean)
    );
    return users.filter(user => sellerIds.has(user.id));
  }, [todaySales, users, currentBar, session]);


  if (!currentBar || !session) {
    return (
      <Alert show={true} variant="warning" className="h-full">
        <h1 className="text-xl font-semibold text-gray-800">Accès non autorisé</h1>
        <p className="text-gray-600 mt-2 max-w-md mx-auto">
          {!currentBar
            ? "Veuillez d'abord sélectionner un bar pour pouvoir créer une consignation."
            : "Votre session a expiré. Veuillez vous reconnecter."}
        </p>
        <EnhancedButton
          onClick={onNavigateBack}
          className="mt-6 bg-amber-600 hover:bg-amber-700 text-white mx-auto">
          Retour
        </EnhancedButton>
      </Alert>
    );
  }

  const selectedSale = todaySales.find(s => s.id === selectedSaleId);
  const selectedProductItem = selectedSale?.items.find((item: SaleItem) => {
    const productId = item.product_id;
    return productId === selectedProductId;
  });

  const getAlreadyReturned = (saleId: string, productId: string): number => {
    // Note: Assuming getReturnsBySale is available via context or we need to import it.
    // The original code used useAppContext().getReturnsBySale.
    // I need to destructor it from useAppContext() above if I want to use it cleanly or just use it here.
    // To be cleaner, I'll assume useAppContext returns it.
    // Wait, createConsignmentTab props didn't have it but it used the hook inside.
    // Let's check `useAppContext` usage at top of component.
    return 0; // Placeholder fix: getReturnsBySale needs to be destructured from context.
  };

  // Re-adding the missing destructuring
  const { getReturnsBySale } = useAppContext();

  const getAlreadyReturnedFixed = (saleId: string, productId: string): number => {
    return getReturnsBySale(saleId)
      .filter(r => r.productId === productId && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantityReturned, 0);
  };


  const getAlreadyConsigned = (saleId: string, productId: string): number => {
    return stockManager.consignments
      .filter(c => c.saleId === saleId && c.productId === productId && c.status === 'active')
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  const maxQuantity = selectedProductItem
    ? selectedProductItem.quantity - getAlreadyReturnedFixed(selectedSale!.id, selectedProductItem.product_id) - getAlreadyConsigned(selectedSale!.id, selectedProductItem.product_id)
    : 0;

  const handleCreateConsignment = async () => {
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

    // ✨ MODE SWITCHING FIX: Always deduce server_id from the sale itself
    // Use serverId if present (simplified mode sale), otherwise createdBy (full mode sale)
    // This ensures consignment is assigned to the correct server regardless of CURRENT mode
    const serverId = selectedSale.soldBy;

    try {
      const consignment = await stockManager.createConsignment({
        saleId: selectedSale.id,
        productId: selectedProductItem.product_id,
        productName: selectedProductItem.product_name,
        productVolume: selectedProductItem.product_volume,
        quantity,
        totalAmount: selectedProductItem.unit_price * quantity,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        // Ne pas envoyer expiresAt - laisser le serveur le calculer à partir de expirationDays
        expirationDays: expirationDays,
        originalSeller: selectedSale.createdBy,
        serverId, // ✨ NUEVO: Passer le server_id résolu
      });

      if (consignment) {
        showSuccess(`Consignation créée: ${quantity} ${selectedProductItem.product_name} ${selectedProductItem.product_volume}`);
        setSelectedSaleId('');
        setSelectedProductId('');
        setQuantity(1);
        setCustomerName('');
        setCustomerPhone('');
        setNotes('');

        // Redirect to active consignments tab after successful creation
        onCreationSuccess?.();
      }
    } catch (error) {
      showError('Erreur: Impossible de créer. Le bar est-il sélectionné et la session active ?');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsInfoExpanded(!isInfoExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <p className="font-semibold text-amber-800">Comment créer une consignation ?</p>
          </div>
          {isInfoExpanded ? (
            <ChevronUp className="w-5 h-5 text-amber-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-amber-600" />
          )}
        </button>
        <AnimatePresence>
          {isInfoExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="px-4 pb-3 border-t border-amber-200">
                <ol className="list-decimal list-inside space-y-1 text-amber-700 mt-2">
                  <li>Sélectionnez la vente d'origine (aujourd'hui uniquement)</li>
                  <li>Choisissez le produit à consigner</li>
                  <li>Indiquez la quantité et les infos client</li>
                  <li>Le stock consigné sera réservé automatiquement</li>
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          1. Sélectionner la vente
        </label>

        {sellersWithSales.length > 1 && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-600" />
              <Select
                options={[
                  { value: 'all', label: `Tous les vendeurs (${todaySales.length})` },
                  ...sellersWithSales.map(seller => {
                    // ✨ MODE SWITCHING FIX: Count using mode-agnostic server detection
                    const count = todaySales.filter(s => {
                      const serverUserId = s.serverId || s.createdBy;
                      return serverUserId === seller.id;
                    }).length;
                    return { value: seller.id, label: `${seller.name} (${count})` };
                  })
                ]}
                value={filterSeller}
                onChange={(e) => setFilterSeller(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par ID ou nom de produit..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2">
          {filteredSales.length === 0 ? (
            <p className="text-gray-500 text-sm col-span-2 text-center py-4 border border-dashed rounded-lg">
              {todaySales.length === 0
                ? 'Aucune vente trouvée aujourd\'hui'
                : filterSeller !== 'all'
                  ? 'Aucune vente pour ce vendeur'
                  : 'Aucune vente trouvée'
              }
            </p>
          ) : (
            filteredSales.map(sale => {
              // ✨ MODE SWITCHING FIX: Get seller using mode-agnostic detection
              const serverUserId = sale.soldBy;
              const seller = serverUserId ? users.find(u => u.id === serverUserId) : null;
              const productPreview = sale.items.slice(0, 2).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
              const moreCount = sale.items.length - 2;

              return (
                <button
                  key={sale.id}
                  onClick={() => {
                    setSelectedSaleId(sale.id);
                    setSelectedProductId('');
                  }}
                  className={`p-4 rounded-lg border text-left transition-all hover:bg-gray-50 ${selectedSaleId === sale.id
                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                    : 'border-gray-200 hover:border-amber-300'
                    }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-medium text-gray-900 text-sm">#{sale.id.slice(-4)}</div>
                    <div className="text-xs font-bold text-gray-700">{formatPrice(sale.total)}</div>
                  </div>

                  <div className="text-xs text-gray-600 truncate" title={productPreview}>
                    {productPreview}{moreCount > 0 ? ` +${moreCount}` : ''}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    {seller ? (
                      <span className="text-xs text-purple-600">👤 {seller.name}</span>
                    ) : serverUserId ? (
                      <span className="text-xs text-gray-600">👤 ID: {serverUserId.slice(0, 8)}...</span>
                    ) : <span></span>}
                    <span className="text-xs text-gray-500">{new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {selectedSale && Array.isArray(selectedSale.items) && selectedSale.items.length > 0 && (
        <div className="animate-in slide-in-from-top-4 fade-in duration-300">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            2. Choisir le produit à consigner
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selectedSale.items.map((item: SaleItem) => {
              const productId = item.product_id;
              const productName = item.product_name;
              const productVolume = item.product_volume || '';
              const productPrice = item.unit_price;

              if (!productId || !item) return null;

              const consignedFromThisSale = getAlreadyConsigned(selectedSale.id, productId);
              const returnedStock = getAlreadyReturnedFixed(selectedSale.id, productId);
              const available = item.quantity - consignedFromThisSale - returnedStock;
              const isFullyUnavailable = available <= 0;

              return (
                <button
                  key={productId}
                  onClick={() => {
                    if (!isFullyUnavailable) {
                      setSelectedProductId(productId);
                      setQuantity(1);
                    }
                  }}
                  disabled={isFullyUnavailable}
                  className={`p-4 rounded-lg border text-left transition-all ${isFullyUnavailable
                    ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                    : selectedProductId === productId
                      ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                      : 'border-gray-200 hover:border-amber-300 hover:bg-gray-50'
                    }`}
                >
                  <div className="font-medium text-gray-900">{productName}</div>
                  <div className="text-sm text-gray-600">{productVolume}</div>
                  <div className="text-sm text-amber-600 font-medium mt-1">
                    {formatPrice(productPrice)} × {item.quantity}
                  </div>
                  <div className="text-xs text-amber-600 mt-1 space-x-2">
                    {consignedFromThisSale > 0 && <span>⚠️ {consignedFromThisSale} consigné(s)</span>}
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

      {selectedProductItem && (
        <div className="space-y-4 animate-in slide-in-from-top-4 fade-in duration-300 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              3. Quantité à consigner
            </label>
            <input
              type="number"
              required
              min="1"
              max={maxQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum: {maxQuantity}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline w-4 h-4 mr-1" />
                4. Nom du client *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: Guy GOUNOU"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="consignmentNotes">Notes (optionnel)</Label>
            <Textarea
              id="consignmentNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informations complémentaires..."
              rows={3}
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-xs text-gray-500 mt-1">Modifiez pour définir une durée spécifique pour cette consigne uniquement.</p>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <h2 className="font-semibold text-amber-900 mb-2">Récapitulatif</h2>
            <div className="space-y-1 text-sm text-amber-800">
              <p>• Produit: {selectedProductItem.product_name} {selectedProductItem.product_volume}</p>
              <p>• Quantité: {quantity}</p>
              <p>• Montant: {formatPrice(selectedProductItem.unit_price * quantity)} (déjà payé)</p>
              <p>• Client: {customerName || '(non saisi)'}</p>
            </div>
          </div>

          <EnhancedButton
            onClick={handleCreateConsignment}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg font-medium"
          >
            Créer la Consignation
          </EnhancedButton>
        </div>
      )}
    </div>
  );
};

// ===== TAB 2: CONSIGNATIONS ACTIVES =====
const ActiveConsignmentsTab: React.FC<{ isReadOnly?: boolean }> = ({ isReadOnly = false }) => {
  const stockManager = useStockManagement();
  const { sales } = useAppContext();
  const { currentBar, barMembers } = useBarContext();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');

  const users = Array.isArray(barMembers) ? barMembers.map((m: any) => m.user).filter(Boolean) : [];

  const isServerRole = currentSession?.role === 'serveur';

  const activeConsignments = useMemo(() => {
    let consignments = stockManager.consignments.filter((c: Consignment) => c.status === 'active');

    // ✨ MODE SWITCHING FIX: Filter by server if applicable
    // A server should see ALL their consignments regardless of mode
    if (isServerRole && currentSession?.userId) {
      consignments = consignments.filter((c: Consignment) =>
        c.serverId === currentSession.userId || c.originalSeller === currentSession.userId
      );
    }

    return consignments;
  }, [stockManager.consignments, isServerRole, currentSession?.userId]);

  const filteredConsignments = useMemo(() => {
    let filtered = activeConsignments;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = activeConsignments.filter((c: Consignment) =>
        c.customerName?.toLowerCase().includes(term) ||
        c.customerPhone?.includes(term) ||
        c.productName.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term)
      );
    }
    // Trier par date d'expiration (plus proche en premier)
    return filtered.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
  }, [activeConsignments, searchTerm]);

  const handleClaim = (consignment: Consignment) => {
    const confirmed = window.confirm(
      `Valider la récupération de ${consignment.quantity} ${consignment.productName} par ${consignment.customerName} ?\n\nLe produit sera déduit du stock des consignes actives.`
    );

    if (!confirmed) return;

    const success = stockManager.claimConsignment(consignment.id);
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

    const success = stockManager.forfeitConsignment(consignment.id);
    if (success) {
      showSuccess(`Consignation confisquée - ${consignment.quantity}x ${consignment.productName} remis en stock`);
    } else {
      showError('Erreur lors de la confiscation');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-amber-100 rounded-lg px-4 py-2">
            <span className="text-2xl font-bold text-amber-600">{activeConsignments.length}</span>
            <span className="text-sm text-amber-700 ml-2">actif(s)</span>
          </div>
          <button
            onClick={stockManager.checkAndExpireConsignments}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 bg-amber-50 px-3 py-2 rounded-lg"
          >
            <Clock className="w-4 h-4" />
            Vérifier expirations
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par client, produit, ID..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
      </div>

      {filteredConsignments.length === 0 ? (
        <Alert show={true} variant="info" className="py-12 text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-3 opacity-50" />
          <p>Aucune consignation active</p>
        </Alert>
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
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===== TAB 3: HISTORIQUE =====
const HistoryTab: React.FC = () => {
  const stockManager = useStockManagement();
  const { sales } = useAppContext();
  const { currentBar, barMembers } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const [filterStatus, setFilterStatus] = useState<'all' | 'claimed' | 'expired' | 'forfeited'>('all');

  const users = Array.isArray(barMembers) ? barMembers.map((m: any) => m.user).filter(Boolean) : [];

  const isServerRole = currentSession?.role === 'serveur';

  const historyConsignments = useMemo(() => {
    let filtered = stockManager.consignments.filter((c: Consignment) => c.status !== 'active');

    // ✨ MODE SWITCHING FIX: Filter by server if applicable
    // A server should see ALL their consignments regardless of mode
    if (isServerRole && currentSession?.userId) {
      filtered = filtered.filter((c: Consignment) =>
        c.serverId === currentSession.userId || c.originalSeller === currentSession.userId
      );
    }

    if (filterStatus === 'all') return filtered;
    return filtered.filter((c: Consignment) => c.status === filterStatus);
  }, [stockManager.consignments, filterStatus, isServerRole, currentSession?.userId]);

  const sortedHistory = useMemo(() => {
    return [...historyConsignments].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [historyConsignments]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap bg-gray-50 p-2 rounded-lg w-fit">
        {[
          { value: 'all', label: 'Tout' },
          { value: 'claimed', label: 'Récupérés' },
          { value: 'expired', label: 'Expirés' },
          { value: 'forfeited', label: 'Confisqués' }
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setFilterStatus(filter.value as 'all' | 'claimed' | 'expired' | 'forfeited')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === filter.value
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-transparent text-gray-700 hover:bg-gray-200'
              }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {sortedHistory.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Archive className="w-16 h-16 mx-auto mb-3 opacity-50" />
          <p>Aucun historique</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedHistory.map(consignment => {
            // ✨ MODE SWITCHING FIX: Always deduce seller from the sale, not from consignment.originalSeller
            // This matches the logic in ReturnsPage: prioritize serverId (assigned server) over createdBy
            let originalSeller: UserType | undefined = undefined;
            const originalSale = sales.find(s => s.id === consignment.saleId);
            if (originalSale) {
              // Use serverId if present (simplified mode - assigned server), otherwise createdBy (full mode)
              const serverUserId = originalSale.serverId || originalSale.createdBy;
              originalSeller = users.find(u => u.id === serverUserId);
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
                      <p className="text-xs text-amber-600 mt-1">
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
    active: { label: 'Actif', color: 'bg-amber-100 text-amber-700' },
    claimed: { label: 'Récupéré', color: 'bg-green-100 text-green-700' },
    expired: { label: 'Expiré', color: 'bg-amber-100 text-amber-700' },
    forfeited: { label: 'Confisqué', color: 'bg-red-100 text-red-700' }
  };

  const config = configs[status];

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
};

interface ConsignmentCardProps {
  consignment: Consignment;
  onClaim: () => void;
  onForfeit: () => void;
  users: UserType[];
  sales: Sale[];
  isReadOnly?: boolean; // ✨ Mode read-only pour serveurs
}

const ConsignmentCard: React.FC<ConsignmentCardProps> = ({ consignment, onClaim, onForfeit, users, sales, isReadOnly = false }) => {
  const { formatPrice } = useCurrencyFormatter();

  // ✨ MODE SWITCHING FIX: Always deduce seller from the sale, not from consignment.originalSeller
  // This matches the logic in ReturnsPage: prioritize serverId (assigned server) over createdBy
  let originalSeller: UserType | undefined = undefined;
  const originalSale = sales.find(s => s.id === consignment.saleId);
  if (originalSale) {
    // Use serverId if present (simplified mode - assigned server), otherwise createdBy (full mode)
    const serverUserId = originalSale.serverId || originalSale.createdBy;
    originalSeller = users.find(u => u.id === serverUserId);
  }

  const expiresAt = new Date(consignment.expiresAt);
  const now = new Date();
  const hoursLeft = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
  const isExpired = hoursLeft < 0;
  const isExpiringSoon = hoursLeft > 0 && hoursLeft <= 24;

  return (
    <div className={`bg-white border-2 rounded-lg p-4 hover:shadow-lg transition-shadow ${
      isExpired ? 'border-red-300 bg-red-50' : 'border-amber-200'
    }`}>
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
          isExpired
            ? 'bg-red-100 text-red-700'
            : isExpiringSoon
              ? 'bg-amber-100 text-amber-700'
              : 'bg-amber-100 text-amber-700'
        }`}>
          {isExpired ? '⏰ Expirée' : hoursLeft > 48 ? `${Math.floor(hoursLeft / 24)}j` : `${hoursLeft}h`}
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
          <span className="font-medium text-amber-600">{formatPrice(consignment.totalAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Expire le:</span>
          <span className="text-xs">{expiresAt.toLocaleDateString('fr-FR')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Vendeur:</span>
          {originalSeller ? (
            <span className="text-xs font-medium text-purple-600">👤 {originalSeller.name}</span>
          ) : consignment.originalSeller || consignment.serverId ? (
            <span className="text-xs text-gray-600">👤 ID: {(consignment.originalSeller || consignment.serverId)?.slice(0, 8)}...</span>
          ) : (
            <span className="text-xs text-gray-600">N/A</span>
          )}
        </div>
      </div>

      {consignment.notes && (
        <div className="bg-gray-50 rounded p-2 mb-4">
          <p className="text-xs text-gray-600">{consignment.notes}</p>
        </div>
      )}

      {!isReadOnly && (
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
      )}
    </div>
  );
};
