import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import {
  Search, Filter, Download, Calendar, AlertTriangle, Info, AlertCircle, ChevronDown, ChevronUp, FileText, Package
} from 'lucide-react';
import { AdminService } from '../services/supabase/admin.service';
import type { AuditLog, AuditLogEvent, AuditLogSeverity, Bar, GlobalCatalogAuditLog } from '../types';
import { Alert } from '../components/ui/Alert';
import { AdminPanelErrorBoundary } from '../components/AdminPanelErrorBoundary';
import { AdminPanelSkeleton } from '../components/AdminPanelSkeleton';

type TabType = 'system' | 'catalog';

export default function AuditLogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('system');

  // System logs state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(50);

  // Catalog logs state
  const [catalogLogs, setCatalogLogs] = useState<GlobalCatalogAuditLog[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogTotalCount, setCatalogTotalCount] = useState(0);
  const [catalogCurrentPage, setCatalogCurrentPage] = useState(1);
  const [catalogLogsPerPage] = useState(50);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [severityFilter, setSeverityFilter] = useState<AuditLogSeverity | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<AuditLogEvent | 'all'>('all');
  const [catalogActionFilter, setCatalogActionFilter] = useState<'all' | 'CREATE' | 'UPDATE' | 'DELETE'>('all');
  const [catalogEntityFilter, setCatalogEntityFilter] = useState<'all' | 'PRODUCT' | 'CATEGORY'>('all');
  const [barFilter, setBarFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [uniqueBars, setUniqueBars] = useState<Bar[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedCatalogLogId, setExpandedCatalogLogId] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const systemTotalPages = Math.ceil(totalCount / logsPerPage);
  const catalogTotalPages = Math.ceil(catalogTotalCount / catalogLogsPerPage);

  const totalPages = Math.ceil(totalCount / logsPerPage);

  const loadLogs = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await AdminService.getPaginatedAuditLogs({
        page: currentPage,
        limit: logsPerPage,
        searchQuery: debouncedSearchQuery,
        severityFilter,
        eventFilter: eventFilter === 'all' ? undefined : eventFilter,
        barFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setLogs(data.logs);
      setTotalCount(data.totalCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des logs';
      setError(message);
      console.error('Erreur chargement des logs:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, logsPerPage, debouncedSearchQuery, severityFilter, eventFilter, barFilter, startDate, endDate]);

  const loadCatalogLogs = useCallback(async () => {
    try {
      setError(null);
      setCatalogLoading(true);
      const data = await AdminService.getPaginatedGlobalCatalogAuditLogs({
        page: catalogCurrentPage,
        limit: catalogLogsPerPage,
        searchQuery: debouncedSearchQuery,
        actionFilter: catalogActionFilter === 'all' ? undefined : catalogActionFilter,
        entityFilter: catalogEntityFilter === 'all' ? undefined : catalogEntityFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setCatalogLogs(data.logs);
      setCatalogTotalCount(data.totalCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des logs du catalogue';
      setError(message);
      console.error('Erreur chargement des logs du catalogue:', error);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogCurrentPage, catalogLogsPerPage, debouncedSearchQuery, catalogActionFilter, catalogEntityFilter, startDate, endDate]);

  useEffect(() => {
    if (activeTab === 'system') {
      loadLogs();
    } else {
      loadCatalogLogs();
    }
  }, [activeTab, loadLogs, loadCatalogLogs]);

  useEffect(() => {
    setCurrentPage(1);
    setCatalogCurrentPage(1);
  }, [debouncedSearchQuery, severityFilter, eventFilter, barFilter, startDate, endDate]);

  useEffect(() => {
    AdminService.getUniqueBars().then(data => setUniqueBars(data as any)).catch(err => console.error('Erreur chargement bars:', err));
  }, []);

  const formatDate = (date: Date | string) => {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(date));
  };

  const getSeverityIcon = (severity: AuditLogSeverity) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: AuditLogSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-orange-50 border-orange-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date/Heure', 'Event', 'Sévérité', 'Description', 'Utilisateur', 'Bar'];
    const rows = logs.map(log => [
      formatDate(log.timestamp),
      log.event,
      log.severity,
      `"${(log.description || '').replace(/"/g, '""')}"`,
      `"${log.user_name.replace(/"/g, '""')}"`,
      log.bar_name ? `"${log.bar_name.replace(/"/g, '""')}"` : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <AdminPanelErrorBoundary fallbackTitle="Erreur dans la gestion des logs d'audit">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 md:p-6 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Audit Logs</h1>
              <p className="text-indigo-100 text-sm">Historique complet des actions système</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-white">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-4 md:px-6 py-3 font-medium text-sm md:text-base transition-colors border-b-2 ${
              activeTab === 'system'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Logs Système
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-4 md:px-6 py-3 font-medium text-sm md:text-base transition-colors border-b-2 ${
              activeTab === 'catalog'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="w-4 h-4" />
            Catalogue Global
          </button>
        </div>

        {/* Filtres */}
        <div className="p-2 md:p-4 bg-gray-50 border-b">
          <div className="flex gap-2 md:gap-3 flex-wrap mb-2 md:mb-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 w-4 md:w-5 h-4 md:h-5 text-gray-600" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {activeTab === 'system' ? (
              <>
                {/* Severity Filter */}
                <select
                  value={severityFilter}
                  onChange={e => setSeverityFilter(e.target.value as AuditLogSeverity | 'all')}
                  className="px-3 md:px-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Toutes sévérités</option>
                  <option value="critical">🔴 Critiques</option>
                  <option value="warning">🟠 Warnings</option>
                  <option value="info">🔵 Info</option>
                </select>

                {/* Event Filter */}
                <select
                  value={eventFilter}
                  onChange={e => setEventFilter(e.target.value as AuditLogEvent | 'all')}
                  className="px-3 md:px-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tous les événements</option>
                  <option value="login">Connexion</option>
                  <option value="logout">Déconnexion</option>
                  <option value="create">Création</option>
                  <option value="update">Mise à jour</option>
                  <option value="delete">Suppression</option>
                </select>

                {/* Bar Filter */}
                {uniqueBars.length > 0 && (
                  <select
                    value={barFilter}
                    onChange={e => setBarFilter(e.target.value)}
                    className="px-3 md:px-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tous les bars</option>
                    <option value="system">Système</option>
                    {uniqueBars.map(bar => (
                      <option key={bar.id} value={bar.id}>{bar.name}</option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <>
                {/* Action Filter for Catalog */}
                <select
                  value={catalogActionFilter}
                  onChange={e => setCatalogActionFilter(e.target.value as 'all' | 'CREATE' | 'UPDATE' | 'DELETE')}
                  className="px-3 md:px-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Toutes les actions</option>
                  <option value="CREATE">➕ Création</option>
                  <option value="UPDATE">✏️ Modification</option>
                  <option value="DELETE">🗑️ Suppression</option>
                </select>

                {/* Entity Type Filter for Catalog */}
                <select
                  value={catalogEntityFilter}
                  onChange={e => setCatalogEntityFilter(e.target.value as 'all' | 'PRODUCT' | 'CATEGORY')}
                  className="px-3 md:px-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tous les types</option>
                  <option value="PRODUCT">📦 Produit</option>
                  <option value="CATEGORY">📂 Catégorie</option>
                </select>
              </>
            )}
          </div>

          {/* Bouton Filtres avancés (mobile) */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="md:hidden w-full flex items-center justify-between px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtres avancés
            </span>
            {showAdvancedFilters ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Date Range + Export */}
          <div className={`${showAdvancedFilters ? 'flex' : 'hidden'} md:flex gap-3 flex-wrap items-center mt-2 md:mt-0`}>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Calendar className="w-4 md:w-5 h-4 md:h-5 text-gray-600" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="flex-1 md:flex-none px-2 md:px-3 py-1.5 md:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <span className="hidden md:inline text-gray-500 text-sm">au</span>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="flex-1 md:flex-none px-2 md:px-3 py-1.5 md:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-gray-600 hover:text-gray-800 underline w-full md:w-auto"
              >
                Réinitialiser dates
              </button>
            )}

            <div className="hidden md:block flex-1"></div>

            {/* Export Button */}
            {activeTab === 'system' && (
              <button
                onClick={handleExportCSV}
                disabled={logs.length === 0}
                className="flex-1 md:flex-none px-3 md:px-4 py-1.5 md:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span> CSV
              </button>
            )}
          </div>

          <div className="mt-2 md:mt-3 text-xs md:text-sm text-gray-600">
            <span className="font-semibold text-indigo-700">{activeTab === 'system' ? totalCount : catalogTotalCount}</span> log{activeTab === 'system' ? totalCount : catalogTotalCount > 1 ? 's' : ''} trouvé{activeTab === 'system' ? totalCount : catalogTotalCount > 1 ? 's' : ''}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 border-b bg-white">
            <Alert variant="destructive" title="Erreur de chargement">
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={() => loadLogs()}
                  className="ml-4 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded-md font-medium transition-colors"
                >
                  Réessayer
                </button>
              </div>
            </Alert>
          </div>
        )}

        {/* Liste des logs */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {activeTab === 'system' ? (
            <>
              {loading && logs.length === 0 ? (
                <AdminPanelSkeleton count={5} type="table" />
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 p-4">
                  <Info className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="font-medium">Aucun log trouvé</p>
                  <p className="text-sm">Essayez de modifier les filtres</p>
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {logs.map(log => (
                    <div
                      key={log.id}
                      className={`border-2 rounded-lg overflow-hidden ${getSeverityColor(log.severity)}`}
                    >
                      <div
                        className="p-3 cursor-pointer hover:bg-black/5 transition-colors"
                        onClick={() =>
                          setExpandedLogId(expandedLogId === log.id ? null : log.id)
                        }
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getSeverityIcon(log.severity)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-semibold bg-black/10 px-2 py-0.5 rounded">
                                    {log.event}
                                  </span>
                                  <span className="text-xs text-gray-600">
                                    {formatDate(log.timestamp)}
                                  </span>
                                </div>
                                <p className="font-medium mt-1">{log.description}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                  <span>👤 {log.user_name}</span>
                                  {log.bar_name && <span>🏢 {log.bar_name}</span>}
                                </div>
                              </div>

                              <button className="flex-shrink-0 p-1 hover:bg-black/10 rounded">
                                {expandedLogId === log.id ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {catalogLoading && catalogLogs.length === 0 ? (
                <AdminPanelSkeleton count={5} type="table" />
              ) : catalogLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 p-4">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="font-medium">Aucun log du catalogue trouvé</p>
                  <p className="text-sm">Essayez de modifier les filtres</p>
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {catalogLogs.map(log => (
                    <div
                      key={log.id}
                      className="border-2 border-purple-200 rounded-lg overflow-hidden bg-purple-50"
                    >
                      <div
                        className="p-3 cursor-pointer hover:bg-black/5 transition-colors"
                        onClick={() =>
                          setExpandedCatalogLogId(expandedCatalogLogId === log.id ? null : log.id)
                        }
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {log.action === 'CREATE' && <span className="text-2xl">➕</span>}
                            {log.action === 'UPDATE' && <span className="text-2xl">✏️</span>}
                            {log.action === 'DELETE' && <span className="text-2xl">🗑️</span>}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-semibold bg-purple-200 text-purple-900 px-2 py-0.5 rounded">
                                    {log.entityType}
                                  </span>
                                  <span className="font-mono text-xs font-semibold bg-purple-300 text-purple-900 px-2 py-0.5 rounded">
                                    {log.action}
                                  </span>
                                  <span className="text-xs text-gray-600">
                                    {formatDate(log.createdAt)}
                                  </span>
                                </div>
                                <p className="font-medium mt-1">{log.entityName}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                  <span>👤 {log.modifiedByName || log.modifiedBy}</span>
                                </div>
                              </div>

                              <button className="flex-shrink-0 p-1 hover:bg-black/10 rounded">
                                {expandedCatalogLogId === log.id ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            {expandedCatalogLogId === log.id && (
                              <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-gray-700">
                                <p><strong>ID:</strong> {log.entityId}</p>
                                {log.oldValues && (
                                  <p className="mt-2"><strong>Anciennes valeurs:</strong> {JSON.stringify(log.oldValues)}</p>
                                )}
                                {log.newValues && (
                                  <p className="mt-2"><strong>Nouvelles valeurs:</strong> {JSON.stringify(log.newValues)}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {activeTab === 'system' ? (
          systemTotalPages > 1 && (
            <div className="p-4 bg-white border-t flex items-center justify-between rounded-b-2xl">
              <p className="text-sm text-gray-600">Page {currentPage} sur {systemTotalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(systemTotalPages, p + 1))}
                  disabled={currentPage === systemTotalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              </div>
            </div>
          )
        ) : (
          catalogTotalPages > 1 && (
            <div className="p-4 bg-white border-t flex items-center justify-between rounded-b-2xl">
              <p className="text-sm text-gray-600">Page {catalogCurrentPage} sur {catalogTotalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCatalogCurrentPage(p => Math.max(1, p - 1))}
                  disabled={catalogCurrentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setCatalogCurrentPage(p => Math.min(catalogTotalPages, p + 1))}
                  disabled={catalogCurrentPage === catalogTotalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              </div>
            </div>
          )
        )}
      </AdminPanelErrorBoundary>
    </div>
  );
}
