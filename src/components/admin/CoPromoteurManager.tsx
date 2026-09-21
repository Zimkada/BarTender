// components/admin/CoPromoteurManager.tsx
// Nomination / retrait du rôle co_promoteur - Phase 2 (21/09/2026).
// Voir docs/roadmaps/PLAN_CO_PROMOTEUR_PHASE2.md §3.

import { useMemo, useState } from 'react';
import { Crown, UserMinus, UserPlus, Users } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Alert } from '../ui/Alert';
import { Bar, BarMember, User } from '../../types';
import { CoPromoteurService } from '../../services/supabase/coPromoteur.service';
import { auditLogger } from '../../services/AuditLogger';

interface CoPromoteurManagerProps {
  bar: Bar;
  members: Array<BarMember & { user: User }>;
  onClose: () => void;
  /** Rafraîchit la liste des membres après une nomination/retrait réussi. */
  onMembersChanged: () => void;
}

export const CoPromoteurManager: React.FC<CoPromoteurManagerProps> = ({
  bar,
  members,
  onClose,
  onMembersChanged,
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /**
   * ⛔ Éligibles = GÉRANTS actifs uniquement.
   *
   * Le RPC add_co_promoteur refuse un serveur (promotion directe interdite,
   * cf. plan §3.3) : le trigger trg_sync_server_mapping ferait un DELETE de
   * server_name_mappings, anonymisant rétroactivement les bons de commande
   * ouverts du serveur promu. Chemin imposé : serveur → gérant (page Équipe)
   * → co-promoteur.
   *
   * Ne pas se contenter de laisser le RPC refuser : proposer un serveur dans
   * la liste puis afficher son message d'erreur serait un bouton actif pour
   * une action qui échoue - exactement le défaut corrigé 4 fois en phase 1.
   */
  const eligibleManagers = useMemo(
    () => members.filter((m) => m.isActive && m.role === 'gerant'),
    [members]
  );

  const currentCoPromoteurs = useMemo(
    () => members.filter((m) => m.isActive && m.role === 'co_promoteur'),
    [members]
  );

  const handleAdd = async () => {
    if (!selectedUserId) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await CoPromoteurService.addCoPromoteur(bar.id, selectedUserId);

    if (!result.success) {
      setError(result.error || 'Échec de la nomination.');
      setLoading(false);
      return;
    }

    // ⭐ A2 du plan - trg_audit_member_change ne réagit qu'à INSERT/DELETE,
    // jamais à UPDATE (le mécanisme réel de add_co_promoteur). Sans cet
    // appel explicite, la nomination ne laisse AUCUNE trace dans l'audit.
    auditLogger.log({
      event: 'MEMBER_ADDED',
      severity: 'critical',
      barId: bar.id,
      barName: bar.name,
      description: `${result.user_name || 'Un membre'} nommé co-promoteur de ${bar.name}`,
      metadata: {
        target_user_id: selectedUserId,
        target_user_name: result.user_name,
        previous_role: result.previous_role,
        new_role: 'co_promoteur',
      },
      relatedEntityId: selectedUserId,
      relatedEntityType: 'user',
    });

    setSuccess(result.message || 'Co-promoteur nommé.');
    setSelectedUserId('');
    setLoading(false);
    onMembersChanged();
  };

  const handleRemove = async (member: BarMember & { user: User }) => {
    if (!confirm(`Retirer ${member.user.name} du rôle de co-promoteur ?`)) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await CoPromoteurService.removeCoPromoteur(bar.id, member.userId);

    if (!result.success) {
      setError(result.error || 'Échec du retrait.');
      setLoading(false);
      return;
    }

    auditLogger.log({
      event: 'MEMBER_REMOVED',
      severity: 'warning',
      barId: bar.id,
      barName: bar.name,
      description: `${result.user_name || member.user.name} retiré du rôle de co-promoteur de ${bar.name}`,
      metadata: {
        target_user_id: member.userId,
        target_user_name: result.user_name || member.user.name,
        previous_role: 'co_promoteur',
      },
      relatedEntityId: member.userId,
      relatedEntityType: 'user',
    });

    setSuccess(result.message || 'Co-promoteur retiré.');
    setLoading(false);
    onMembersChanged();
  };

  return (
    <Modal
      open
      // ⛔ Empêche la fermeture pendant un appel RPC en cours : sans ça, un
      // clic sur l'overlay, ESC ou le bouton X pendant handleAdd/handleRemove
      // démonterait le composant avant le setState qui suit l'await,
      // produisant un "Can't perform a React state update on an unmounted
      // component". closeOnOverlayClick/closeOnEsc ne couvrent PAS le bouton
      // X du header (Modal.tsx:176 appelle onClose directement) - d'où le
      // garde ici aussi, pas seulement sur les deux props ci-dessous.
      onClose={() => !loading && onClose()}
      title={`Co-promoteurs - ${bar.name}`}
      icon={<Crown className="w-5 h-5" />}
      size="lg"
      closeOnOverlayClick={!loading}
      closeOnEsc={!loading}
    >
      <div className="space-y-6">
        {error && <Alert variant="destructive">{error}</Alert>}
        {/* variant="success" et non "default" : un rendu neutre sur une
            nomination reussie laisse douter qu'elle ait abouti, et invite a
            rejouer une action a fort enjeu (acces salaires et comptabilite). */}
        {success && <Alert variant="success">{success}</Alert>}

        {/* Co-promoteurs actuels */}
        <section>
          <h3 className="text-sm font-semibold text-foreground/70 mb-2 flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            Co-promoteurs actuels ({currentCoPromoteurs.length})
          </h3>
          {currentCoPromoteurs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aucun co-promoteur sur ce bar.
            </p>
          ) : (
            <ul className="space-y-2">
              {currentCoPromoteurs.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.user.name}</p>
                    <p className="text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(m)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700 disabled:opacity-50 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                    title="Retirer"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Nomination */}
        <section>
          <h3 className="text-sm font-semibold text-foreground/70 mb-2 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" />
            Nommer un co-promoteur
          </h3>
          {eligibleManagers.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aucun gérant actif sur ce bar. Cet écran ne propose que les
              gérants : un serveur doit d'abord être promu gérant depuis la
              gestion d'équipe du bar, sans quoi ses bons de commande ouverts
              seraient anonymisés. Pour nommer une personne qui n'est pas
              encore membre, ajoutez-la d'abord comme gérante.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={loading}
                  options={[
                    { value: '', label: 'Sélectionner un gérant…' },
                    ...eligibleManagers.map((m) => ({
                      value: m.userId,
                      label: `${m.user.name} (${m.user.email})`,
                    })),
                  ]}
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={!selectedUserId || loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {loading ? 'Nomination…' : 'Nommer'}
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Le co-promoteur pourra agir sur ce bar (ventes, dépenses, comptabilité,
            salaires) en l'absence du promoteur. La nomination reste réservée au
            SuperAdmin ; le retrait est aussi accessible au promoteur du bar.
          </p>
        </section>
      </div>
    </Modal>
  );
};

CoPromoteurManager.displayName = 'CoPromoteurManager';
