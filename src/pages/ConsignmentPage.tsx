import React, { useState, useMemo, useCallback } from 'react';
import {
  Package,
  Search,
  Clock,
  Archive,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';

import { Input } from '../components/ui/Input';
import { CreateConsignmentForm } from '../components/consignments/CreateConsignmentForm';
import { ConsignmentCard as PremiumConsignmentCard } from '../components/consignments/ConsignmentCard';
import { Consignment, User as UserType } from '../types';

type TabType = 'create' | 'active' | 'history';

export default function ConsignmentPage() {
  const { currentBar } = useBarContext();
  const stockManager = useUnifiedStock(currentBar?.id);
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const { isMobile } = useViewport();
  const { currentSession } = useAuth();

  // ✨ Déterminer si l'utilisateur est en mode read-only (serveur)
  const isReadOnly = currentSession?.role === 'serveur';

  // Configuration des onglets pour TabbedPageHeader
  const tabs = [
    { id: 'create', label: isMobile ? 'Nouveau' : 'Nouvelle Consignation', icon: Package },
    { id: 'active', label: isMobile ? 'En cours' : 'Consignations Actives', icon: Clock },
    { id: 'history', label: isMobile ? 'Historique' : 'Historique des Consignations', icon: Archive },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <TabbedPageHeader
        title={isMobile ? 'Consignations' : 'Gestion des Consignations'}
        subtitle="Suivez les bouteilles déposées par vos clients et gérez les délais de récupération."
        hideSubtitleOnMobile={true}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabType)}
        guideId={currentSession?.role === 'serveur' ? 'serveur-consignments' : 'manage-consignments'}
      />

      {/* Content Container - Elite Style */}
      <div className="bg-gray-50/50 rounded-3xl shadow-inner border border-gray-100 p-4 sm:p-8 min-h-[60vh]">
        <AnimatePresence mode="wait">
          {activeTab === 'create' && (
            <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} data-guide="consignments-create-tab">
              <CreateConsignmentForm
                consignments={stockManager.consignments}
                onCreate={(data) => stockManager.createConsignment(data)}
                onCancel={() => setActiveTab('active')}
                onSuccess={() => setActiveTab('active')}
              />
            </motion.div>
          )}
          {activeTab === 'active' && (
            <motion.div key="active" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} data-guide="consignments-active-tab">
              <ActiveConsignmentsTab stockManager={stockManager} isReadOnly={isReadOnly} />
            </motion.div>
          )}
          {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} data-guide="consignments-history-tab">
              <HistoryTab stockManager={stockManager} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ===== TAB CONTENT =====

// ===== TAB 2: CONSIGNATIONS ACTIVES =====
interface ActiveConsignmentsTabProps {
  stockManager: ReturnType<typeof useUnifiedStock>;
  isReadOnly?: boolean;
}

