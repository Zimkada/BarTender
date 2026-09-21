// components/accounting/BarActivityJournal.tsx
// Journal d'activite du bar - Phase 2, chantier B3.
// Voir docs/roadmaps/PLAN_CO_PROMOTEUR_PHASE2.md §4.3.
//
// Repond au besoin d'origine du chantier co-promoteur : permettre au
// promoteur de voir ce qui a ete fait sur son bar en son absence.
//
// ⛔ Modele visuel repris de BarAuditLogsViewer, mais AUCUN code partage :
// ce dernier lit bar_audit_log (creation/suspension de bars) via un RPC
// verrouille super_admin. Ici on lit audit_logs (le journal metier) via
// get_bar_audit_logs, ouvert au promoteur et au co-promoteur du bar.

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { Select } from '../ui/Select';
import { Alert } from '../ui/Alert';
import { EmptyState } from '../common/EmptyState';
import {
  BarAuditLogsService,
  type BarAuditLogEntry,
} from '../../services/supabase/barAuditLogs.service';

/** Doit rester <= BAR_AUDIT_LOGS_MAX_LIMIT (200), plafond impose par le RPC. */
const PAGE_SIZE = 25;

/**
 * Filtres de role proposes. Les valeurs doivent appartenir aux 6 roles de
 * UserRole : le RPC refuse toute autre valeur avec une erreur 22023.
 */
const ROLE_FILTERS = [
  { value: '', label: 'Tous les intervenants' },
  { value: 'promoteur', label: 'Promoteur' },
  { value: 'co_promoteur', label: 'Co-promoteur' },
  { value: 'gerant', label: 'Gérant' },
  { value: 'serveur', label: 'Serveur' },
] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  promoteur: 'Promoteur',
  co_promoteur: 'Co-promoteur',
  gerant: 'Gérant',
  serveur: 'Serveur',
  cuisinier: 'Cuisinier',
};

const severityIcon = (severity: string) => {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-red-600" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-orange-600" />;
    default:
      return <Info className="w-4 h-4 text-blue-600" />;
  }
};

const severityStyle = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 border-red-200';
    case 'warning':
      return 'bg-orange-50 border-orange-200';
    default:
      return 'bg-blue-50 border-blue-200';
  }
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);

export const BarActivityJournal: React.FC = () => {
  const { currentBar } = useBarContext();
  const barId = currentBar?.id;

  const [logs, setLogs] = useState<BarAuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const load = useCallback(async () => {
    if (!barId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await BarAuditLogsService.getBarAuditLogs({
        barId,
        page,
        limit: PAGE_SIZE,
        roleFilter: roleFilter || undefined,
      });
      setLogs(result.logs);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger le journal.');
      setLogs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [barId, page, roleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Revenir en page 1 quand le filtre change : rester sur la page 4 d'un
  // resultat qui n'en compte plus que 2 renverrait une page vide (le RPC
  // repond alors logs = NULL, traduit en liste vide par le service).
  useEffect(() => {
    setPage(1);
  }, [roleFilter, barId]);

  if (!barId) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sélectionnez un bar pour consulter son journal d'activité.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">
            Opérations sensibles enregistrées sur ce bar : dépenses, ajustements
            de stock, retours, changements d'équipe.
          </p>
        </div>
        <div className="sm:w-56">
          <Select
            size="sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            disabled={loading}
            options={ROLE_FILTERS.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Chargement du journal...</span>
        </div>
      ) : !loading && logs.length === 0 && !error ? (
        <EmptyState
          icon={History}
          message="Aucune activité enregistrée"
          subMessage={
            roleFilter
              ? "Aucune opération pour ce rôle sur la période conservée."
              : "Les opérations sensibles apparaîtront ici au fur et à mesure."
          }
        />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const hasMetadata = !!log.metadata && Object.keys(log.metadata).length > 0;
            return (
              <div
                key={log.id}
                className={`border-2 rounded-lg p-3 ${severityStyle(log.severity)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {severityIcon(log.severity)}
                      <span className="font-semibold text-sm text-foreground break-words">
                        {log.description}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {log.user_name}
                      {log.user_role && (
                        <> · {ROLE_LABELS[log.user_role] || log.user_role}</>
                      )}
                      {' · '}
                      {formatDate(log.timestamp)}
                    </div>

                    {expandedId === log.id && hasMetadata && (
                      <pre className="mt-2 p-2 bg-card/70 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    )}
                  </div>

                  {hasMetadata && (
                    <button
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className="text-xs font-medium text-foreground/70 hover:text-foreground flex-shrink-0"
                    >
                      {expandedId === log.id ? 'Masquer' : 'Détails'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Page <span className="font-semibold">{page}</span> sur{' '}
            <span className="font-semibold">{totalPages}</span> ({totalCount} entrées)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-50 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-50 hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

BarActivityJournal.displayName = 'BarActivityJournal';
