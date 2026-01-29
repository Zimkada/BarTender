import React, { useState, useEffect } from 'react';
import { Trash2, Plus, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { Input } from './ui/Input';
import { Select, SelectOption } from './ui/Select';
import { Alert } from './ui/Alert';

interface ServerMapping {
  serverName: string;
  userId: string | null;
  userName?: string; // Display name from users table
}

interface ServerMappingsManagerProps {
  barId: string;
  barMembers: Array<{ userId: string; name: string; role: string }>;
  enabled?: boolean; // Only show if feature flag enabled
}

/**
 * ServerMappingsManager
 * Manages mappings between server names (simplified mode) and user UUIDs (full mode)
 * Used in SettingsPage to configure mode switching
 */
export function ServerMappingsManager({
  barId,
  barMembers,
  enabled = false
}: ServerMappingsManagerProps) {
  const [mappings, setMappings] = useState<ServerMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [newServerId, setNewServerId] = useState('');

  // Load mappings on mount
  useEffect(() => {
    loadMappings();
  }, [barId]);

  const loadMappings = async () => {
    try {
      setLoading(true);
      setError(null);
      const allMappings = await ServerMappingsService.getAllMappingsForBar(barId);

      // Enrich mappings with user names
      const enrichedMappings = allMappings.map(mapping => ({
        serverName: mapping.serverName,
        userId: mapping.userId,
        userName: barMembers.find(m => m.userId === mapping.userId)?.name || 'Inconnu'
      }));

      setMappings(enrichedMappings);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des mappings';
      setError(message);
      console.error('[ServerMappingsManager] Error loading mappings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoPopulate = async () => {
    try {
      setSaving(true);
      setError(null);

      const autoCreatedMappings = await ServerMappingsService.autoPopulateMappingsFromBarMembers(barId);

      if (autoCreatedMappings.length === 0) {
        setError('Aucun serveur actif trouvé pour auto-populer');
      } else {
        setSuccess(`${autoCreatedMappings.length} mapping(s) créé(s) automatiquement`);
        await loadMappings();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'auto-population';
      setError(message);
      console.error('[ServerMappingsManager] Error auto-populating mappings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMapping = async () => {
    if (!newServerName.trim() || !newServerId) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await ServerMappingsService.upsertServerMapping(barId, newServerName, newServerId);

      setSuccess(`Mapping créé: ${newServerName}`);
      setNewServerName('');
      setNewServerId('');
      await loadMappings();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du mapping';
      setError(message);
      console.error('[ServerMappingsManager] Error adding mapping:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMapping = async (serverName: string) => {
    if (!confirm(`Supprimer le mapping pour "${serverName}" ?`)) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await ServerMappingsService.deleteMapping(barId, serverName);

      setSuccess(`Mapping supprimé: ${serverName}`);
      await loadMappings();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression du mapping';
      setError(message);
      console.error('[ServerMappingsManager] Error removing mapping:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) {
    return null;
  }

  // Member options for select dropdown
  const memberOptions: SelectOption[] = [
    { value: '', label: 'Sélectionner un serveur...' },
    ...barMembers.map(member => ({
      value: member.userId,
      label: `${member.name} (${member.role})`
    }))
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Mappings Serveur (Mode Switching)
        </h3>
        <p className="text-sm text-gray-600">
          Associez les noms de serveurs du mode simplifié aux comptes du mode complet
        </p>
      </div>

      {error && (
        <Alert
          variant="error"
          icon={<AlertCircle size={16} />}
          title="Erreur"
          message={error}
        />
      )}

      {success && (
        <Alert
          variant="success"
          icon={<CheckCircle size={16} />}
          title="Succès"
          message={success}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader size={20} className="animate-spin text-brand-primary" />
          <span className="ml-2 text-gray-600">Chargement des mappings...</span>
        </div>
      ) : (
        <>
          {/* Auto-populate button */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="font-medium text-gray-800 mb-2">Création automatique</h4>
            <p className="text-sm text-gray-600 mb-3">
              Créez automatiquement les mappings à partir de vos serveurs actifs (membres avec le rôle "serveur")
            </p>
            <button
              onClick={handleAutoPopulate}
              disabled={saving}
              className="w-full h-10 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {saving && <Loader size={16} className="animate-spin" />}
              Auto-populer les mappings
            </button>
          </div>

          {/* Existing mappings */}
          {mappings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-800">Mappings existants</h4>
              <div className="space-y-2">
                {mappings.map(mapping => (
                  <div
                    key={mapping.serverName}
                    className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{mapping.serverName}</div>
                      <div className="text-sm text-gray-600">{mapping.userName}</div>
                    </div>
                    <button
                      onClick={() => handleRemoveMapping(mapping.serverName)}
                      disabled={saving}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new mapping */}
          <div className="bg-brand-subtle rounded-lg p-4 border border-brand-subtle">
            <h4 className="font-medium text-gray-800 mb-3">Ajouter un nouveau mapping</h4>
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="Nom du serveur (ex: Ahmed)"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                size="lg"
                disabled={saving}
              />

              <Select
                label="Associer à"
                options={memberOptions}
                value={newServerId}
                onChange={(e) => setNewServerId(e.target.value)}
                size="lg"
                disabled={saving}
              />

              <button
                onClick={handleAddMapping}
                disabled={saving || !newServerName.trim() || !newServerId}
                className="w-full h-10 bg-brand-primary text-white font-medium rounded-lg hover:brightness-110 transition-all disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-sm"
              >
                {saving && <Loader size={16} className="animate-spin" />}
                <Plus size={16} />
                Ajouter le mapping
              </button>
            </div>
          </div>

          {mappings.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              <p>Aucun mapping créé pour le moment</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
