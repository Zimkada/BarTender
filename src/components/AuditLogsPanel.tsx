// components/AuditLogsPanel.tsx - Interface pour visualiser les audit logs
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Search,
  Filter,
  Download,
  Calendar,
  AlertTriangle,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { auditLogger } from '../services/AuditLogger';
import type { AuditLog, AuditLogEvent, AuditLogSeverity } from '../types';

interface AuditLogsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuditLogsPanel({ isOpen, onClose }: AuditLogsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AuditLogSeverity | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<AuditLogEvent | 'all'>('all');
  const [barFilter, setBarFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 50;

  // Date range filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Mobile advanced filters toggle
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Récupérer tous les logs
  const allLogs = useMemo(() => auditLogger.getAllLogs(), []);

  // Extraire la liste unique des bars
  const uniqueBars = useMemo(() => {
    const bars = allLogs
      .filter(log => log.barId && log.barName)
      .map(log => ({ id: log.barId!, name: log.barName! }));

    // Dédupliquer par barId
    const uniqueMap = new Map(bars.map(bar => [bar.id, bar]));
    return Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allLogs]);

  // Compter les logs système (sans barId)
  const systemLogsCount = useMemo(() => {
    return allLogs.filter(log => !log.barId).length;
  }, [allLogs]);

  // Filtrer les logs
  const filteredLogs = useMemo(() => {
    let logs = allLogs;

    // Filtre recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      logs = logs.filter(
        log =>
          log.description.toLowerCase().includes(query) ||
          log.userName.toLowerCase().includes(query) ||
          log.barName?.toLowerCase().includes(query)
      );
    }

    // Filtre severity
    if (severityFilter !== 'all') {
      logs = logs.filter(log => log.severity === severityFilter);
    }

    // Filtre event
    if (eventFilter !== 'all') {
      logs = logs.filter(log => log.event === eventFilter);
    }

    // Filtre bar
    if (barFilter !== 'all') {
      if (barFilter === 'system') {
        // Logs système (super admin) = logs sans barId
        logs = logs.filter(log => !log.barId);
      } else {
        // Logs d'un bar spécifique
        logs = logs.filter(log => log.barId === barFilter);
      }
    }

    // Filtre date range
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      logs = logs.filter(log => new Date(log.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      logs = logs.filter(log => new Date(log.timestamp) <= end);
    }

    return logs;
  }, [allLogs, searchQuery, severityFilter, eventFilter, barFilter, startDate, endDate]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * logsPerPage;
    return filteredLogs.slice(start, start + logsPerPage);
  }, [filteredLogs, currentPage]);

  // Stats
  const stats = useMemo(() => auditLogger.getStats(), []);

  // Export logs JSON
  const handleExportJSON = () => {
    const exported = auditLogger.exportLogs();
    const blob = new Blob([exported], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export logs CSV (filtered)
  const handleExportCSV = () => {
    // CSV headers
    const headers = ['Date/Heure', 'Event', 'Sévérité', 'Description', 'Utilisateur', 'Rôle', 'Bar', 'IP', 'User Agent'];

    // Convert filtered logs to CSV rows
    const rows = filteredLogs.map(log => [
      formatDate(log.timestamp),
      log.event,
      log.severity,
      `"${log.description.replace(/"/g, '""')}"`, // Escape quotes
      `"${log.userName.replace(/"/g, '""')}"`,
      log.userRole,
      log.barName ? `"${log.barName.replace(/"/g, '""')}"` : '',
      log.metadata?.ipAddress || '',
      log.metadata?.userAgent ? `"${log.metadata.userAgent.replace(/"/g, '""')}"` : ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and download CSV
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Icône severity
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

  // Couleur severity
  const getSeverityColor = (severity: AuditLogSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'warning':
        return 'bg-orange-50 border-orange-200 text-orange-900';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-900';
    }
  };

  // Format date
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(date));
  };

  // Unique event types pour filtre
  const uniqueEvents = useMemo(() => {
    const events = new Set(allLogs.map(log => log.event));
    return Array.from(events).sort();
  }, [allLogs]);

  if (!isOpen) return null;

  return (
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
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3 md:p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg md:text-2xl font-bold">Audit Logs</h2>
              <p className="text-indigo-100 text-xs md:text-sm mt-0.5 md:mt-1 hidden md:block">
                Historique complet des actions système
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Stats rapides - Compactes sur mobile */}
          <div className="grid grid-cols-4 gap-2 md:gap-3 mt-2 md:mt-4">
            <div className="bg-white/10 rounded-lg p-2 md:p-3">
              <p className="text-indigo-100 text-[10px] md:text-xs">Total</p>
              <p className="text-base md:text-2xl font-bold">{stats.totalLogs}</p>
            </div>
            <div className="bg-red-500/20 rounded-lg p-2 md:p-3">
              <p className="text-red-100 text-[10px] md:text-xs">Critiques</p>
              <p className="text-base md:text-2xl font-bold">{stats.criticalCount}</p>
            </div>
            <div className="bg-orange-500/20 rounded-lg p-2 md:p-3">
              <p className="text-orange-100 text-[10px] md:text-xs">Warnings</p>
              <p className="text-base md:text-2xl font-bold">{stats.warningCount}</p>
            </div>
            <div className="bg-blue-500/20 rounded-lg p-2 md:p-3">
              <p className="text-blue-100 text-[10px] md:text-xs">Info</p>
              <p className="text-base md:text-2xl font-bold">{stats.infoCount}</p>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="p-2 md:p-4 bg-gray-50 border-b">
          {/* Ligne 1: Recherche + Filtres */}
          <div className="flex gap-2 md:gap-3 flex-wrap mb-2 md:mb-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 w-4 md:w-5 h-4 md:h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Toutes severités</option>
              <option value="critical">🔴 Critiques</option>
              <option value="warning">🟠 Warnings</option>
              <option value="info">🔵 Info</option>
            </select>

            {/* Event Filter */}
            <select
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous les events</option>
              {uniqueEvents.map(event => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
          </div>

          {/* Bouton Filtres avancés (mobile uniquement) */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="md:hidden w-full flex items-center justify-between px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtres avancés & Export
            </span>
            {showAdvancedFilters ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Ligne 2: Date Range + Bar Filter + Export Buttons - Toujours visible sur desktop, collapsible sur mobile */}
          <div className={`${showAdvancedFilters ? 'flex' : 'hidden'} md:flex gap-3 flex-wrap items-center mt-2 md:mt-0`}>
            {/* Bar Filter */}
            {(uniqueBars.length > 0 || systemLogsCount > 0) && (
              <select
                value={barFilter}
                onChange={e => setBarFilter(e.target.value)}
                className="px-2 md:px-3 py-1.5 md:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm w-full md:w-auto"
              >
                <option value="all">Tous les logs</option>
                {systemLogsCount > 0 && (
                  <option value="system">🔧 Logs système ({systemLogsCount})</option>
                )}
                {uniqueBars.length > 0 && (
                  <optgroup label="Bars">
                    {uniqueBars.map(bar => (
                      <option key={bar.id} value={bar.id}>
                        {bar.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}

            {/* Start Date */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Calendar className="w-4 md:w-5 h-4 md:h-5 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="flex-1 md:flex-none px-2 md:px-3 py-1.5 md:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                placeholder="Date début"
              />
            </div>

            {/* End Date */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-gray-500 text-sm">au</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="flex-1 md:flex-none px-2 md:px-3 py-1.5 md:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                placeholder="Date fin"
              />
            </div>

            {/* Clear filters */}
            {(startDate || endDate || barFilter !== 'all') && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setBarFilter('all');
                }}
                className="px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-gray-600 hover:text-gray-800 underline w-full md:w-auto"
              >
                Réinitialiser
              </button>
            )}

            <div className="hidden md:block flex-1"></div>

            {/* Export Buttons */}
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="flex-1 md:flex-none px-3 md:px-4 py-1.5 md:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              title="Exporter les logs filtrés en CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span> CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="flex-1 md:flex-none px-3 md:px-4 py-1.5 md:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm"
              title="Exporter tous les logs en JSON"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span> JSON
            </button>
          </div>

          {/* Résultats filtrés */}
          <div className="mt-2 md:mt-3 text-xs md:text-sm text-gray-600">
            <span className="font-semibold text-indigo-700">{filteredLogs.length}</span> log
            {filteredLogs.length > 1 ? 's' : ''} affiché{filteredLogs.length > 1 ? 's' : ''}
            {filteredLogs.length !== allLogs.length && (
              <span className="text-gray-500"> sur {allLogs.length} au total</span>
            )}
          </div>
        </div>

        {/* Liste des logs */}
        <div className="flex-1 overflow-y-auto p-4">
          {paginatedLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Info className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="font-medium">Aucun log trouvé</p>
              <p className="text-sm">Essayez de modifier les filtres</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedLogs.map(log => (
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
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getSeverityIcon(log.severity)}
                      </div>

                      {/* Content */}
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
                              <span>👤 {log.userName} ({log.userRole})</span>
                              {log.barName && <span>🏢 {log.barName}</span>}
                            </div>
                          </div>

                          {/* Expand icon */}
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

                    {/* Expanded details */}
                    {expandedLogId === log.id && log.metadata && (
                      <div className="mt-3 pt-3 border-t border-current/20">
                        <p className="text-xs font-semibold mb-2">Métadonnées:</p>
                        <pre className="text-xs bg-black/10 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 bg-gray-50 border-t flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Page {currentPage} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
