import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, Plus, Pencil, PowerOff, Users, Check } from 'lucide-react';
import toast from 'react-hot-toast';

import { useBarContext } from '../../context/BarContext';
import { useAppContext } from '../../context/AppContext';
import { useCounterContext } from '../../context/CounterContext';
import { useCounterMutations } from '../../hooks/mutations/useCounterMutations';
import { CountersService } from '../../services/supabase/counters.service';
import { CACHE_STRATEGY, QUERY_KEYS } from '../../lib/cache-strategy';
import { useMySubscription } from '../../hooks/useMySubscription';
import { getPlan } from '../../config/plans';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { getErrorMessage } from '../../utils/errorHandler';

/**
 * Gestion des comptoirs d'un bar (chantier comptoirs multiples, 07/10/2026).
 *
 * ⚠️ Réservé promoteur / co-promoteur, comme la RLS de `counters` : créer un
 * comptoir engage la structure du bar et consomme une place de gérant dans le
 * plafond d'abonnement, qui reste inchangé quel que soit le nombre de
 * comptoirs (décision du 04/10).
 *
 * ⭐ Un bar mono-comptoir n'a RIEN à faire ici : la section explique à quoi
 * sert un second comptoir plutôt que d'exposer une liste à un élément.
 */
export const CountersSection: React.FC = () => {
  const { currentBar } = useBarContext();
  const { users } = useAppContext();
  const { refreshCounters } = useCounterContext();
  const { createCounter, renameCounter, deactivateCounter, assignUser, unassignUser } =
    useCounterMutations();

  const barId = currentBar?.id;

  /**
   * ⚠️ Plafond de membres (decision du 04/10 : INCHANGE quel que soit le
   * nombre de comptoirs).
   *
   * Effet de bord assume : un 2e comptoir impose un 2e gerant, qui consomme
   * une place. Un bar proche de son palier en sortira du seul fait du
   * decoupage, sans avoir embauche. Sans cet avertissement, le promoteur le
   * decouvrirait en echouant a creer le membre — au pire moment.
   */
  const { subscription } = useMySubscription(barId);
  const maxMembers = getPlan(subscription?.plan).maxMembers;
  const activeMembers = users.length;
  const remainingSeats = maxMembers - activeMembers;
  /**
   * ⛔ `subscription` DOIT etre charge avant d'afficher quoi que ce soit.
   *
   * `getPlan(undefined)` retombe sur `starter` (4 membres). Sur un bar Pro
   * (8) ou Max (20) deja peuple, le temps que la requete d'abonnement
   * resolve, on afficherait « votre plan autorise 4 membres et vous en avez
   * 8 » — faux ET alarmant. Mieux vaut ne rien montrer qu'un chiffre faux
   * sur un sujet de facturation.
   */
  const showSeatWarning = !!subscription && remainingSeats <= 2;

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [toDeactivate, setToDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ⚠️ TOUS les comptoirs du bar, pas le périmètre de la personne : c'est un
  // écran d'administration. `useCounterContext` ne sert ici qu'à rafraîchir le
  // sélecteur après une modification.
  const { data: counters = [], isLoading } = useQuery({
    queryKey: barId ? QUERY_KEYS.counters.list(barId) : ['counters', 'idle'],
    queryFn: () => CountersService.getCounters(barId!),
    enabled: !!barId,
    ...CACHE_STRATEGY.categories,
  });

  // Affectations de tous les comptoirs, en UNE requête.
  // ⚠️ Pas une requête par comptoir : avec 3 comptoirs et 20 membres, la
  // version naïve ferait N appels pour afficher un écran de configuration.
  const { data: assignments = [] } = useQuery({
    queryKey: barId ? ['counters', 'assignments', barId] : ['counters', 'idle'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counter_assignments')
        .select('counter_id, user_id')
        .eq('bar_id', barId!)
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!barId,
    ...CACHE_STRATEGY.categories,
  });

  const assignedUserIds = (counterId: string) =>
    new Set(assignments.filter((a) => a.counter_id === counterId).map((a) => a.user_id));

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCounter.mutateAsync(name);
      setNewName('');
      await refreshCounters();
      toast.success(`Comptoir "${name}" créé`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleRename = async (counterId: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await renameCounter.mutateAsync({ counterId, name });
      setEditingId(null);
      await refreshCounters();
      toast.success('Comptoir renommé');
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    try {
      await deactivateCounter.mutateAsync(toDeactivate.id);
      setToDeactivate(null);
      await refreshCounters();
      toast.success('Comptoir retiré du service');
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleToggleAssign = async (
    counterId: string,
    userId: string,
    isAssigned: boolean
  ) => {
    try {
      if (isAssigned) {
        await unassignUser.mutateAsync({ counterId, userId });
      } else {
        await assignUser.mutateAsync({ counterId, userId });
      }
      await refreshCounters();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  if (!barId) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-h3 font-semibold text-foreground flex items-center gap-2">
          <Store className="w-5 h-5 text-brand-primary" aria-hidden="true" />
          Comptoirs
        </h3>
        <p className="text-body-sm text-muted-foreground mt-1">
          Un comptoir tient son propre stock et sa propre caisse. Un gérant par
          comptoir, et les serveuses peuvent travailler sur plusieurs.
        </p>
      </div>

      {/* ⚠️ Avertissement de plafond — affiche UNIQUEMENT quand il reste peu
          de places. Au-dela, il serait du bruit sur un ecran de config. */}
      {showSeatWarning && (
        <div className="rounded-xl border border-border bg-brand-subtle p-3">
          <p className="text-body-sm text-foreground">
            {remainingSeats <= 0 ? (
              <>
                Votre plan autorise {maxMembers} membres et vous en avez{' '}
                {activeMembers}. Pour ouvrir un nouveau comptoir, il vous
                faudra d'abord libérer une place ou changer de formule : un
                comptoir supplémentaire demande un gérant supplémentaire.
              </>
            ) : (
              <>
                Il vous reste {remainingSeats} place
                {remainingSeats > 1 ? 's' : ''} sur les {maxMembers} de votre
                plan. Un nouveau comptoir demande un gérant, donc une place.
              </>
            )}
          </p>
        </div>
      )}

      {/* Création */}
      <div className="flex gap-2 items-end">
        <Input
          label="Nouveau comptoir"
          placeholder="Terrasse, Salle, Étage..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
          className="flex-1"
        />
        <Button
          onClick={handleCreate}
          disabled={!newName.trim() || createCounter.isPending}
        >
          <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
          Ajouter
        </Button>
      </div>

      {isLoading && (
        <p className="text-body-sm text-muted-foreground">Chargement...</p>
      )}

      {/* Liste */}
      <ul className="space-y-2">
        {counters.map((counter) => {
          const assigned = assignedUserIds(counter.id);
          const isExpanded = expandedId === counter.id;
          const isEditing = editingId === counter.id;

          return (
            <li
              key={counter.id}
              className="border border-border rounded-xl overflow-hidden bg-card"
            >
              <div className="flex items-center gap-2 p-3">
                {isEditing ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(counter.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => handleRename(counter.id)}>
                      Enregistrer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Annuler
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-body font-medium text-foreground truncate">
                      {counter.name}
                      {counter.isPrimary && (
                        <span className="ml-2 text-caption text-muted-foreground">
                          comptoir principal
                        </span>
                      )}
                    </span>
                    <span className="text-caption text-muted-foreground whitespace-nowrap">
                      {assigned.size} affecté{assigned.size > 1 ? 's' : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(isExpanded ? null : counter.id)}
                      aria-label="Gérer les affectations"
                    >
                      <Users className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(counter.id);
                        setEditingName(counter.name);
                      }}
                      aria-label="Renommer"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    {/* ⛔ Le comptoir principal ne se retire pas : il est la
                        cible du mode stock partagé et le comptoir par défaut
                        de tout nouveau membre. */}
                    {!counter.isPrimary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setToDeactivate({ id: counter.id, name: counter.name })
                        }
                        aria-label="Retirer du service"
                      >
                        <PowerOff className="w-4 h-4 text-danger" aria-hidden="true" />
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Affectations */}
              {isExpanded && (
                <div className="border-t border-border p-3 space-y-1">
                  <p className="text-caption text-muted-foreground mb-2">
                    Qui travaille à ce comptoir
                  </p>
                  {users.length === 0 && (
                    <p className="text-body-sm text-muted-foreground">
                      Aucun membre dans ce bar.
                    </p>
                  )}
                  {users.map((user) => {
                    const isAssigned = assigned.has(user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() =>
                          handleToggleAssign(counter.id, user.id, isAssigned)
                        }
                        className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg transition-colors hover:bg-accent text-left"
                      >
                        <span className="text-body-sm text-foreground truncate">
                          {user.name}
                        </span>
                        {isAssigned && (
                          <Check
                            className="w-4 h-4 text-brand-primary flex-shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                  <p className="text-micro text-muted-foreground pt-2">
                    Le promoteur et le co-promoteur accèdent à tous les
                    comptoirs sans affectation.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmationModal
        isOpen={!!toDeactivate}
        onClose={() => setToDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Retirer ce comptoir du service"
        message={
          `"${toDeactivate?.name}" ne sera plus proposé aux serveuses et ` +
          `son stock ne sera plus vendable. Son historique de ventes est ` +
          `conservé. Vous pourrez le recréer, mais pas sous le même nom ` +
          `tant que celui-ci reste pris.`
        }
        confirmLabel="Retirer du service"
        isDestructive
        isLoading={deactivateCounter.isPending}
      />
    </div>
  );
};

CountersSection.displayName = 'CountersSection';

export default CountersSection;