const ActiveConsignmentsTab: React.FC<ActiveConsignmentsTabProps> = ({
  stockManager,
  isReadOnly = false,
}) => {
  const { currentBar } = useBarContext();

  // 🛡️ Expert Fix: Filtre 60 jours pour éviter de charger tout l'historique des ventes
  const consignmentSalesFilters = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 60);
    return { startDate: start.toISOString().split('T')[0], includeItems: false as const };
  }, []);

  const { sales } = useUnifiedSales(currentBar?.id, consignmentSalesFilters);
  const { barMembers } = useBarContext();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const [searchTerm, setSearchTerm] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "soon" | "expired">("all");

  const users = useMemo(() =>
    Array.isArray(barMembers) ? barMembers.map((m) => m.user).filter(Boolean) as UserType[] : [],
    [barMembers]
  );

  // O(1) lookups for ConsignmentCard — avoids N × sales.find() + users.find()
  const salesMap = useMemo(() => {
    const map = new Map<string, typeof sales[number]>();
    for (const s of sales) map.set(s.id, s);
    return map;
  }, [sales]);
  const usersMap = useMemo(() => {
    const map = new Map<string, UserType>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);
  const getSellerForConsignment = useCallback((consignment: Consignment): UserType | undefined => {
    const sale = consignment.saleId ? salesMap.get(consignment.saleId) : undefined;
    return sale?.soldBy ? usersMap.get(sale.soldBy) : undefined;
  }, [salesMap, usersMap]);

  const isServerRole = currentSession?.role === "serveur";

  const activeConsignments = useMemo(() => {
    let consignments = stockManager.consignments.filter(
      (c: Consignment) => c.status === "active"
    );

    if (isServerRole && currentSession?.userId) {
      consignments = consignments.filter(
        (c: Consignment) =>
          c.serverId === currentSession.userId ||
          c.originalSeller === currentSession.userId
      );
    }

    return consignments as Consignment[];
  }, [stockManager.consignments, isServerRole, currentSession?.userId]);

  const { formatPrice } = useCurrencyFormatter();
  const activeConsignmentsTotalValue = useMemo(() => activeConsignments.reduce((acc, c) => acc + c.totalAmount, 0), [activeConsignments]);

  const filteredConsignments = useMemo(() => {
    let filtered = activeConsignments;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c: Consignment) =>
          c.customerName?.toLowerCase().includes(term) ||
          c.customerPhone?.includes(term) ||
          c.productName.toLowerCase().includes(term) ||
          c.id.toLowerCase().includes(term)
      );
    }

    // Urgency filter
    if (urgencyFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((c: Consignment) => {
        const expiresAt = new Date(c.expiresAt);
        const hoursLeft = Math.floor(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        );
        if (urgencyFilter === "expired") return hoursLeft < 0;
        if (urgencyFilter === "soon")
          return hoursLeft >= 0 && hoursLeft <= 24;
        return true;
      });
    }

    // Sort by expiration
    return [...filtered].sort(
      (a: Consignment, b: Consignment) =>
        new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    );
  }, [activeConsignments, searchTerm, urgencyFilter]);

  const handleClaim = (consignment: Consignment) => {
    if (!window.confirm(
      `Valider la récupération de ${consignment.quantity} ${consignment.productName} par ${consignment.customerName} ?\n\nLe produit sera déduit du stock des consignes actives.`
    )) return;

    const success = stockManager.claimConsignment(consignment.id);
    if (success) {
      showSuccess(`Consignation récupérée: ${consignment.quantity} ${consignment.productName}`);
    } else {
      showError("Erreur lors de la récupération");
    }
  };

  const handleForfeit = (consignment: Consignment) => {
    if (!window.confirm(
      `Confisquer la consignation de ${consignment.customerName} ?\n\nLe produit sera retiré du stock des consignes et redeviendra immédiatement vendable.`
    )) return;

    const success = stockManager.forfeitConsignment(consignment.id);
    if (success) {
      showSuccess(`Consignation confisquée - ${consignment.quantity}x ${consignment.productName} remis en stock`);
    } else {
      showError("Erreur lors de la confiscation");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white/60 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-brand-subtle shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-brand-subtle rounded-xl px-4 py-2 border border-brand-subtle flex items-center shadow-sm">
            <span className="text-2xl font-black text-brand-primary font-mono leading-none">
              {activeConsignments.length}
            </span>
            <span className="text-[10px] uppercase font-black text-brand-dark ml-2 tracking-wider">
              Actives
            </span>
          </div>

          <div className="bg-brand-subtle rounded-xl px-4 py-2 border border-brand-subtle flex items-center shadow-sm">
            <span className="text-[10px] uppercase font-black text-brand-dark mr-2 tracking-wider">
              Valeur
            </span>
            <span className="text-lg font-black text-brand-primary font-mono tracking-tighter leading-none">
              {formatPrice(activeConsignmentsTotalValue)}
            </span>
          </div>

          <div className="flex bg-white/40 backdrop-blur-md rounded-2xl p-1.5 gap-1.5 border border-brand-subtle shadow-sm overflow-x-auto scrollbar-hide">
            {[
              { id: "all", label: "Tout" },
              { id: "soon", label: "Bientôt" },
              { id: "expired", label: "Expirés" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setUrgencyFilter(f.id as "all" | "soon" | "expired")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${urgencyFilter === f.id
                  ? "glass-action-button-active-2026 shadow-md shadow-brand-subtle"
                  : "glass-action-button-2026"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full sm:w-64">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nom, produit, ID..."
            leftIcon={<Search className="w-4 h-4" />}
            className="bg-white/80 border-brand-subtle rounded-xl focus:border-[var(--brand-primary)]"
          />
        </div>
      </div>

      {filteredConsignments.length === 0 ? (
        <div className="py-20 text-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
          <Package className="w-16 h-16 mx-auto mb-4 opacity-10 text-gray-400" />
          <p className="text-gray-500 font-medium">Aucune consignation trouvée</p>
          <button
            onClick={() => {
              setSearchTerm("");
              setUrgencyFilter("all");
            }}
            className="mt-2 text-brand-primary font-bold hover:underline text-sm"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredConsignments.map((consignment: Consignment) => (
            <PremiumConsignmentCard
              key={consignment.id}
              consignment={consignment}
              onClaim={() => handleClaim(consignment)}
              onForfeit={() => handleForfeit(consignment)}
              users={users}
              sales={sales}
              isReadOnly={isReadOnly}
              precomputedSeller={getSellerForConsignment(consignment)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===== TAB 3: HISTORIQUE =====
const HISTORY_PAGE_SIZE = 100;

const HistoryTab: React.FC<{ stockManager: any }> = ({ stockManager }) => {
  const { currentBar } = useBarContext();

  // 🛡️ Expert Fix: Filtre 60 jours
  const historySalesFilters = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 60);
    return { startDate: start.toISOString().split('T')[0], includeItems: false as const };
  }, []);

  const { sales } = useUnifiedSales(currentBar?.id, historySalesFilters);
  const { barMembers } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const [filterStatus, setFilterStatus] = useState<"all" | "claimed" | "expired" | "forfeited">("all");
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);

  const users = useMemo(() =>
    Array.isArray(barMembers) ? barMembers.map((m) => m.user).filter(Boolean) as UserType[] : [],
    [barMembers]
  );

  // O(1) lookups — replaces nested sales.find() + users.find() per row
  const salesMap = useMemo(() => {
    const map = new Map<string, typeof sales[number]>();
    for (const s of sales) map.set(s.id, s);
    return map;
  }, [sales]);
  const usersMap = useMemo(() => {
    const map = new Map<string, UserType>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);
  const getSellerForConsignment = useCallback((consignment: Consignment): UserType | undefined => {
    const sale = consignment.saleId ? salesMap.get(consignment.saleId) : undefined;
    return sale?.soldBy ? usersMap.get(sale.soldBy) : undefined;
  }, [salesMap, usersMap]);

  const isServerRole = currentSession?.role === "serveur";

  const historyConsignments = useMemo(() => {
    let filtered = stockManager.consignments.filter(
      (c: Consignment) => c.status !== "active"
    );

    if (isServerRole && currentSession?.userId) {
      filtered = filtered.filter(
        (c: Consignment) =>
          c.serverId === currentSession.userId ||
          c.originalSeller === currentSession.userId
      );
    }

    if (filterStatus === "all") return filtered;
    return filtered.filter((c: Consignment) => c.status === filterStatus);
  }, [stockManager.consignments, filterStatus, isServerRole, currentSession?.userId]);

  const sortedHistory = useMemo(() => {
    return [...historyConsignments].sort(
      (a: Consignment, b: Consignment) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [historyConsignments]);

  // Client pagination
  const paginatedHistory = useMemo(() => sortedHistory.slice(0, visibleCount), [sortedHistory, visibleCount]);
  const hasMore = sortedHistory.length > visibleCount;

  // Reset pagination when filter changes
  React.useEffect(() => {
    setVisibleCount(HISTORY_PAGE_SIZE);
  }, [filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap bg-white/40 backdrop-blur-md p-1.5 rounded-2xl border border-brand-subtle w-fit shadow-sm">
        {[
          { value: "all", label: "Tout" },
          { value: "claimed", label: "Récupérés" },
          { value: "expired", label: "Expirés" },
          { value: "forfeited", label: "Confisqués" },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => setFilterStatus(filter.value as "all" | "claimed" | "expired" | "forfeited")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus === filter.value
              ? "glass-action-button-active-2026 shadow-md shadow-brand-subtle"
              : "glass-action-button-2026 text-gray-400"
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
          {paginatedHistory.map((consignment: Consignment) => {
            const originalSeller = getSellerForConsignment(consignment);

            return (
              <div
                key={consignment.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{consignment.customerName}</h4>
                    <p className="text-sm text-gray-600">
                      {consignment.quantity} × {consignment.productName}{" "}
                      {consignment.productVolume}
                    </p>
                    {originalSeller && (
                      <p className="text-xs text-brand-primary mt-1">👤 Vendeur: {originalSeller.name}</p>
                    )}
                  </div>
                  <StatusBadge status={consignment.status} />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Créé: {new Date(consignment.createdAt).toLocaleDateString("fr-FR")}</span>
                  <span>{formatPrice(consignment.totalAmount)}</span>
                </div>

                {consignment.claimedAt && (
                  <div className="text-xs text-green-600 mt-1">
                    Récupéré le {new Date(consignment.claimedAt).toLocaleDateString("fr-FR")}
                  </div>
                )}
              </div>
            );
          })}
          {hasMore && (
            <div className="flex justify-center py-4">
              <button
                onClick={() => setVisibleCount(c => c + HISTORY_PAGE_SIZE)}
                className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                <ChevronDown size={16} />
                Voir plus ({sortedHistory.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===== STATUS BADGE =====
const StatusBadge: React.FC<{ status: Consignment["status"] }> = ({ status }) => {
  const configs = {
    active: { label: "Actif", color: "bg-amber-100 text-amber-700" },
    claimed: { label: "Récupéré", color: "bg-green-100 text-green-700" },
    expired: { label: "Expiré", color: "bg-amber-100 text-amber-700" },
    forfeited: { label: "Confisqué", color: "bg-red-100 text-red-700" },
  };

  const config = configs[status];

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
};
