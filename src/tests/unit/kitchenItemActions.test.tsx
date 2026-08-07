/**
 * kitchenItemActions.test.tsx
 *
 * ⭐⭐ QUI PEUT FAIRE QUOI, ET QUAND — §6.1.
 *
 * Deux règles distinctes se croisent sur cette carte :
 *
 * 1. LE MÉTIER — le cuisinier PRODUIT, le serveur VEND. Permissions
 *    volontairement disjointes : « qui produit ne vend pas ».
 *
 * 2. LE MOMENT — après `ready` la matière est SORTIE. Annuler devient une
 *    décision sanitaire ou commerciale, réservée aux rôles de gestion. Cette
 *    borne n'est PAS exprimable par une permission : le §6.1 précise que
 *    `canCancelKitchenOrderItem` « n'est que le premier filtre ».
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE : que l'UI ne montre jamais un bouton que le
 * serveur refusera. Le RPC retranche de toute façon — la sécurité ne dépend
 * pas de ces conditions — mais un bouton qui échoue systématiquement fait
 * découvrir l'interdit APRÈS le geste, par un message d'erreur.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KitchenItemCard } from '../../components/kitchen/KitchenItemCard';
import type {
  KitchenQueueItem,
  KitchenItemStatus,
} from '../../services/supabase/kitchen.service';

const makeItem = (status: KitchenItemStatus): KitchenQueueItem =>
  ({
    id: 'item-1',
    bar_id: 'bar-1',
    kitchen_order_id: 'ko-1',
    dish_id: 'dish-1',
    quantity: 1,
    status,
    accepted_by: null,
    accepted_at: null,
    ready_by: null,
    ready_at: null,
    served_by: null,
    served_at: null,
    cancelled_by: null,
    cancelled_at: null,
    cancel_reason: null,
    cancel_note: null,
    reminder_count: 0,
    last_reminder_at: null,
    modifiers: null,
    unit_price: 2500,
    // ⚠️ Renseigné dès `ready` : c'est lui qui porte la sortie de matière.
    computed_cost: status === 'ready' ? 2000 : null,
    consumed_at: status === 'ready' ? '2026-08-04T12:00:00Z' : null,
    sale_id: null,
    created_at: '2026-08-04T11:50:00Z',
    dish_name: 'Poulet braisé',
    ticket_id: 't-1',
    table_number: 12,
    customer_name: null,
    service_mode: 'dine_in',
    order_notes: null,
    order_created_at: '2026-08-04T11:50:00Z',
  }) as KitchenQueueItem;

interface Caps {
  canProduce?: boolean;
  canServe?: boolean;
  canCancel?: boolean;
  canCancelAfterReady?: boolean;
}

const renderCard = (status: KitchenItemStatus, caps: Caps = {}) =>
  render(
    <KitchenItemCard
      item={makeItem(status)}
      canProduce={caps.canProduce ?? true}
      canServe={caps.canServe ?? true}
      canCancel={caps.canCancel ?? true}
      canCancelAfterReady={caps.canCancelAfterReady ?? true}
      onAccept={vi.fn()}
      // ⚠️ Props ajoutées par 3C.1 (bascule à la commande, §16.9). Ce fichier
      // teste les PERMISSIONS, pas le régime : `isBatchFinish={false}` garde le
      // bouton « À la commande » hors des cas testés ici.
      onForceOnOrder={vi.fn()}
      isBatchFinish={false}
      onMarkReady={vi.fn()}
      onServe={vi.fn()}
      onCancel={vi.fn()}
      isPending={false}
    />
  );

/** Profils réels, tels que définis dans ROLE_PERMISSIONS. */
const CUISINIER: Caps = {
  canProduce: true,
  canServe: false,
  canCancel: true,
  canCancelAfterReady: false,
};
const SERVEUR: Caps = {
  canProduce: false,
  canServe: true,
  canCancel: false,
  canCancelAfterReady: false,
};
const GERANT: Caps = {
  canProduce: true,
  canServe: true,
  canCancel: true,
  canCancelAfterReady: true,
};

describe('KitchenItemCard — actions selon rôle et statut (§6.1)', () => {
  describe('⭐⭐ Borne temporelle — annuler après « prêt »', () => {
    it('⛔ le CUISINIER ne peut PAS annuler un plat déjà prêt', () => {
      // ⚠️ LE défaut signalé en test terrain le 04/08/2026. Le bouton
      // s'affichait et le RPC refusait : l'interdit se découvrait par un
      // message d'erreur, après le clic.
      renderCard('ready', CUISINIER);

      expect(
        screen.queryByRole('button', { name: /annuler/i }),
        'Bouton Annuler affiché sur un plat prêt pour le cuisinier — le RPC refusera systématiquement'
      ).toBeNull();
    });

    it('✅ le cuisinier PEUT annuler tant que rien n\'est consommé', () => {
      // ⚠️ Volet indispensable : sans lui, masquer TOUJOURS le bouton passerait
      // l'assertion précédente. Avant `ready`, la matière est intacte —
      // l'annulation reste une décision opérationnelle.
      renderCard('preparing', CUISINIER);

      expect(screen.getByRole('button', { name: /annuler/i })).toBeTruthy();
    });

    it('✅ le GÉRANT peut annuler un plat prêt', () => {
      renderCard('ready', GERANT);

      expect(screen.getByRole('button', { name: /annuler/i })).toBeTruthy();
    });

    it('⛔ le serveur, sans la permission, n\'annule jamais', () => {
      renderCard('preparing', SERVEUR);

      expect(screen.queryByRole('button', { name: /annuler/i })).toBeNull();
    });
  });

  describe('⭐ Séparation produire / vendre', () => {
    it('⛔ le cuisinier ne voit PAS « Servir » sur un plat prêt', () => {
      renderCard('ready', CUISINIER);

      expect(
        screen.queryByRole('button', { name: /servir/i }),
        'Le cuisinier peut vendre — la séparation du §6.1 n\'est pas appliquée'
      ).toBeNull();
    });

    it('✅ le serveur voit « Servir » sur un plat prêt', () => {
      renderCard('ready', SERVEUR);

      expect(screen.getByRole('button', { name: /servir/i })).toBeTruthy();
    });

    it('⛔ le serveur ne voit PAS « Commencer » ni « Prêt »', () => {
      const { unmount } = renderCard('pending', SERVEUR);
      expect(screen.queryByRole('button', { name: /commencer/i })).toBeNull();
      unmount();

      renderCard('preparing', SERVEUR);
      expect(screen.queryByRole('button', { name: /prêt/i })).toBeNull();
    });
  });

  describe('Actions par statut', () => {
    it('« pending » propose Commencer, jamais Prêt', () => {
      renderCard('pending', CUISINIER);

      expect(screen.getByRole('button', { name: /commencer/i })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^prêt$/i })).toBeNull();
    });

    it('« preparing » propose Prêt, jamais Commencer', () => {
      renderCard('preparing', CUISINIER);

      expect(screen.getByRole('button', { name: /prêt/i })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /commencer/i })).toBeNull();
    });

    it('⭐ « ready » ne propose plus de reculer', () => {
      // Une fois la matière sortie, il n'y a pas de retour en arrière : les
      // seules issues sont servir ou annuler (§6.1).
      renderCard('ready', GERANT);

      expect(screen.queryByRole('button', { name: /commencer/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^prêt$/i })).toBeNull();
    });
  });
});
