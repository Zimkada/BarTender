import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Filter,
  List,
  BarChart3,
  DollarSign,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getMobileAnimationProps } from "../utils/disableAnimationsOnMobile";
import { useAppContext } from "../context/AppContext";
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { useUnifiedReturns } from '../hooks/pivots/useUnifiedReturns';
import { useBarContext } from "../context/BarContext";
import { useAuth } from "../context/AuthContext";
import { useCurrencyFormatter } from "../hooks/useBeninCurrency";
import { useFeedback } from "../hooks/useFeedback";
import {
  User,
  Sale,
  SaleItem,
  Return,
  ReturnReason,
} from "../types";
import {
  getBusinessDate,
  getCurrentBusinessDateString,
  dateToYYYYMMDD,
} from "../utils/businessDateHelpers";
import { isConfirmedReturn } from "../utils/saleHelpers";
import { useViewport } from "../hooks/useViewport";
import { TabbedPageHeader } from "../components/common/PageHeader/patterns/TabbedPageHeader";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { PeriodFilter } from "../components/common/filters/PeriodFilter";
import {
  SALES_HISTORY_FILTERS,
} from "../config/dateFilters";
import { useSalesFilters } from "../features/Sales/SalesHistory/hooks/useSalesFilters";
import { useDateRangeFilter } from "../hooks/useDateRangeFilter";
import { returnReasons } from "../config/returnReasons";
import { ReturnCard } from "../components/returns/ReturnCard";
import { CreateReturnForm } from "../components/returns/CreateReturnForm";
import { ReturnsStats } from "../components/returns/ReturnsStats";
import { AnimatedCounter } from "../components/AnimatedCounter";

