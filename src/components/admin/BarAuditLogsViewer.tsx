import React, { useState, useEffect } from 'react';
import { History, Loader, X, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BarAuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'SUSPEND' | 'ACTIVATE' | 'DELETE';
  bar_id: string;
  bar_name: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  modified_by: string | null;
  modified_by_name: string | null;
  created_at: string;
}

interface BarAuditLogsViewerProps {
  barId?: string; // Si fourni, filtre pour un bar spécifique
  limit?: number;
}

export const BarAuditLogsViewer: React.FC<BarAuditLogsViewerProps> = ({
  barId,
  limit = 50
}) => {
  const [logs, setLogs] = useState<BarAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLogs();
  }, [barId, limit]);

  const loadAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_get_bar_audit_logs', {
        p_bar_id: barId || null,
        p_limit: limit,
        p_offset: 0
      });

      if (rpcError) throw rpcError;

      setLogs(data || []);
    } catch (err: any) {
      console.error('Error loading audit logs:', err);
      setError(err.message || 'Impossible de charger les logs d\'audit');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: BarAuditLog['action']) => {
    const styles = {
      CREATE: 'bg-green-100 text-green-700',
      UPDATE: 'bg-blue-100 text-blue-700',
      SUSPEND: 'bg-red-100 text-red-700',
      ACTIVATE: 'bg-green-100 text-green-700',
      DELETE: 'bg-gray-100 text-gray-700'
    };

    const labels = {
      CREATE: 'Création',
      UPDATE: 'Modification',
      SUSPEND: 'Suspension',
      ACTIVATE: 'Activation',
      DELETE: 'Suppression'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[action]}`}>
        {labels[action]}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const renderChanges = (log: BarAuditLog) => {
    if (!log.old_values && !log.new_values) return null;

    const oldVals = log.old_values || {};
    const newVals = log.new_values || {};

    // Comparer les valeurs
    const changedKeys = Array.from(
      new Set([...Object.keys(oldVals), ...Object.keys(newVals)])
    ).filter(key => {
      const oldVal = oldVals[key];
      const newVal = newVals[key];
      return JSON.stringify(oldVal) !== JSON.stringify(newVal);
    });

    if (changedKeys.length === 0) return null;

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs space-y-2">
        <div className="font-semibold text-gray-700">Modifications:</div>
        {changedKeys.map(key => (
          <div key={key} className="flex items-start gap-2">
            <span className="font-medium text-gray-600 min-w-[100px]">{key}:</span>
            <div className="flex-1 space-y-1">
              {oldVals[key] !== undefined && (
                <div className="text-red-600">
                  <span className="font-medium">Avant: </span>
                  {JSON.stringify(oldVals[key])}
                </div>
              )}
              {newVals[key] !== undefined && (
                <div className="text-green-600">
                  <span className="font-medium">Après: </span>
                  {JSON.stringify(newVals[key])}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Chargement des logs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800">Erreur</div>
          <div className="text-sm text-red-600">{error}</div>
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Aucun log d'audit disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <History className="w-5 h-5" />
          Historique d'audit {barId ? 'du bar' : 'global'}
        </h3>
        <button
          onClick={loadAuditLogs}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Actualiser
        </button>
      </div>

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {getActionBadge(log.action)}
                  <span className="font-semibold text-gray-800">{log.bar_name}</span>
                </div>

                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    Par: <span className="font-medium">{log.modified_by_name || 'Système'}</span>
                  </div>
                  <div>
                    Date: <span className="font-medium">{formatDate(log.created_at)}</span>
                  </div>
                </div>

                {expandedLogId === log.id && renderChanges(log)}
              </div>

              {(log.old_values || log.new_values) && (
                <button
                  onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium flex-shrink-0"
                >
                  {expandedLogId === log.id ? 'Masquer' : 'Détails'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {logs.length >= limit && (
        <div className="text-center text-sm text-gray-500 pt-2">
          Affichage limité aux {limit} dernières entrées
        </div>
      )}
    </div>
  );
};

// Modal wrapper pour afficher les logs dans une modal
interface BarAuditLogsModalProps {
  barId?: string;
  onClose: () => void;
}

export const BarAuditLogsModal: React.FC<BarAuditLogsModalProps> = ({ barId, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <History className="w-6 h-6" />
            Historique d'audit des bars
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <BarAuditLogsViewer barId={barId} limit={100} />
        </div>
      </div>
    </div>
  );
};
