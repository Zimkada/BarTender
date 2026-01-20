import { useState, useMemo, useEffect } from 'react';
import {
  RotateCcw,
  Package,
  X,
  Search,
  Filter,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  List,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMobileAnimationProps } from '../utils/disableAnimationsOnMobile';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useGuide } from '../context/GuideContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useAutoGuide } from '../hooks/useGuideTrigger';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from '../components/EnhancedButton';
import { User, Sale, SaleItem, Return, ReturnReason, ReturnReasonConfig } from '../types';
import { getBusinessDate, getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { useViewport } from '../hooks/useViewport';
import { Button } from '../components/ui/Button';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { Textarea } from '../components/ui/Textarea';
import { Label } from '../components/ui/Label';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SALES_HISTORY_FILTERS, TIME_RANGE_CONFIGS } from '../config/dateFilters';
import { useSalesFilters } from '../features/Sales/SalesHistory/hooks/useSalesFilters';

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

export default function ReturnsPage() {
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
  const users = Array.isArray(barMembers) ? barMembers.map(m => m.user).filter(Boolean) as User[] : [];
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const { isMobile } = useViewport();

  // ✨ Déterminer si l'utilisateur peut créer des retours
  // Seuls gérants/promoteurs peuvent créer et valider les retours
  const isReadOnly = currentSession?.role === 'serveur';

  // ✨ Navigation par onglets
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const showCreateReturn = activeTab === 'create';
  const { isComplete } = useOnboarding();
  const { hasCompletedGuide } = useGuide();

  // Guide is now triggered via PageHeader button instead of auto-trigger
  // useAutoGuide disabled in favor of manual trigger from header button

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [lastCreatedReturnId, setLastCreatedReturnId] = useState<string | null>(null);

  const closeHour = currentBar?.closingHour ?? 6;
  const { operatingMode } = useBarContext();

  // ✨ NEW: Use shared filtering hook for period + server filtering
  const {
    timeRange,
    setTimeRange,
    customRange,
    updateCustomRange,
    isCustom,
    searchTerm,
    setSearchTerm,
    filteredReturns: filteredReturnsByFilters
  } = useSalesFilters({
    sales,
    consignments,
    returns,
    currentSession,
    closeHour
  });

  // Effet pour gérer la redirection et scroll-to après création de retour
  useEffect(() => {
    if (lastCreatedReturnId && !showCreateReturn) {
      // Le formulaire est fermé et nous avons un ID, scroll vers le nouveau retour
      const returnElement = document.getElementById(`return-${lastCreatedReturnId}`);
      if (returnElement) {
        setTimeout(() => {
          returnElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
      // Reset l'ID après scroll
      setLastCreatedReturnId(null);
    }
  }, [lastCreatedReturnId, showCreateReturn]);

  const canReturnSale = (sale: Sale): { allowed: boolean; reason: string } => {
    // ✅ Utiliser la comparaison de strings YYYY-MM-DD (plus fiable)
    const saleBusinessDate = getBusinessDate(sale, closeHour);
    const currentBusinessDate = getCurrentBusinessDateString(closeHour);
    const now = new Date();

    if (saleBusinessDate !== currentBusinessDate) {
      return {
        allowed: false,
        reason: `Caisse du ${saleBusinessDate} déjà clôturée. Retours impossibles.`
      };
    }

    // Calculer l'heure de clôture exacte pour aujourd'hui
    const nextCloseTime = new Date(currentBusinessDate);
    nextCloseTime.setDate(nextCloseTime.getDate() + 1); // Le lendemain de la date commerciale
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
    const currentBusinessDate = getCurrentBusinessDateString(closeHour);
    const isServerRole = currentSession?.role === 'serveur';

    return sales.filter(sale => {
      if (sale.status !== 'validated') return false;

      const saleBusinessDate = getBusinessDate(sale, closeHour);
      if (saleBusinessDate !== currentBusinessDate) return false;

      // Source of truth: soldBy is the business attribution
      if (isServerRole && currentSession?.userId) {
        return sale.soldBy === currentSession.userId;
      }

      return true;
    });
  }, [sales, closeHour, currentSession]);

  const createReturn = async (
    saleId: string,
    productId: string,
    quantity: number,
    reason: ReturnReason,
    notes?: string,
    customRefund?: boolean,
    customRestock?: boolean
  ) => {
    const sale = sales.find(s => s.id === saleId);
    const item = sale?.items.find((i: SaleItem) => i.product_id === productId);

    if (!sale || !item || !currentSession) {
      showError('Données invalides');
      return;
    }

    // Extract product info with fallbacks
    const productName = item.product_name || 'Produit';
    const productVolume = item.product_volume || '';
    const productPrice = item.unit_price || 0;

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

    // ✨ MODE SWITCHING FIX: Déduire automatiquement le serveur de la vente
    // Un retour doit TOUJOURS être assigné au VENDEUR de la vente (sold_by)
    // Source of truth: soldBy is the business attribution
    const serverId = sale.soldBy;

    addReturn({
      saleId,
      productId,
      productName,
      productVolume,
      quantitySold: item.quantity,
      quantityReturned: quantity,
      reason,
      returnedBy: currentSession.userId,
      returnedAt: new Date(),
      refundAmount: finalRefund ? (productPrice * quantity) : 0,
      isRefunded: finalRefund,
      status: 'pending',
      autoRestock: finalRestock,
      manualRestockRequired: !finalRestock,
      notes,
      customRefund: reason === 'other' ? customRefund : undefined,
      customRestock: reason === 'other' ? customRestock : undefined,
      originalSeller: sale.soldBy,
      businessDate: sale.businessDate,
      serverId, // ✨ NUEVO: Passer le server_id résolu
      // ✨ MODE SWITCHING SUPPORT: Store current operating mode
      operatingModeAtCreation: operatingMode,
    });

    const refundMsg = finalRefund
      ? ` - Remboursement ${formatPrice(productPrice * quantity)}`
      : ' - Sans remboursement';
    showSuccess(`Retour créé pour ${quantity}x ${productName}${refundMsg}`);

    // Chercher le dernier retour créé (React Query rafraîchit automatiquement)
    // On utilise un timeout pour attendre que le nouveau retour soit dans la liste
    setTimeout(() => {
      const newestReturn = returns.find(r =>
        r.saleId === saleId &&
        r.productId === productId &&
        r.quantityReturned === quantity &&
        r.status === 'pending'
      );
      if (newestReturn) {
        setLastCreatedReturnId(newestReturn.id);
      }
    }, 100);

    // Rediriger vers l'onglet liste après succès (le timeout gère le scroll)
    setActiveTab('list');
    setSelectedSale(null);
  };

  // Validate status transition
  const canTransition = (currentStatus: Return['status'], newStatus: Return['status']): boolean => {
    const validTransitions: Record<Return['status'], Return['status'][]> = {
      'pending': ['approved', 'rejected'],
      'approved': ['restocked', 'rejected'],
      'rejected': [], // Terminal state
      'restocked': [], // Terminal state
    };

    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  };

  const approveReturn = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem) {
      showError('Retour introuvable');
      return;
    }

    // Validate transition
    if (!canTransition(returnItem.status, 'approved')) {
      showError(`Impossible d'approuver un retour avec le statut "${returnItem.status}"`);
      return;
    }

    let newStatus: Return['status'] = 'approved';

    if (returnItem.autoRestock) {
      increasePhysicalStock(returnItem.productId, returnItem.quantityReturned, 'return_auto_restock');
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
    if (!returnItem) {
      showError('Retour introuvable');
      return;
    }

    // Validate transition
    if (!canTransition(returnItem.status, 'restocked')) {
      showError(`Impossible de remettre en stock un retour avec le statut "${returnItem.status}"`);
      return;
    }

    increasePhysicalStock(returnItem.productId, returnItem.quantityReturned, 'return_manual_restock');

    updateReturn(returnId, {
      status: 'restocked',
      restockedAt: new Date()
    });

    showSuccess(`${returnItem.quantityReturned}x ${returnItem.productName} remis en stock`);
  };

  const rejectReturn = (returnId: string) => {
    const returnItem = returns.find(r => r.id === returnId);
    if (!returnItem) {
      showError('Retour introuvable');
      return;
    }

    // Validate transition
    if (!canTransition(returnItem.status, 'rejected')) {
      showError(`Impossible de rejeter un retour avec le statut "${returnItem.status}"`);
      return;
    }

    updateReturn(returnId, { status: 'rejected' });
    showSuccess('Retour rejeté');
  };

  // ✨ Apply additional status filter on top of hook-filtered returns
  const filteredReturns = filteredReturnsByFilters.filter(returnItem => {
    const matchesStatus = filterStatus === 'all' || returnItem.status === filterStatus;
    return matchesStatus;
  });

  const tabsConfig = [
    { id: 'list', label: isMobile ? 'Liste' : 'Liste des retours', icon: List },
    ...(!isReadOnly ? [{ id: 'create', label: isMobile ? 'Créer' : 'Nouveau retour', icon: RotateCcw }] : [])
  ] as { id: string; label: string; icon: any }[];

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <TabbedPageHeader
        title={isMobile ? 'Retours' : 'Système de Retours'}
        subtitle="Gérer les retours clients et remboursements"
        icon={<RotateCcw size={24} className="text-amber-600" />}
        hideSubtitleOnMobile
        tabs={tabsConfig}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'list' | 'create')}
        guideId={currentSession?.role === 'serveur' ? 'serveur-returns' : 'manage-returns'}
        actions={
          showCreateReturn && (
            <Button
              variant="secondary"
              onClick={() => {
                setActiveTab('list');
                setSelectedSale(null);
              }}
            >
              Annuler
            </Button>
          )
        }
      />

      {/* Filters Area (Only visible in list mode) */}
      {!showCreateReturn && (
        <div className="space-y-4 pt-4 border-t border-gray-100" data-guide="returns-search">
          {/* Period Filters */}
          <div className="flex bg-gray-100 rounded-lg p-1 flex-wrap gap-1">
            {SALES_HISTORY_FILTERS.map(filter => (
              <Button
                key={filter}
                onClick={() => setTimeRange(filter)}
                variant={timeRange === filter ? 'default' : 'ghost'}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 min-w-[80px]"
              >
                {TIME_RANGE_CONFIGS[filter].label}
              </Button>
            ))}
          </div>

          {/* Custom Date Range */}
          {isCustom && (
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
              <Input
                type="date"
                value={customRange.start}
                onChange={(e) => updateCustomRange('start', e.target.value)}
                className="flex-1 text-sm"
              />
              <span className="text-gray-600">-</span>
              <Input
                type="date"
                value={customRange.end}
                onChange={(e) => updateCustomRange('end', e.target.value)}
                className="flex-1 text-sm"
              />
            </div>
          )}

          {/* Search and Status Filter */}
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search size={16} />}
              className="flex-1 min-w-0 h-10"
            />
            <div className="flex items-center gap-2 shrink-0">
              {!isMobile && <Filter size={18} className="text-gray-600" />}
              <Select
                options={
                  [
                    { value: 'all', label: isMobile ? 'Tous' : 'Tous les statuts' },
                    { value: 'pending', label: isMobile ? 'Attente' : 'En attente' },
                    { value: 'approved', label: 'Validés' },
                    { value: 'rejected', label: 'Rejetés' }
                  ]
                }
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                className="w-[110px] sm:w-[150px] h-10"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-6 min-h-[60vh]">
        {/* Disable AnimatePresence on mobile to reduce TBT (expensive animation calculations) */}
        {isMobile ? (
          <>
            {!showCreateReturn ? (
              <div className="space-y-4">
                {filteredReturns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="bg-gray-50 p-6 rounded-full mb-4">
                      <RotateCcw size={48} className="text-gray-300" />
                    </div>
                    <h2 className="text-lg font-medium text-gray-600 mb-2">Aucun retour trouvé</h2>
                    <p className="text-gray-500 max-w-md">
                      Il n'y a pas de retours correspondant à vos critères. Cliquez sur "Nouveau retour" pour en créer un.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredReturns.map(returnItem => {
                      const serverUser = returnItem.server_id
                        ? users.find(u => u.id === returnItem.server_id)
                        : null;

                      return (
                        <div
                          key={returnItem.id}
                          id={`return-${returnItem.id}`}
                          className="bg-white rounded-xl p-4 border border-gray-200 hover:border-amber-300 transition-colors shadow-sm"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                            <div className="flex items-start gap-4">
                              <div className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${returnItem.status === 'restocked' ? 'bg-green-500' :
                                returnItem.status === 'approved' ? 'bg-blue-500' :
                                  returnItem.status === 'rejected' ? 'bg-red-500' :
                                    'bg-yellow-500'
                                }`} />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-gray-800 text-lg">
                                    {returnItem.productName}
                                  </h4>
                                  <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {returnItem.productVolume}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                                  <span>ID: #{returnItem.id.slice(-6)}</span>
                                  <span>•</span>
                                  <span>{new Date(returnItem.returnedAt).toLocaleDateString('fr-FR')} à {new Date(returnItem.returnedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  {serverUser && (
                                    <>
                                      <span>•</span>
                                      <span className="text-purple-600 font-medium">
                                        Serveur: {serverUser.name}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-6 pl-7 md:pl-0">
                              <div className="text-right">
                                <span className="block text-sm text-gray-500">Montant remboursé</span>
                                <span className="block font-bold text-gray-800 text-lg">{formatPrice(returnItem.refundAmount)}</span>
                              </div>
                              <div className="text-right border-l border-gray-100 pl-6">
                                <span className="block text-sm text-gray-500">Quantité</span>
                                <span className="block font-bold text-gray-800 text-lg">{returnItem.quantityReturned} / {returnItem.quantitySold}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-gray-50 pl-7 md:pl-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${returnReasons[returnItem.reason].color === 'red' ? 'bg-red-50 text-red-700 border-red-100' :
                                returnReasons[returnItem.reason].color === 'orange' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  returnReasons[returnItem.reason].color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                    returnReasons[returnItem.reason].color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                      'bg-gray-50 text-gray-700 border-gray-100'
                                }`}>
                                {returnReasons[returnItem.reason].icon} {returnReasons[returnItem.reason].label}
                              </span>

                              {returnItem.autoRestock && (
                                <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full font-medium">
                                  📦 Stock auto
                                </span>
                              )}

                              {returnItem.isRefunded && (
                                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                                  💰 Remboursé
                                </span>
                              )}

                              {!returnItem.isRefunded && returnItem.refundAmount === 0 && (
                                <span className="text-xs bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-full font-medium">
                                  Sans remboursement
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto" data-guide="returns-status">
                              {!isReadOnly && returnItem.status === 'pending' && (
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

                              {!isReadOnly && returnItem.status === 'approved' && returnItem.manualRestockRequired && (
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
                                <span className="text-sm text-green-600 font-medium flex items-center gap-1 bg-green-50 px-3 py-1 rounded-lg">
                                  <Package size={14} />
                                  En stock ({returnItem.restockedAt && new Date(returnItem.restockedAt).toLocaleDateString('fr-FR')})
                                </span>
                              )}
                              {returnItem.status === 'rejected' && (
                                <span className="text-sm text-red-600 font-medium flex items-center gap-1 bg-red-50 px-3 py-1 rounded-lg">
                                  <X size={14} />
                                  Rejeté
                                </span>
                              )}
                            </div>
                          </div>
                          {returnItem.notes && (
                            <div className="mt-3 ml-7 md:ml-0 bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <p className="text-sm text-gray-600 italic">Note: "{returnItem.notes}"</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <CreateReturnForm
                  returnableSales={getReturnableSales}
                  returnReasons={returnReasons}
                  onCreateReturn={createReturn}
                  onCancel={() => {
                    setActiveTab('list');
                    setSelectedSale(null);
                  }}
                  selectedSale={selectedSale}
                  onSelectSale={setSelectedSale}
                  canReturnSale={canReturnSale}
                  closeHour={closeHour}
                  consignments={consignments}
                />
              </div>
            )}
          </>
        ) : (
          /* Desktop: Keep AnimatePresence for smooth animations */
          <AnimatePresence mode="wait">
            {!showCreateReturn ? (
              <motion.div
                key="list"
                {...getMobileAnimationProps()}
                className="space-y-4"
              >
                {filteredReturns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="bg-gray-50 p-6 rounded-full mb-4">
                      <RotateCcw size={48} className="text-gray-300" />
                    </div>
                    <h2 className="text-lg font-medium text-gray-600 mb-2">Aucun retour trouvé</h2>
                    <p className="text-gray-500 max-w-md">
                      Il n'y a pas de retours correspondant à vos critères. Cliquez sur "Nouveau retour" pour en créer un.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredReturns.map(returnItem => {
                      const serverUser = returnItem.server_id
                        ? users.find(u => u.id === returnItem.server_id)
                        : null;

                      return (
                        <motion.div
                          key={returnItem.id}
                          id={`return-${returnItem.id}`}
                          layoutId={returnItem.id}
                          className="bg-white rounded-xl p-4 border border-gray-200 hover:border-amber-300 transition-colors shadow-sm"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                            <div className="flex items-start gap-4">
                              <div className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${returnItem.status === 'restocked' ? 'bg-green-500' :
                                returnItem.status === 'approved' ? 'bg-blue-500' :
                                  returnItem.status === 'rejected' ? 'bg-red-500' :
                                    'bg-yellow-500'
                                }`} />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-gray-800 text-lg">
                                    {returnItem.productName}
                                  </h4>
                                  <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {returnItem.productVolume}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                                  <span>ID: #{returnItem.id.slice(-6)}</span>
                                  <span>•</span>
                                  <span>{new Date(returnItem.returnedAt).toLocaleDateString('fr-FR')} à {new Date(returnItem.returnedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  {serverUser && (
                                    <>
                                      <span>•</span>
                                      <span className="text-purple-600 font-medium">
                                        Serveur: {serverUser.name}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-6 pl-7 md:pl-0">
                              <div className="text-right">
                                <span className="block text-sm text-gray-500">Montant remboursé</span>
                                <span className="block font-bold text-gray-800 text-lg">{formatPrice(returnItem.refundAmount)}</span>
                              </div>
                              <div className="text-right border-l border-gray-100 pl-6">
                                <span className="block text-sm text-gray-500">Quantité</span>
                                <span className="block font-bold text-gray-800 text-lg">{returnItem.quantityReturned} / {returnItem.quantitySold}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-gray-50 pl-7 md:pl-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${returnReasons[returnItem.reason].color === 'red' ? 'bg-red-50 text-red-700 border-red-100' :
                                returnReasons[returnItem.reason].color === 'orange' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  returnReasons[returnItem.reason].color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                    returnReasons[returnItem.reason].color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                      'bg-gray-50 text-gray-700 border-gray-100'
                                }`}>
                                {returnReasons[returnItem.reason].icon} {returnReasons[returnItem.reason].label}
                              </span>

                              {returnItem.autoRestock && (
                                <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full font-medium">
                                  📦 Stock auto
                                </span>
                              )}

                              {returnItem.isRefunded && (
                                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                                  💰 Remboursé
                                </span>
                              )}

                              {!returnItem.isRefunded && returnItem.refundAmount === 0 && (
                                <span className="text-xs bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-full font-medium">
                                  Sans remboursement
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto" data-guide="returns-status">
                              {!isReadOnly && returnItem.status === 'pending' && (
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

                              {!isReadOnly && returnItem.status === 'approved' && returnItem.manualRestockRequired && (
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
                                <span className="text-sm text-green-600 font-medium flex items-center gap-1 bg-green-50 px-3 py-1 rounded-lg">
                                  <Package size={14} />
                                  En stock ({returnItem.restockedAt && new Date(returnItem.restockedAt).toLocaleDateString('fr-FR')})
                                </span>
                              )}
                              {returnItem.status === 'rejected' && (
                                <span className="text-sm text-red-600 font-medium flex items-center gap-1 bg-red-50 px-3 py-1 rounded-lg">
                                  <X size={14} />
                                  Rejeté
                                </span>
                              )}
                            </div>
                          </div>
                          {returnItem.notes && (
                            <div className="mt-3 ml-7 md:ml-0 bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <p className="text-sm text-gray-600 italic">Note: "{returnItem.notes}"</p>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="create"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <CreateReturnForm
                  returnableSales={getReturnableSales}
                  returnReasons={returnReasons}
                  onCreateReturn={createReturn}
                  onCancel={() => {
                    setActiveTab('list');
                    setSelectedSale(null);
                  }}
                  selectedSale={selectedSale}
                  onSelectSale={setSelectedSale}
                  canReturnSale={canReturnSale}
                  closeHour={closeHour}
                  consignments={consignments}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
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
              <h2 className="text-lg font-bold text-gray-800">Retour - Autre raison</h2>
            </div>

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
                <Label htmlFor="customNotes">Notes <span className="text-red-500">*</span></Label>
                <Textarea
                  id="customNotes"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  rows={4}
                  placeholder="Expliquez la raison du retour (obligatoire)..."
                  required
                />
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
  onCreateReturn: (saleId: string, productId: string, quantity: number, reason: ReturnReason, notes?: string, customRefund?: boolean, customRestock?: boolean) => Promise<void> | void;
  onCancel: () => void;
  selectedSale: Sale | null;
  onSelectSale: (sale: Sale) => void;
  canReturnSale: (sale: Sale) => { allowed: boolean; reason: string };
  closeHour: number;
  consignments: any[];
}) {
  const { getReturnsBySale } = useAppContext();
  const { barMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { showError } = useFeedback();

  const users: User[] = barMembers.map(m => m.user).filter((u): u is User => u !== undefined);
  const [selectedProduct, setSelectedProduct] = useState<SaleItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [notes, setNotes] = useState('');
  const [showOtherReasonDialog, setShowOtherReasonDialog] = useState(false);
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

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
    ? (() => {
      const productId = selectedProduct.product_id;
      if (!productId) return 0;
      return selectedProduct.quantity - getAlreadyReturned(productId) - getAlreadyConsigned(productId);
    })()
    : 0;

  const filteredSales = useMemo(() => {
    let filtered = returnableSales;

    if (filterSeller !== 'all') {
      // ✨ MODE SWITCHING FIX: Filter using mode-agnostic server detection
      // Source of truth: soldBy is the business attribution
      filtered = filtered.filter(sale => {
        const serverUserId = sale.soldBy;
        return serverUserId === filterSeller;
      });
    }

    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(sale =>
        sale.items.some(item => item.product_name.toLowerCase().includes(lowerTerm))
      );
    }

    // ✨ Sort by time: most recent first (validatedAt or createdAt)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.validatedAt || a.createdAt);
      const dateB = new Date(b.validatedAt || b.createdAt);
      return dateB.getTime() - dateA.getTime(); // Descending order
    });
  }, [returnableSales, filterSeller, searchTerm]);

  const sellersWithSales = useMemo(() => {
    if (!Array.isArray(returnableSales) || !Array.isArray(users)) return [];
    // ✨ MODE SWITCHING FIX: Get servers using mode-agnostic detection
    // Source of truth: soldBy is the business attribution
    const serverIds = new Set(
      returnableSales
        .map(sale => sale.soldBy)
        .filter(Boolean)
    );
    return users.filter(user => serverIds.has(user.id));
  }, [returnableSales, users]);

  const handleSubmit = async () => {
    if (!selectedSale || !selectedProduct) return;

    const productId = selectedProduct.product_id;
    if (!productId) {
      showError('Produit invalide');
      return;
    }

    if (reason === 'other') {
      setShowOtherReasonDialog(true);
      return;
    }

    await onCreateReturn(selectedSale.id, productId, quantity, reason, notes || undefined);
  };

  const handleOtherReasonConfirm = async (customRefund: boolean, customRestock: boolean, customNotes: string) => {
    if (!selectedSale || !selectedProduct) return;

    const productId = selectedProduct.product_id;
    if (!productId) {
      showError('Produit invalide');
      return;
    }

    setShowOtherReasonDialog(false);
    await onCreateReturn(
      selectedSale.id,
      productId,
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
        <h2 className="text-lg font-semibold text-gray-800">Créer un nouveau retour</h2>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setIsInfoExpanded(!isInfoExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600" />
                <p className="font-semibold text-blue-800">Processus de retour</p>
              </div>
              {isInfoExpanded ? (
                <ChevronUp className="w-5 h-5 text-blue-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-blue-600" />
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
                  <div className="px-4 pb-3 border-t border-blue-200">
                    <ol className="list-decimal list-inside space-y-1 text-blue-700 mt-2 text-sm">
                      <li>Sélectionnez la vente de la journée commerciale actuelle</li>
                      <li>Choisissez le produit à retourner et la quantité</li>
                      <li>Indiquez le motif du retour (défectueux, erreur, etc.)</li>
                      <li>Le stock sera automatiquement réapprovisionné selon le motif</li>
                    </ol>
                    <div className="mt-3 pt-2 border-t border-blue-200">
                      <p className="text-blue-700 text-xs font-medium flex items-center gap-1">
                        <AlertTriangle size={14} />
                        Retours autorisés uniquement AVANT clôture caisse ({closeHour}h)
                      </p>
                      <p className="text-blue-600 text-xs mt-1">
                        Votre bar ferme à {closeHour}h. Les retours ne peuvent être créés qu'avant cette heure.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Ventes de la journée commerciale actuelle
              </label>
              {sellersWithSales.length > 1 && (
                <Select
                  options={[
                    { value: 'all', label: 'Tous les vendeurs' },
                    ...sellersWithSales.map(seller => ({ value: seller.id, label: seller.name }))
                  ]}
                  value={filterSeller}
                  onChange={(e) => setFilterSeller(e.target.value)}
                  className="text-sm"
                />
              )}
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600" size={16} />
              <input
                type="text"
                placeholder="Rechercher un produit (ex: Guinness)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-amber-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {filteredSales.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500">
                  {returnableSales.length === 0
                    ? 'Aucune vente dans la journée commerciale actuelle'
                    : 'Aucune vente trouvée'
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {filteredSales.map(sale => {
                  const returnCheck = canReturnSale(sale);
                  // Source of truth: soldBy is the business attribution
                  const serverUserId = sale.soldBy;
                  const serverUser = serverUserId ? users.find(u => u.id === serverUserId) : undefined;
                  const productPreview = sale.items.slice(0, 2).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
                  const moreCount = sale.items.length - 2;

                  return (
                    <motion.button
                      key={sale.id}
                      onClick={() => returnCheck.allowed && onSelectSale(sale)}
                      whileHover={returnCheck.allowed ? { scale: 1.01 } : {}}
                      disabled={!returnCheck.allowed}
                      className={`p-3 text-left rounded-lg border transition-colors ${selectedSale?.id === sale.id
                        ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                        : returnCheck.allowed
                          ? 'border-gray-200 bg-white hover:border-gray-300'
                          : 'border-red-200 bg-red-50 opacity-50 cursor-not-allowed'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800">#{sale.id.slice(-4)}</span>
                        <span className="text-xs text-gray-500">{new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-xs text-gray-600 truncate mb-1" title={productPreview}>
                        {productPreview}{moreCount > 0 ? ` +${moreCount}` : ''}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        {serverUser ? (
                          <span className="text-xs text-purple-600">👤 {serverUser.name}</span>
                        ) : <span></span>}
                        {returnCheck.allowed ? (
                          <span className="text-xs font-bold text-gray-700">{formatPrice(sale.total)}</span>
                        ) : (
                          <span className="text-xs text-red-600 font-medium">{returnCheck.reason}</span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedSale && (
            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Produit à retourner (Vente #{selectedSale.id.slice(-4)})
              </label>
              <div className="space-y-2 mb-4">
                {selectedSale.items.map((item: SaleItem, index: number) => {
                  const productId = item.product_id;
                  const productName = item.product_name;
                  const productVolume = item.product_volume || '';
                  const productPrice = item.unit_price;

                  const alreadyReturned = getAlreadyReturned(productId);
                  const alreadyConsigned = getAlreadyConsigned(productId);
                  const available = item.quantity - alreadyReturned - alreadyConsigned;
                  const isFullyUnavailable = available <= 0;

                  return (
                    <motion.button
                      key={index}
                      onClick={() => !isFullyUnavailable && setSelectedProduct(item)}
                      disabled={isFullyUnavailable}
                      className={`w-full p-3 text-left rounded-lg border transition-colors ${isFullyUnavailable
                        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                        : selectedProduct === item
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-800">
                            {productName} ({productVolume})
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                            <span className="text-gray-600">Vendu: {item.quantity}</span>
                            {alreadyReturned > 0 && <span className="text-amber-600">• Retourné: {alreadyReturned}</span>}
                            {alreadyConsigned > 0 && <span className="text-purple-600">• Consigné: {alreadyConsigned}</span>}
                            <span className={`font-bold ${isFullyUnavailable ? 'text-red-500' : 'text-green-600'}`}>• Dispo: {available}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-blue-600 font-semibold text-sm">
                            {productPrice} FCFA
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {selectedProduct && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label htmlFor="returnQuantity">Quantité</Label>
                      <Input
                        id="returnQuantity"
                        type="number"
                        required
                        min="1"
                        max={availableQty}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                      <p className="text-xs text-gray-500 mt-1">Max: {availableQty}</p>
                    </div>
                    <div data-guide="returns-reasons">
                      <Label htmlFor="returnReason">Raison</Label>
                      <Select
                        id="returnReason"
                        options={Object.entries(returnReasons).map(([key, value]) => ({ value: key, label: `${value.icon} ${value.label}` }))}
                        value={reason}
                        onChange={(e) => setReason(e.target.value as ReturnReason)}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <Label htmlFor="returnNotes">Notes (Optionnel)</Label>
                    <Textarea
                      id="returnNotes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Détails..."
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <EnhancedButton onClick={onCancel} variant="secondary" className="flex-1">Annuler</EnhancedButton>
                    <EnhancedButton onClick={handleSubmit} variant="primary" className="flex-1">Confirmer le retour</EnhancedButton>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