export default function ReturnsPage() {
  const { addReturn, updateReturn } = useAppContext();
  const { currentBar, barMembers, operatingMode } = useBarContext();
  const { increasePhysicalStock, consignments } = useUnifiedStock(currentBar?.id);
  const { sales } = useUnifiedSales(currentBar?.id);
  const { returns, getReturnsBySale } = useUnifiedReturns(currentBar?.id, currentBar?.closingHour);
  const users = Array.isArray(barMembers)
    ? (barMembers.map((m) => m.user).filter(Boolean) as User[])
    : [];
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const { isMobile } = useViewport();

  // ✨ Déterminer si l'utilisateur peut créer des retours
  // Les serveurs peuvent maintenant créer des demandes en mode complet, 
  // mais seuls gérants/promoteurs peuvent valider.
  // En mode simplifié, les serveurs ne peuvent ni vendre ni retourner.
  const isServer = currentSession?.role === "serveur";
  const { isSimplifiedMode } = useBarContext();
  const canCreate = !isServer || !isSimplifiedMode;
  const isReadOnly = isServer;

  // ✨ Navigation par onglets
  const [activeTab, setActiveTab] = useState<"list" | "create" | "stats">("list");
  const showCreateReturn = activeTab === "create";
  const showStats = activeTab === "stats";

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [filterStatus, setFilterStatus] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [lastCreatedReturnId, setLastCreatedReturnId] = useState<string | null>(
    null,
  );

  const closeHour = currentBar?.closingHour ?? 6;

  // ✨ NEW: Use shared filtering hook for period
  const {
    timeRange,
    setTimeRange,
    customRange,
    updateCustomRange,
    startDate,
    endDate,
  } = useDateRangeFilter({
    defaultRange: 'today'
  });

  // ✨ NEW: Filter Returns using centralized hook
  const {
    searchTerm,
    setSearchTerm,
    filteredReturns: filteredReturnsByFilters,
  } = useSalesFilters({
    sales,
    returns: returns as any[],
    currentSession,
    closeHour,
    externalStartDate: startDate,
    externalEndDate: endDate,
  });

  const todayRefundedAmount = useMemo(() => {
    const today = getCurrentBusinessDateString(closeHour);
    return returns
      .filter(r => getBusinessDate(r, closeHour) === today && isConfirmedReturn(r))
      .reduce((sum, r) => sum + r.refundAmount, 0);
  }, [returns, closeHour]);

  // Effet pour gérer la redirection et scroll-to après création de retour
  useEffect(() => {
    if (lastCreatedReturnId && !showCreateReturn) {
      // Le formulaire est fermé et nous avons un ID, scroll vers le nouveau retour
      const returnElement = document.getElementById(
        `return-${lastCreatedReturnId}`,
      );
      if (returnElement) {
        setTimeout(() => {
          returnElement.scrollIntoView({ behavior: "smooth", block: "center" });
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
        reason: `Caisse du ${saleBusinessDate} déjà clôturée. Retours impossibles.`,
      };
    }

    // Calculer l'heure de clôture exacte pour aujourd'hui
    const nextCloseTime = new Date(currentBusinessDate);
    nextCloseTime.setDate(nextCloseTime.getDate() + 1); // Le lendemain de la date commerciale
    nextCloseTime.setHours(closeHour, 0, 0, 0);

    if (now >= nextCloseTime) {
      return {
        allowed: false,
        reason: `Clôture caisse à ${closeHour}h déjà effectuée. Retours impossibles.`,
      };
    }

    return {
      allowed: true,
      reason: `Retour autorisé (avant clôture ${closeHour}h)`,
    };
  };

  const getReturnableSales = useMemo((): Sale[] => {
    const currentBusinessDate = getCurrentBusinessDateString(closeHour);
    const isServerRole = currentSession?.role === "serveur";

    return sales.filter((sale) => {
      if (sale.status !== "validated") return false;

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
    customRestock?: boolean,
  ) => {
    const sale = sales.find((s) => s.id === saleId);
    const item = sale?.items.find((i: SaleItem) => i.product_id === productId);

    if (!sale || !item || !currentSession) {
      showError("Données invalides");
      return;
    }

    // Extract product info with fallbacks
    const productName = item.product_name || "Produit";
    const productVolume = item.product_volume || "";
    const productPrice = item.unit_price || 0;

    const returnCheck = canReturnSale(sale);
    if (!returnCheck.allowed) {
      showError(returnCheck.reason);
      return;
    }

    const existingReturns = getReturnsBySale(saleId);
    const alreadyReturnedQty = existingReturns
      .filter((r) => r.productId === productId && r.status !== "rejected")
      .reduce((sum, r) => sum + r.quantityReturned, 0);

    // ✅ Tenir compte des consignations actives
    const alreadyConsignedQty = consignments
      .filter(
        (c) =>
          c.saleId === saleId &&
          c.productId === productId &&
          c.status === "active",
      )
      .reduce((sum, c) => sum + c.quantity, 0);

    const remainingQty =
      item.quantity - alreadyReturnedQty - alreadyConsignedQty;

    if (quantity > remainingQty) {
      showError(
        `Impossible : ${alreadyReturnedQty} déjà retourné(s), ${alreadyConsignedQty} consigné(s). Reste ${remainingQty} disponible(s).`,
      );
      return;
    }

    if (remainingQty <= 0) {
      showError(
        `Ce produit n'est plus disponible pour retour (${alreadyReturnedQty} retourné(s), ${alreadyConsignedQty} consigné(s))`,
      );
      return;
    }

    const reasonConfig = returnReasons[reason];
    const finalRefund =
      reason === "other" ? (customRefund ?? false) : reasonConfig.autoRefund;
    const finalRestock =
      reason === "other" ? (customRestock ?? false) : reasonConfig.autoRestock;

    // ✨ MODE SWITCHING FIX: Déduire automatiquement le serveur de la vente
    // Un retour doit TOUJOURS être assigné au VENDEUR de la vente (sold_by)
    // Source of truth: soldBy is the business attribution
    const serverId = sale.soldBy;

    console.log('[ReturnsPage] calling addReturn with data:', {
      saleId,
      productId,
      productName,
      productVolume,
      quantitySold: item.quantity,
      quantityReturned: quantity,
      reason,
      returnedBy: currentSession.userId,
      refundAmount: finalRefund ? productPrice * quantity : 0,
      isRefunded: finalRefund,
      status: "pending",
      autoRestock: finalRestock,
      manual_restock_required: !finalRestock,
      notes,
      customRefund: reason === "other" ? customRefund : undefined,
      customRestock: reason === "other" ? customRestock : undefined,
      originalSeller: sale.soldBy,
      // ✅ FIX: Always normalize to YYYY-MM-DD string
      businessDate: sale.businessDate
        ? (typeof sale.businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sale.businessDate)
          ? sale.businessDate  // Already YYYY-MM-DD
          : dateToYYYYMMDD(typeof sale.businessDate === 'string' ? new Date(sale.businessDate) : sale.businessDate))
        : getCurrentBusinessDateString(closeHour),
      serverId,
      operatingModeAtCreation: operatingMode,
    });

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
      refundAmount: finalRefund ? productPrice * quantity : 0,
      isRefunded: finalRefund,
      status: "pending",
      autoRestock: finalRestock,
      manualRestockRequired: !finalRestock,
      notes,
      customRefund: reason === "other" ? customRefund : undefined,
      customRestock: reason === "other" ? customRestock : undefined,
      originalSeller: sale.soldBy,
      // ✅ FIX: Always normalize to YYYY-MM-DD string
      businessDate: sale.businessDate
        ? (typeof sale.businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sale.businessDate)
          ? sale.businessDate  // Already YYYY-MM-DD
          : dateToYYYYMMDD(typeof sale.businessDate === 'string' ? new Date(sale.businessDate) : sale.businessDate))
        : getCurrentBusinessDateString(closeHour),
      serverId, // ✨ NUEVO: Passer le server_id résolu
      // ✨ MODE SWITCHING SUPPORT: Store current operating mode
      operatingModeAtCreation: operatingMode,
    });

    const refundMsg = finalRefund
      ? ` - Remboursement ${formatPrice(productPrice * quantity)}`
      : " - Sans remboursement";
    showSuccess(`Retour créé pour ${quantity}x ${productName}${refundMsg}`);

    // Chercher le dernier retour créé (React Query rafraîchit automatiquement)
    // On utilise un timeout pour attendre que le nouveau retour soit dans la liste
    setTimeout(() => {
      const newestReturn = returns.find(
        (r) =>
          r.saleId === saleId &&
          r.productId === productId &&
          r.quantityReturned === quantity &&
          r.status === "pending" || r.status === "approved" || r.status === "restocked",
      );
      if (newestReturn) {
        setLastCreatedReturnId(newestReturn.id);
      }
    }, 100);

    // Rediriger vers l'onglet liste après succès (le timeout gère le scroll)
    setActiveTab("list");
    setSelectedSale(null);
  };

  // Validate status transition
  const canTransition = (
    currentStatus: Return["status"],
    newStatus: Return["status"],
  ): boolean => {
    const validTransitions: Record<Return["status"], Return["status"][]> = {
      pending: ["approved", "rejected"],
      validated: ["restocked", "rejected"], // Legacy support
      approved: ["restocked", "rejected"],
      rejected: [], // Terminal state
      restocked: [], // Terminal state
    };

    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  };

  const approveReturn = (returnId: string) => {
    const returnItem = returns.find((r) => r.id === returnId);
    if (!returnItem) {
      showError("Retour introuvable");
      return;
    }

    // Validate transition
    if (!canTransition(returnItem.status, "approved")) {
      showError(
        `Impossible d'approuver un retour avec le statut "${returnItem.status}"`,
      );
      return;
    }

    let newStatus: Return["status"] = "approved";

    if (returnItem.autoRestock) {
      increasePhysicalStock(
        returnItem.productId,
        returnItem.quantityReturned,
        "return_auto_restock",
      );
      newStatus = "restocked";
      const refundInfo = returnItem.isRefunded
        ? ` + Remboursement ${formatPrice(returnItem.refundAmount)}`
        : "";
      showSuccess(
        `Retour approuvé - ${returnItem.quantityReturned}x ${returnItem.productName} remis en stock${refundInfo}`,
      );
    } else {
      const refundInfo = returnItem.isRefunded
        ? ` - Remboursement ${formatPrice(returnItem.refundAmount)}`
        : "";
      showSuccess(
        `Retour approuvé${refundInfo} - Choix de remise en stock disponible`,
      );
    }

    updateReturn(returnId, {
      status: newStatus,
      validatedBy: currentSession?.userId, // ✨ Traçabilité
      restockedAt: returnItem.autoRestock ? new Date() : undefined,
    });
  };

  const manualRestock = (returnId: string) => {
    const returnItem = returns.find((r) => r.id === returnId);
    if (!returnItem) {
      showError("Retour introuvable");
      return;
    }

    // Validate transition
    if (!canTransition(returnItem.status, "restocked")) {
      showError(
        `Impossible de remettre en stock un retour avec le statut "${returnItem.status}"`,
      );
      return;
    }

    increasePhysicalStock(
      returnItem.productId,
      returnItem.quantityReturned,
      "return_manual_restock",
    );

    updateReturn(returnId, {
      status: "restocked",
      restockedAt: new Date(),
    });

    showSuccess(
      `${returnItem.quantityReturned}x ${returnItem.productName} remis en stock`,
    );
  };

  const rejectReturn = (returnId: string) => {
    const returnItem = returns.find((r) => r.id === returnId);
    if (!returnItem) {
      showError("Retour introuvable");
      return;
    }

    // Validate transition
    if (!canTransition(returnItem.status, "rejected")) {
      showError(
        `Impossible de rejeter un retour avec le statut "${returnItem.status}"`,
      );
      return;
    }

    updateReturn(returnId, {
      status: "rejected",
      rejectedBy: currentSession?.userId // ✨ Traçabilité
    });
    showSuccess("Retour rejeté");
  };

  const filteredReturns = filteredReturnsByFilters.filter((returnItem) => {
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "approved"
        ? returnItem.status === "approved" || returnItem.status === "validated" || returnItem.status === "restocked"
        : returnItem.status === filterStatus);
    return matchesStatus;
  });

  const tabsConfig = [
    ...(canCreate
      ? [
        {
          id: "create",
          label: isMobile ? "Créer" : "Nouveau retour",
          icon: RotateCcw,
        },
      ]
      : []),
    { id: "list", label: isMobile ? "Liste" : "Liste des retours", icon: List },
    { id: "stats", label: "Statistiques", icon: BarChart3 },
  ] as { id: string; label: string; icon: any }[];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <TabbedPageHeader
        title={isMobile ? "Retours" : "Système de Retours"}
        subtitle={
          <div className="flex items-center gap-2">
            <span>Gérez les réclamations, annulations et retours produits en toute sécurité.</span>
            {todayRefundedAmount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 bg-brand-subtle text-brand-primary px-2 py-0.5 rounded-full text-[10px] font-bold border border-brand-subtle"
              >
                <DollarSign size={10} aria-hidden="true" />
                Aujourd'hui: <AnimatedCounter value={todayRefundedAmount} /> FCFA
              </motion.div>
            )}
          </div>
        }
        icon={<RotateCcw size={24} aria-hidden="true" />}
        hideSubtitleOnMobile={true}
        tabs={tabsConfig}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as "list" | "create" | "stats")}
        guideId={
          currentSession?.role === "serveur"
            ? "serveur-returns"
            : "manage-returns"
        }
      />

      {/* Filters Area (Visible in List and Stats modes) */}
      {!showCreateReturn && (
        <div
          className="space-y-4 pt-4 border-t border-gray-100"
          data-guide="returns-search"
        >
          {/* Unified Period Filter */}
          <PeriodFilter
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            availableFilters={SALES_HISTORY_FILTERS}
            customRange={customRange}
            updateCustomRange={updateCustomRange}
          />

          {/* Search and Status Filter (Only in list mode) */}
          {!showStats && (
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
                {!isMobile && <Filter size={18} />}
                <Select
                  options={[
                    {
                      value: "all",
                      label: isMobile ? "Tous" : "Tous les statuts",
                    },
                    {
                      value: "pending",
                      label: isMobile ? "Attente" : "En attente",
                    },
                    { value: "approved", label: "Validés" },
                    { value: "rejected", label: "Rejetés" },
                  ]}
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(
                      e.target.value as
                      | "all"
                      | "pending"
                      | "approved"
                      | "rejected",
                    )
                  }
                  className="w-[110px] sm:w-[150px] h-10"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="bg-gray-50/50 rounded-3xl shadow-inner border border-gray-100 p-4 sm:p-8 min-h-[60vh]">
        {/* Disable AnimatePresence on mobile to reduce TBT (expensive animation calculations) */}
        {isMobile ? (
          <>
            {!showCreateReturn && !showStats ? (
              <div className="space-y-4">
                {filteredReturns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="bg-gray-50 p-6 rounded-full mb-4">
                      <RotateCcw size={48} className="text-gray-300" aria-hidden="true" />
                    </div>
                    <h2 className="text-lg font-medium text-gray-600 mb-2">
                      Aucun retour trouvé
                    </h2>
                    <p className="text-gray-500 max-w-md">
                      Il n'y a pas de retours correspondant à vos critères.
                      Cliquez sur "Nouveau retour" pour en créer un.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredReturns.map((returnItem) => {
                      const serverUser = returnItem.serverId
                        ? users.find((u) => u.id === returnItem.serverId) || null
                        : null;

                      return (
                        <ReturnCard
                          key={returnItem.id}
                          returnItem={returnItem as Return}
                          returnReasons={returnReasons}
                          serverUser={serverUser}
                          initiatorUser={users.find(u => u.id === returnItem.returnedBy) || null}
                          validatorUser={users.find(u => u.id === ((returnItem as Return).validatedBy || (returnItem as Return).validated_by || (returnItem as Return).rejectedBy || (returnItem as Return).rejected_by)) || null}
                          isReadOnly={isReadOnly}
                          isMobile={true}
                          formatPrice={formatPrice}
                          onApprove={approveReturn}
                          onReject={rejectReturn}
                          onManualRestock={manualRestock}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ) : showStats ? (
              <ReturnsStats returns={filteredReturnsByFilters as any} returnReasons={returnReasons} />
            ) : (
              <div>
                <CreateReturnForm
                  returnableSales={getReturnableSales}
                  returnReasons={returnReasons}
                  onCreateReturn={createReturn}
                  onCancel={() => {
                    setActiveTab("list");
                    setSelectedSale(null);
                  }}
                  selectedSale={selectedSale}
                  onSelectSale={setSelectedSale}
                  canReturnSale={canReturnSale}
                  closeHour={closeHour}
                  consignments={consignments}
                  getReturnsBySale={getReturnsBySale}
                />
              </div>
            )}
          </>
        ) : (
          /* Desktop: Keep AnimatePresence for smooth animations */
          <AnimatePresence mode="wait">
            {!showCreateReturn && !showStats ? (
              <motion.div
                key="list"
                {...getMobileAnimationProps()}
                className="space-y-4"
              >
                {filteredReturns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="bg-gray-50 p-6 rounded-full mb-4">
                      <RotateCcw size={48} className="text-gray-300" aria-hidden="true" />
                    </div>
                    <h2 className="text-lg font-medium text-gray-600 mb-2">
                      Aucun retour trouvé
                    </h2>
                    <p className="text-gray-500 max-w-md">
                      Il n'y a pas de retours correspondant à vos critères.
                      Cliquez sur "Nouveau retour" pour en créer un.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredReturns.map((returnItem) => {
                      const serverUser = returnItem.serverId
                        ? users.find((u) => u.id === returnItem.serverId) || null
                        : null;

                      return (
                        <ReturnCard
                          key={returnItem.id}
                          returnItem={returnItem as any}
                          returnReasons={returnReasons}
                          serverUser={serverUser}
                          initiatorUser={users.find(u => u.id === returnItem.returnedBy) || null}
                          validatorUser={users.find(u => u.id === (returnItem.validatedBy || returnItem.validated_by || returnItem.rejectedBy || returnItem.rejected_by)) || null}
                          isReadOnly={isReadOnly}
                          isMobile={false}
                          formatPrice={formatPrice}
                          onApprove={approveReturn}
                          onReject={rejectReturn}
                          onManualRestock={manualRestock}
                        />
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : showStats ? (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ReturnsStats returns={filteredReturnsByFilters as any} returnReasons={returnReasons} />
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
                    setActiveTab("list");
                    setSelectedSale(null);
                  }}
                  selectedSale={selectedSale}
                  onSelectSale={setSelectedSale}
                  canReturnSale={canReturnSale}
                  closeHour={closeHour}
                  consignments={consignments}
                  getReturnsBySale={getReturnsBySale}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
