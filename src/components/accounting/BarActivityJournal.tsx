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

import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Libelles d'affichage des valeurs de `user_role`.
 *
 * ⚠️ Cette colonne ne contient PAS que les roles de UserRole. Releve en prod
 * le 21/09/2026 sur 8 343 lignes :
 *   system 3623 · promoteur 2359 · serveur 1377 · gerant 845 ·
 *   super_admin 60 · user 52 · admin 27
 *
 * `system` est la valeur la PLUS FREQUENTE : internal_log_audit_event
 * retombe dessus des que le couple (user_id, bar_id) est absent de
 * bar_members - typiquement une action du SuperAdmin, qui n'est membre
 * d'aucun bar client. Les nominations de co-promoteur (chantier A) en font
 * partie : 83 MEMBER_ADDED sur 119 sont en `system`.
 *
 * `user` et `admin` sont des valeurs historiques (dec. 2025 / janv. 2026),
 * conservees ici pour que ces lignes restent lisibles.
 */
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  promoteur: 'Promoteur',
  co_promoteur: 'Co-promoteur',
  gerant: 'Gérant',
  serveur: 'Serveur',
  cuisinier: 'Cuisinier',
  system: 'Système / SuperAdmin',
  user: 'Utilisateur (historique)',
  admin: 'Admin (historique)',
};

/**
 * Libelles des evenements. Repli sur la valeur brute pour tout evenement non
 * liste : la colonne `event` est un TEXT libre cote SQL (aucun enum, aucun
 * CHECK), donc cette table ne peut pas etre exhaustive par construction.
 */
const EVENT_LABELS: Record<string, string> = {
  EXPENSE_CREATED: 'Dépense',
  EXPENSE_DELETED: 'Dépense supprimée',
  STOCK_ADJUSTED: 'Stock ajusté',
  RETURN_PROCESSED: 'Retour traité',
  SALE_CANCELLED: 'Vente annulée',
  MEMBER_ADDED: 'Membre ajouté',
  MEMBER_REMOVED: 'Membre retiré',
  SALARY_PAID: 'Salaire versé',
};

/**
 * Filtres proposes.
 *
 * ⛔ Bornes aux valeurs que le RPC accepte : il refuse toute valeur hors des
 * 6 roles de UserRole avec une erreur 22023. `system`, `user` et `admin`
 * existent en base mais ne sont PAS envoyables comme p_role_filter.
 *
 * Un filtre client sur ces trois valeurs serait pire qu'absent : la
 * pagination etant faite par le serveur, il ne filtrerait que les 25 lignes
 * de la page courante et afficherait un total faux. D'ou le choix de ne pas
 * les proposer, et de le DIRE dans l'aide sous le selecteur plutot que de
 * laisser l'utilisateur croire que ces entrees n'existent pas.
 */
const ROLE_FILTERS = [
  { value: '', label: 'Tous les intervenants' },
  { value: 'promoteur', label: 'Promoteur' },
  { value: 'co_promoteur', label: 'Co-promoteur' },
  { value: 'gerant', label: 'Gérant' },
  { value: 'serveur', label: 'Serveur' },
  { value: 'cuisinier', label: 'Cuisinier' },
];

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

  /**
   * ⛔ Garde d'ordonnancement. Sans elle, deux chargements concurrents
   * (clic rapide sur la pagination, ou changement de filtre pendant un
   * chargement) peuvent revenir dans le DESORDRE : la reponse lente de la
   * page 3 ecraserait celle de la page 1, affichant des lignes qui ne
   * correspondent pas au paginateur. Elle sert aussi de garde de
   * demontage : un `load()` en vol quand l'utilisateur change d'onglet
   * n'ecrit plus dans un composant demonte.
   */
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!barId) return;

    const requestId = ++requestIdRef.current;
    const isStale = () => !mountedRef.current || requestId !== requestIdRef.current;

    setLoading(true);
    setError(null);
    try {
      const result = await BarAuditLogsService.getBarAuditLogs({
        barId,
        page,
        limit: PAGE_SIZE,
        roleFilter: roleFilter || undefined,
      });
      if (isStale()) return;
      setLogs(result.logs);
      setTotalCount(result.totalCount);
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : 'Impossible de charger le journal.');
      setLogs([]);
      setTotalCount(0);
    } finally {
      // `loading` n'est relache que par la requete la plus recente, sinon
      // une reponse obsolete eteindrait le spinner d'une requete en cours.
      if (!isStale()) setLoading(false);
    }
  }, [barId, page, roleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // ⚠️ Le retour en page 1 se fait dans le onChange du Select et dans cet
  //    effet pour le SEUL cas du changement de bar. Le faire dans un effet
  //    reagissant a `roleFilter` declencherait DEUX requetes par changement
  //    de filtre : l'ancienne page avec le nouveau filtre (souvent au-dela
  //    du dernier resultat, donc vide), puis la bonne.
  useEffect(() => {
    setPage(1);
  }, [barId]);

  // Reclampe la page si le nombre total d'entrees a diminue depuis le
  // dernier chargement (purge de retention, filtre plus restrictif applique
  // ailleurs). Sans cela l'ecran afficherait "Aucune activite" alors que
  // des entrees existent, simplement parce qu'on pointe au-dela de la fin.
  useEffect(() => {
    if (!loading && page > totalPages) {
      setPage(totalPages);
    }
  }, [loading, page, totalPages]);

  if (!barId) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sélectionnez un bar pour consulter son journal d'activité.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* items-start et non items-center : l'aide conditionnelle sous le
          selecteur ferait sauter verticalement les autres elements a chaque
          application de filtre si la ligne etait centree. */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
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
            onChange={(e) => {
              // Les deux setState d'un meme handler sont groupes par React,
              // donc un SEUL rechargement part avec le nouveau filtre ET la
              // page 1 - contrairement a un effet sur [roleFilter], qui en
              // declencherait deux dont un jetable.
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            disabled={loading}
            options={ROLE_FILTERS.map((r) => ({ value: r.value, label: r.label }))}
          />
          {roleFilter && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Les actions du SuperAdmin (nomination d'un co-promoteur, par
              exemple) sont enregistrées sans rôle de bar et n'apparaissent
              qu'en «&nbsp;Tous les intervenants&nbsp;».
            </p>
          )}
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
        // Pendant un rechargement (changement de page ou de filtre), la liste
        // precedente reste affichee mais grisee et non cliquable : sans ce
        // retour visuel, un clic sur "page suivante" semblerait sans effet
        // jusqu'a l'arrivee des donnees.
        <div className={`space-y-2 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
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
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {/* ⚠️ L'evenement est affiche parce que la description
                          seule ne suffit pas a distinguer les operations :
                          STOCK_ADJUSTED recouvre l'ajustement manuel,
                          l'annulation d'approvisionnement et la remise en
                          stock apres retour. Sans ce badge, elles ne se
                          different que par du texte libre. */}
                      <span className="px-1.5 py-0.5 rounded bg-card/70 border border-border/60 font-mono text-[10px] uppercase tracking-tight">
                        {EVENT_LABELS[log.event] || log.event}
                      </span>
                      <span>
                        {log.user_name}
                        {log.user_role && (
                          <> · {ROLE_LABELS[log.user_role] || log.user_role}</>
                        )}
                        {' · '}
                        {formatDate(log.timestamp)}
                      </span>
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
