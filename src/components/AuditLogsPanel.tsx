// components/AuditLogsPanel.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import {
  X, Search, Filter, Download, Calendar, AlertTriangle, Info, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import { AdminService } from '../services/supabase/admin.service';
import type { AuditLog, AuditLogEvent, AuditLogSeverity, Bar } from '../types';
import { Alert } from './ui/Alert';
import { Select } from './ui/Select';

interface AuditLogsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuditLogsPanel({ isOpen, onClose }: AuditLogsPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(50);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [severityFilter, setSeverityFilter] = useState<AuditLogSeverity | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<AuditLogEvent | 'all'>('all');
  const [barFilter, setBarFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [uniqueBars, setUniqueBars] = useState<Bar[]>([]);
  const [uniqueEvents, setUniqueEvents] = useState<string[]>([]); // Pour le filtre
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const totalPages = Math.ceil(totalCount / logsPerPage);

  const loadLogs = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
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
      console.error('Erreur chargement des logs:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, currentPage, logsPerPage, debouncedSearchQuery, severityFilter, eventFilter, barFilter, startDate, endDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, severityFilter, eventFilter, barFilter, startDate, endDate]);

  useEffect(() => {
    if (isOpen) {
      AdminService.getPaginatedBars({ page: 1, limit: 1000 }).then(data => setUniqueBars(data.bars));
      // Idéalement, il faudrait une RPC pour obtenir les types d'événements uniques.
      // Pour l'instant, on peut les coder en dur ou les laisser se remplir dynamiquement.
    }
  }, [isOpen]);

  const formatDate = (date: Date) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(date));
  const getSeverityIcon = (severity: AuditLogSeverity) => { /* ... */ };
  const getSeverityColor = (severity: AuditLogSeverity) => { /* ... */ };

  const handleExportCSV = () => { /* ... (adapter pour utiliser 'logs' au lieu de 'filteredLogs') ... */ };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3 md:p-6 text-white">
            {/* ... (Header JSX) ... */}
          </div>
          {/* Filtres */}
          <div className="p-2 md:p-4 bg-gray-50 border-b">
            {/* ... (Filtres JSX) ... */}
            <div className="mt-2 md:mt-3 text-xs md:text-sm text-gray-600">
              <span className="font-semibold text-indigo-700">{totalCount}</span> log{totalCount > 1 ? 's' : ''} trouvé{totalCount > 1 ? 's' : ''}
            </div>
          </div>
          {/* Liste des logs */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
                <div className="text-center py-12"><p>Chargement...</p></div>
            ) : logs.length === 0 ? (
              <Alert show={true} variant="info" className="py-12">
                <p className="font-medium">Aucun log trouvé</p>
                <p className="text-sm">Essayez de modifier les filtres</p>
              </Alert>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className={`border-2 rounded-lg overflow-hidden ${getSeverityColor(log.severity)}`}>
                    {/* ... (Log item JSX) ... */}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 bg-gray-50 border-t flex items-center justify-between">
              <p className="text-sm text-gray-600">Page {currentPage} sur {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50">Précédent</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50">Suivant</button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
