import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import {
  CreditCard, Search, Filter, ChevronLeft, ChevronRight, History, ShieldCheck,
} from 'lucide-react';
import { Bar, SubscriptionPayment, SubscriptionStatus } from '../../types';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { AdminPanelErrorBoundary } from '../../components/AdminPanelErrorBoundary';
import { AdminPanelSkeleton } from '../../components/AdminPanelSkeleton';
import { RecordPaymentModal } from '../../components/admin/RecordPaymentModal';
import { BillingExemptModal } from '../../components/admin/BillingExemptModal';
import { useBeninCurrency } from '../../hooks/useBeninCurrency';
import { useSubscriptions } from '../../hooks/useSubscriptions';
import { getPlan } from '../../config/plans';
import { SUBSCRIPTION_STATUS_LABELS, formatSubscriptionDate } from '../../utils/subscriptionHelpers';

const STATUS_BADGE_VARIANT: Record<SubscriptionStatus, 'success' | 'warning' | 'danger' | 'secondary' | 'info'> = {
  up_to_date: 'success',
  due_soon: 'warning',
  overdue: 'danger',
  never_paid: 'secondary',
  trial: 'info',
  exempt: 'secondary',
};

const METHOD_LABELS: Record<string, string> = {
  momo: 'Mobile Money',
  cash: 'Espèces',
  bank: 'Virement',
  other: 'Autre',
};

const formatDate = (date: string | undefined) => formatSubscriptionDate(date, 'medium');

