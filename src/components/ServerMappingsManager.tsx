import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, Plus, AlertCircle, CheckCircle, Loader, User, MousePointerClick, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { networkManager } from '../services/NetworkManager';
import { OfflineStorage, type CachedMapping } from '../utils/offlineStorage';
import { Input } from './ui/Input';
import { Select, SelectOption } from './ui/Select';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import toast from 'react-hot-toast';

/**
 * Interface locale pour la gestion UI des mappings
 * Compatible avec CachedMapping pour éviter les conflits de cache
 */
interface ServerMapping {
  serverName: string;
  userId: string | null; // Null autorisé seulement pour l'UI (formulaire vide)
  userName?: string;
}

interface ServerMappingsManagerProps {
  barId: string;
  barMembers: Array<{ userId: string; name: string; role: string }>;
  enabled?: boolean; // Only show if feature flag enabled
}

/**
 * ServerMappingsManager - Refonte Vision 2026
 * Gère l'association entre les noms simplifiés et les comptes réels.
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

  // Load mappings on mount or when barId/barMembers change
  const loadMappings = useCallback(async () => {
    if (!barId) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Charger le cache offline pour une réponse immédiate
      const cachedMappings = OfflineStorage.getMappings(barId);
      if (cachedMappings) {
        setMappings(cachedMappings);
      }

      // 2. Vérifier si on tente le réseau
      const { shouldBlock } = networkManager.getDecision();
      if (shouldBlock) {
        if (!cachedMappings) {
          setError('Mode hors ligne : Aucun mapping en cache.');
        }
        setLoading(false);
        return;
      }

      const allMappings = await ServerMappingsService.getAllMappingsForBar(barId);

      // ✨ Enrichir avec userName pour affichage UI (compatible CachedMapping)
      // Note: BarContext peut aussi mettre à jour ce cache (sans userName).
      // C'est acceptable car userName est optionnel et sert uniquement à l'affichage.
      const enrichedMappings: CachedMapping[] = allMappings.map(mapping => ({
        serverName: mapping.serverName,
        userId: mapping.userId,
        userName: barMembers.find(m => m.userId === mapping.userId)?.name || 'Inconnu'
      }));

      setMappings(enrichedMappings);
      OfflineStorage.saveMappings(barId, enrichedMappings); // ✅ Cache compatible
    } catch (err) {
      const error = err as Error;
      console.error('[ServerMappingsManager] Error loading mappings:', error);
      if (error.message !== 'Aborted') {
        setError('Erreur lors du chargement des mappings.');
      }
    } finally {
      setLoading(false);
    }
  }, [barId, barMembers]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);




  const handleAutoPopulate = async () => {
    try {
      setSaving(true);
      setError(null);

      const autoCreatedMappings = await ServerMappingsService.autoPopulateMappingsFromBarMembers(barId);

      if (autoCreatedMappings.length === 0) {
        setError('Aucun serveur actif trouvé pour auto-populer');
      } else {
        setSuccess(`${autoCreatedMappings.length} mapping(s) créé(s) automatiquement`);
        toast.success('Synchronisation automatique réussie');
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
      toast.success(`Assigné: ${newServerName}`);
      setNewServerName('');
      setNewServerId('');
      await loadMappings();

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

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression du mapping';
      setError(message);
      console.error('[ServerMappingsManager] Error removing mapping:', err);
    } finally {
      setSaving(false);
    }
  };

  const memberOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Choisir un membre...' },
    ...barMembers.map(member => ({
      value: member.userId,
      label: `${member.name} (${member.role === 'gerant' ? 'Gérant' : 'Serveur'})`
    }))
  ], [barMembers]);

  if (!enabled) return null;

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="bg-brand-bg-subtle border border-brand-border rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl" />
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-brand-text mb-2 flex items-center gap-2">
            <Zap className="text-brand-primary" size={20} />
            Noms d'affichage pour les ventes
          </h3>
          <p className="text-sm text-gray-600 max-w-2xl leading-relaxed">
            Reliez les noms utilisés en <strong>Mode Simplifié</strong> (Noms de vente, Identifiants courts) aux comptes utilisateurs du <strong>Mode Complet</strong> pour garantir un suivi précis.
          </p>
        </div>
      </div>

      {error && (
        <Alert
          variant="destructive"
          icon={<AlertCircle size={18} />}
          className="rounded-xl border-red-100 shadow-sm"
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          variant="success"
          icon={<CheckCircle size={18} />}
          className="rounded-xl border-green-100 shadow-lg shadow-green-50 animate-in fade-in slide-in-from-top-2"
        >
          {success}
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader size={32} className="animate-spin text-brand-primary" />
          <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">Initialisation des configurations...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Main List */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <h4 className="font-bold text-gray-900 flex items-center gap-2">
                Noms d'affichage actifs
                <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">{mappings.length}</span>
              </h4>
              {mappings.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAutoPopulate}
                  disabled={saving}
                  className="text-xs text-brand-primary hover:bg-brand-subtle font-bold uppercase tracking-widest"
                >
                  {saving ? <Loader size={14} className="animate-spin mr-2" /> : <Zap size={14} className="mr-2" />}
                  Auto-Synchroniser
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence mode="popLayout">
                {mappings.length > 0 ? (
                  mappings.map((mapping, index) => (
                    <motion.div
                      key={mapping.serverName}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                      className="group flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 hover:border-brand-subtle hover:shadow-xl hover:shadow-brand-subtle/10 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-black text-lg shadow-lg group-hover:scale-110 transition-transform">
                          {mapping.serverName[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="font-black text-gray-900 text-base">{mapping.serverName}</h5>
                            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                          </div>
                          <div className="text-xs font-semibold text-gray-400 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1">
                            <span className="flex items-center gap-1"><User size={10} /> Lié à :</span>
                            <span className="text-brand-primary truncate max-w-[100px] sm:max-w-none">{mapping.userName}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMapping(mapping.serverName)}
                        disabled={saving}
                        className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        title="Supprimer l'assignation"
                      >
                        <Trash2 size={18} />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 px-6 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200 text-center"
                  >
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                      <MousePointerClick className="text-gray-300" size={32} />
                    </div>
                    <h5 className="font-bold text-gray-900 mb-1">Aucun nom de vente configuré</h5>
                    <p className="text-xs text-gray-500 max-w-xs mb-6">
                      Commencez par utiliser l'auto-synchronisation ou ajoutez manuellement vos noms de vente.
                    </p>
                    <Button
                      onClick={handleAutoPopulate}
                      disabled={saving}
                      className="shadow-lg shadow-brand-subtle btn-sm uppercase tracking-widest font-black"
                    >
                      {saving ? <Loader size={16} className="animate-spin mr-2" /> : <Zap size={16} className="mr-2" />}
                      Générer Automatiquement
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Sidebar: Add Form */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="font-bold text-gray-900 mb-2 px-1 text-sm uppercase tracking-widest opacity-60">Nouvel Ajout</h4>
            <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-dashed border-brand-border relative overflow-hidden flex flex-col shadow-inner">
              {/* Ticket Cutouts */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-50 rounded-full border-b border-gray-100" />
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-50 rounded-full border-t border-gray-100" />

              <div className="space-y-6 flex-1 py-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest pl-1">Nom du vendeur (Affichage Vente)</label>
                  <Input
                    type="text"
                    placeholder="ex: Ahmed ou Serveur 1"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    className="h-12 bg-gray-50 border-gray-200 focus:bg-white rounded-xl text-sm font-bold"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest pl-1">Compte Utilisateur Associé</label>
                  <Select
                    options={memberOptions}
                    value={newServerId}
                    onChange={(e) => setNewServerId(e.target.value)}
                    className="h-12 bg-gray-50 border-gray-200 rounded-xl text-sm font-bold"
                    disabled={saving}
                  />
                </div>

                <div className="pt-4">
                  <Button
                    onClick={handleAddMapping}
                    disabled={saving || !newServerName.trim() || !newServerId}
                    className="w-full h-14 rounded-2xl font-black uppercase tracking-wide sm:tracking-widest shadow-xl shadow-brand-subtle flex items-center justify-center gap-2 text-xs sm:text-sm"
                  >
                    {saving ? <Loader size={20} className="animate-spin" /> : <Plus size={20} />}
                    {saving ? 'Validation...' : 'Valider le Nom de Vente'}
                  </Button>
                </div>

                <div className="mt-6 flex items-start gap-3 bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/10">
                  <AlertCircle size={16} className="text-brand-primary mt-0.5 shrink-0" />
                  <p className="text-[10px] font-medium text-brand-text leading-relaxed">
                    <strong>Note :</strong> Lors du changement de mode, le système utilisera ces mappings pour attribuer automatiquement les ventes aux bons membres de l'équipe.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
