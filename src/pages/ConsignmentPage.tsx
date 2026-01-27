import React, { useState, useMemo } from 'react';
import {
  Package,
  Search,
  Clock,
  Archive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { Button } from '../components/ui/Button';
import { CreateConsignmentForm } from '../components/consignments/CreateConsignmentForm';
import { ConsignmentCard as PremiumConsignmentCard } from '../components/consignments/ConsignmentCard';
import { Consignment, User as UserType } from '../types';

type TabType = 'create' | 'active' | 'history';

export default function ConsignmentPage() {
  const stockManager = useStockManagement();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const { isMobile } = useViewport();
  const { currentSession } = useAuth();

  // ✨ Déterminer si l'utilisateur est en mode read-only (serveur)
  const isReadOnly = currentSession?.role === 'serveur';

  // Configuration des onglets pour TabbedPageHeader
  const tabs = [
    ...(!isReadOnly ? [{ id: 'create', label: isMobile ? 'Nouveau' : 'Nouvelle Consignation', icon: Package }] : []),
    { id: 'active', label: isMobile ? 'En cours' : 'Consignations Actives', icon: Clock },
    { id: 'history', label: isMobile ? 'Historique' : 'Historique des Consignations', icon: Archive },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <TabbedPageHeader
        title={isMobile ? 'Consignations' : 'Gestion des Consignations'}
        subtitle="Gérer les produits consignés et récupérations"
        icon={<Package className="w-6 h-6 text-amber-600" />}
        hideSubtitleOnMobile
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabType)}
        guideId={currentSession?.role === 'serveur' ? 'serveur-consignments' : 'manage-consignments'}
        mobileTopRightContent={
          activeTab === 'active' && (
            <Button
              onClick={stockManager.checkAndExpireConsignments}
              variant="ghost"
              size="icon"
              className="rounded-lg transition-colors hover:bg-white/20 text-amber-900"
              title="Vérifier les expirations"
            >
              <Clock size={20} />
            </Button>
          )
        }
        actions={
          !isMobile && activeTab === 'active' && (
            <Button
              onClick={stockManager.checkAndExpireConsignments}
              variant="ghost"
              className="text-amber-900 hover:bg-white/20 flex items-center gap-2"
              title="Vérifier les expirations"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Vérifier expirations</span>
            </Button>
          )
        }
      />

      {/* Content Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Content */}
        <div className="p-6 min-h-[60vh]">
          <AnimatePresence mode="wait">
            {activeTab === 'create' && (
              <motion.div key="create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} data-guide="consignments-create-tab">
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
    </div>
  );
}

// ===== TAB CONTENT =====

// ===== TAB 2: CONSIGNATIONS ACTIVES =====
interface ActiveConsignmentsTabProps {
  stockManager: any;
  isReadOnly?: boolean;
}

const ActiveConsignmentsTab: React.FC<ActiveConsignmentsTabProps> = ({
  stockManager,
  isReadOnly = false,
}) => {
  const { sales } = useAppContext();
  const { barMembers } = useBarContext();
  const { currentSession } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const [searchTerm, setSearchTerm] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "soon" | "expired">("all");

  const users = useMemo(() =>
    Array.isArray(barMembers) ? barMembers.map((m: any) => m.user).filter(Boolean) as UserType[] : [],
    [barMembers]
  );

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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="bg-amber-100 rounded-xl px-4 py-2 border border-amber-200">
            <span className="text-2xl font-black text-amber-600 font-mono leading-none">
              {activeConsignments.length}
            </span>
            <span className="text-[10px] uppercase font-black text-amber-700 ml-2 tracking-wider">
              Actives
            </span>
          </div>

          <div className="flex bg-white rounded-lg p-1 border border-gray-200">
            {[
              { id: "all", label: "Tout" },
              { id: "soon", label: "Bientôt" },
              { id: "expired", label: "Expirés" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setUrgencyFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tight transition-all ${urgencyFilter === f.id
                  ? "bg-amber-500 text-white shadow-md"
                  : "text-gray-400 hover:text-gray-600"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nom, produit, ID..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
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
            className="mt-2 text-amber-600 font-bold hover:underline text-sm"
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===== TAB 3: HISTORIQUE =====
const HistoryTab: React.FC<{ stockManager: any }> = ({ stockManager }) => {
  const { sales } = useAppContext();
  const { barMembers } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const [filterStatus, setFilterStatus] = useState<"all" | "claimed" | "expired" | "forfeited">("all");

  const users = useMemo(() =>
    Array.isArray(barMembers) ? barMembers.map((m: any) => m.user).filter(Boolean) as UserType[] : [],
    [barMembers]
  );

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

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap bg-gray-50 p-2 rounded-lg w-fit">
        {[
          { value: "all", label: "Tout" },
          { value: "claimed", label: "Récupérés" },
          { value: "expired", label: "Expirés" },
          { value: "forfeited", label: "Confisqués" },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => setFilterStatus(filter.value as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === filter.value
              ? "bg-amber-500 text-white shadow-sm"
              : "bg-transparent text-gray-700 hover:bg-gray-200"
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
          {sortedHistory.map((consignment: Consignment) => {
            let originalSeller: UserType | undefined = undefined;
            const originalSale = sales.find((s) => s.id === consignment.saleId);
            if (originalSale) {
              const serverUserId = originalSale.soldBy;
              originalSeller = users.find((u) => u.id === serverUserId);
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
                      {consignment.quantity} × {consignment.productName}{" "}
                      {consignment.productVolume}
                    </p>
                    {originalSeller && (
                      <p className="text-xs text-amber-600 mt-1">👤 Vendeur: {originalSeller.name}</p>
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