export default function SubscriptionsPage() {
  const { formatPrice } = useBeninCurrency();
  const { getOverview, getHistory } = useSubscriptions();

  const [subscriptionRows, setSubscriptionRows] = useState<Array<{
    bar: Bar;
    status: SubscriptionStatus;
    daysUntilDue: number | null;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [error, setError] = useState<string | null>(null);

  const [paymentBar, setPaymentBar] = useState<Bar | null>(null);
  const [exemptBar, setExemptBar] = useState<Bar | null>(null);
  const [historyBar, setHistoryBar] = useState<Bar | null>(null);
  const [history, setHistory] = useState<SubscriptionPayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // silent : rechargement en arrière-plan (post-action) sans flash de skeleton.
  // Un refetch reste nécessaire car le statut (trial/exempt/overdue…) est calculé
  // côté serveur (le client ne peut pas le recalculer fidèlement) et le bar peut
  // sortir du filtre courant après la modification — on garde la grille affichée.
  const loadBars = useCallback(async (silent = false) => {
    try {
      setError(null);
      if (!silent) setLoading(true);
      const data = await getOverview({
        page: currentPage,
        limit,
        searchQuery: debouncedSearchQuery,
        statusFilter,
      });
      setSubscriptionRows(data.bars);
      setTotalCount(data.totalCount);
      setMrr(data.mrr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des abonnements');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentPage, limit, debouncedSearchQuery, statusFilter, getOverview]);

  const reloadSilently = useCallback(() => loadBars(true), [loadBars]);

  useEffect(() => { loadBars(); }, [loadBars]);
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchQuery, statusFilter]);

  const openHistory = async (bar: Bar) => {
    setHistoryBar(bar);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setHistory(await getHistory(bar.id));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Erreur lors du chargement de l\'historique');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPanelErrorBoundary fallbackTitle="Erreur dans le suivi des abonnements">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 md:p-6 text-white rounded-t-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-8" />
              <div>
                <h1 className="text-xl md:text-2xl font-bold">Suivi des abonnements</h1>
                <p className="text-purple-100 text-sm">Paiements et échéances des bars</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-purple-100 text-xs">MRR (résultat filtré)</p>
              <p className="text-lg md:text-xl font-bold">{formatPrice(mrr)}</p>
            </div>
          </div>
        </div>

        <div className="p-3 md:p-6 border-b bg-card rounded-none">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, adresse ou téléphone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <div className="sm:w-56">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                <Select
                  options={[
                    { value: 'all', label: 'Tous les statuts' },
                    { value: 'overdue', label: 'En retard' },
                    { value: 'due_soon', label: 'Échéance proche' },
                    { value: 'up_to_date', label: 'À jour' },
                    { value: 'trial', label: 'Essai gratuit' },
                    { value: 'never_paid', label: 'Jamais payé' },
                    { value: 'exempt', label: 'Exempté' },
                  ]}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | SubscriptionStatus)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 border-b bg-card rounded-none">
            <Alert variant="destructive" title="Erreur de chargement">
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={() => loadBars()}
                  className="ml-4 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded-md font-medium transition-colors"
                >
                  Réessayer
                </button>
              </div>
            </Alert>
          </div>
        )}

        <div className="flex-1 bg-muted">
          {loading && subscriptionRows.length === 0 ? (
            <AdminPanelSkeleton count={4} type="card" />
          ) : subscriptionRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
              <p className="text-lg font-semibold">Aucun bar trouvé</p>
              <p className="text-sm">Essayez de modifier vos critères</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 md:p-6">
              {subscriptionRows.map(({ bar, status, daysUntilDue }) => {
                const plan = getPlan(bar.settings?.plan);
                return (
                  <div
                    key={bar.id}
                    className={`bg-card rounded-lg p-4 border-2 ${
                      status === 'overdue' ? 'border-red-200' : 'border-border'
                    } hover:shadow-lg transition-shadow`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-base text-foreground truncate">{bar.name}</h4>
                        <p className="text-xs text-muted-foreground truncate">{bar.address || "Pas d'adresse"}</p>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANT[status]} dot className="flex-shrink-0 ml-2">
                        {SUBSCRIPTION_STATUS_LABELS[status]}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs mb-3 text-foreground/70">
                      <p>
                        <span className="font-semibold">Plan :</span> {plan.label} - {formatPrice(plan.monthlyPriceXOF)}/mois
                      </p>
                      {status === 'exempt' ? (
                        <p className="text-foreground/80">
                          <span className="font-semibold">Exempté :</span>{' '}
                          {bar.billingExemptReason || 'Motif non précisé'}
                        </p>
                      ) : (
                        <p>
                          <span className="font-semibold">
                            {status === 'trial' ? 'Fin d\'essai :' : 'Prochaine échéance :'}
                          </span>{' '}
                          {formatDate(bar.subscriptionDueDate)}
                          {status === 'overdue' && daysUntilDue !== null && (
                            <span className="text-red-600 font-semibold"> (retard de {Math.abs(daysUntilDue)}j)</span>
                          )}
                          {(status === 'due_soon' || status === 'trial') && daysUntilDue !== null && (
                            <span className="text-yellow-700 font-semibold"> (dans {daysUntilDue}j)</span>
                          )}
                        </p>
                      )}
                      {!bar.isActive && <p className="text-red-600 font-semibold">Bar suspendu</p>}
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setPaymentBar(bar)} className="flex-1">
                        <CreditCard className="w-4 h-4 mr-1" /> Enregistrer un paiement
                      </Button>
                      <Button
                        size="sm"
                        variant={bar.billingExempt ? 'default' : 'outline'}
                        onClick={() => setExemptBar(bar)}
                        title={bar.billingExempt ? 'Gérer l\'exemption' : 'Exempter ce bar'}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openHistory(bar)}>
                        <History className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 border-t flex-shrink-0 bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 rounded-b-2xl">
          <p className="text-xs sm:text-sm text-foreground/70">
            Page <span className="font-semibold">{currentPage}</span> sur{' '}
            <span className="font-semibold">{totalPages}</span> ({totalCount} bars)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-50 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-50 hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {paymentBar && (
          <RecordPaymentModal
            bar={paymentBar}
            onClose={() => setPaymentBar(null)}
            onRecorded={reloadSilently}
          />
        )}

        {exemptBar && (
          <BillingExemptModal
            bar={exemptBar}
            onClose={() => setExemptBar(null)}
            onSaved={reloadSilently}
          />
        )}

        {historyBar && (
          <Modal
            open
            onClose={() => setHistoryBar(null)}
            title="Historique des paiements"
            description={historyBar.name}
            size="lg"
          >
            {historyLoading ? (
              <p className="text-sm text-muted-foreground py-4">Chargement...</p>
            ) : historyError ? (
              <Alert variant="destructive" title="Erreur de chargement">
                {historyError}
              </Alert>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Aucun paiement enregistré.</p>
            ) : (
              <div className="divide-y divide-border">
                {history.map((p) => (
                  <div key={p.id} className="py-3 flex justify-between items-start text-sm">
                    <div>
                      <p className="font-semibold text-foreground">{formatPrice(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.monthsCovered} mois - {METHOD_LABELS[p.method] || p.method}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Période : {formatDate(p.periodStart)} vers {formatDate(p.periodEnd)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.paidAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        )}
      </AdminPanelErrorBoundary>
    </div>
  );
}
