/**
 * rbac-role-baseline.integration.test.ts
 * Phase Pré-0 — Filet de non-régression AVANT le nettoyage des décisions par rôle brut.
 *
 * Voir docs/roadmaps/MATRICE_RBAC_CUISINIER.md §6 et §8.
 *
 * ⭐ RAISON D'ÊTRE
 * Le nettoyage Pré-0 remplace des tests de rôle brut (`role === 'serveur'`) par des tests
 * de permission (`hasPermission('canViewAllSales')`). Toute l'opération repose sur une
 * affirmation : « le comportement des 4 rôles actuels est inchangé ».
 *
 * Ce fichier transforme cette affirmation en test. Il fige la table de vérité AVANT
 * modification. Il doit passer à l'identique APRÈS — sans être modifié.
 *
 * ⛔ NE PAS ADAPTER CE FICHIER pour faire passer le nettoyage. Un échec ici signifie que
 * le nettoyage a changé un comportement, ce qui est précisément ce qu'il ne doit pas faire.
 * La seule modification légitime est l'AJOUT du rôle `cuisinier` en phase 0.
 */

import { describe, it, expect } from 'vitest';
import {
  ROLE_PERMISSIONS,
  getPermissionsByRole,
  type UserRole,
  type RolePermissions,
} from '../../types';

/**
 * Les 4 rôles HISTORIQUES. Volontairement distincts de `ALL_ROLES` : les
 * invariants de non-régression Pré-0 portent sur EUX, et doivent rester vrais
 * indépendamment des rôles ajoutés depuis (le cuisinier n'a ni canSell ni
 * canViewOwnSales, il fausserait ces invariants s'il y était inclus).
 */
const CURRENT_ROLES: UserRole[] = ['super_admin', 'promoteur', 'gerant', 'serveur'];

/** Tous les rôles, cuisinier inclus (phase 0, 02/08/2026). */
const ALL_ROLES: UserRole[] = [...CURRENT_ROLES, 'cuisinier'];

/**
 * Les 35 permissions requises de RolePermissions.
 * Les 4 optionnelles (canAccessAdminDashboard, canManagePromoteurs, canViewGlobalStats,
 * canSuspendBars) sont traitées à part : seul super_admin les porte.
 *
 * ⭐ `canValidateSales` ajoutée en Pré-0 (31/07/2026) : elle remplace le test
 * `role === 'serveur'` de QuickSaleFlow/Cart/AppProvider. Valeurs dérivées de
 * l'existant (true partout sauf serveur) → comportement inchangé.
 */
const REQUIRED_PERMISSIONS = [
  'canManageUsers',
  'canCreateManagers',
  'canCreateServers',
  'canAddProducts',
  'canEditProducts',
  'canDeleteProducts',
  'canManageInventory',
  'canViewInventory',
  'canSell',
  'canValidateSales',
  'canCancelSales',
  'canViewAllSales',
  'canViewOwnSales',
  'canViewAnalytics',
  'canExportData',
  'canViewForecasting',
  'canViewAccounting',
  'canManageExpenses',
  'canManageSalaries',
  'canCreateConsignment',
  'canClaimConsignment',
  'canViewConsignments',
  'canManagePromotions',
  'canManageSettings',
  'canManageBarInfo',
  'canCreateBars',
  'canSwitchBars',
  // ⭐ Cuisine — ajoutées en phase 0 (31/07/2026), MATRICE_RBAC_CUISINIER §3.
  // Additives : aucun comportement existant ne les consulte encore.
  'canViewKitchenOrders',
  'canUpdateKitchenOrderStatus',
  'canServeKitchenItem',
  'canManageRecipes',
  'canManageIngredientStock',
  'canCancelKitchenOrderItem',
  'canRefundPrepaidKitchenItem',
  'canViewKitchenCosts',
] as const satisfies readonly (keyof RolePermissions)[];

const OPTIONAL_PERMISSIONS = [
  'canAccessAdminDashboard',
  'canManagePromoteurs',
  'canViewGlobalStats',
  'canSuspendBars',
] as const satisfies readonly (keyof RolePermissions)[];

describe('RBAC — Baseline des rôles (filet de non-régression Pré-0 + phase 0)', () => {
  describe('📋 Table de vérité complète — 35 permissions × 5 rôles', () => {
    /**
     * Table figée le 31/07/2026 depuis src/types/index.ts:665-784.
     * Source : MATRICE_RBAC_CUISINIER.md §2.
     */
    const EXPECTED: Record<UserRole, Record<string, boolean>> = {
      super_admin: {
        canManageUsers: true, canCreateManagers: true, canCreateServers: true,
        canAddProducts: true, canEditProducts: true, canDeleteProducts: true,
        canManageInventory: true, canViewInventory: true,
        canSell: true, canValidateSales: true,
        canCancelSales: true, canViewAllSales: true, canViewOwnSales: true,
        canViewAnalytics: true, canExportData: true, canViewForecasting: true,
        canViewAccounting: true, canManageExpenses: true, canManageSalaries: true,
        canCreateConsignment: true, canClaimConsignment: true, canViewConsignments: true,
        canManagePromotions: true, canManageSettings: true, canManageBarInfo: true,
        canCreateBars: true, canSwitchBars: true,
        canViewKitchenOrders: true, canUpdateKitchenOrderStatus: true,
        canServeKitchenItem: true, canManageRecipes: true,
        canManageIngredientStock: true, canCancelKitchenOrderItem: true,
        canRefundPrepaidKitchenItem: true, canViewKitchenCosts: true,
      },
      promoteur: {
        canManageUsers: true, canCreateManagers: true, canCreateServers: true,
        canAddProducts: true, canEditProducts: true, canDeleteProducts: true,
        canManageInventory: true, canViewInventory: true,
        canSell: true, canValidateSales: true,
        canCancelSales: true, canViewAllSales: true, canViewOwnSales: true,
        canViewAnalytics: true, canExportData: true, canViewForecasting: true,
        canViewAccounting: true, canManageExpenses: true, canManageSalaries: true,
        canCreateConsignment: true, canClaimConsignment: true, canViewConsignments: true,
        canManagePromotions: true, canManageSettings: true, canManageBarInfo: true,
        canCreateBars: true, canSwitchBars: true,
        canViewKitchenOrders: true, canUpdateKitchenOrderStatus: true,
        canServeKitchenItem: true, canManageRecipes: true,
        canManageIngredientStock: true, canCancelKitchenOrderItem: true,
        canRefundPrepaidKitchenItem: true, canViewKitchenCosts: true,
      },
      gerant: {
        canManageUsers: false, canCreateManagers: false, canCreateServers: true,
        canAddProducts: true, canEditProducts: true, canDeleteProducts: true,
        canManageInventory: true, canViewInventory: true,
        canSell: true, canValidateSales: true,
        canCancelSales: false, canViewAllSales: true, canViewOwnSales: true,
        canViewAnalytics: true, canExportData: true, canViewForecasting: true,
        canViewAccounting: false, canManageExpenses: false, canManageSalaries: false,
        canCreateConsignment: true, canClaimConsignment: true, canViewConsignments: true,
        canManagePromotions: true, canManageSettings: true, canManageBarInfo: true,
        canCreateBars: false, canSwitchBars: false,
        canViewKitchenOrders: true, canUpdateKitchenOrderStatus: true,
        canServeKitchenItem: true, canManageRecipes: true,
        canManageIngredientStock: true, canCancelKitchenOrderItem: true,
        canRefundPrepaidKitchenItem: true, canViewKitchenCosts: true,
      },
      serveur: {
        canManageUsers: false, canCreateManagers: false, canCreateServers: false,
        canAddProducts: false, canEditProducts: false, canDeleteProducts: false,
        canManageInventory: false, canViewInventory: false,
        canSell: true, canValidateSales: false,
        canCancelSales: false, canViewAllSales: false, canViewOwnSales: true,
        canViewAnalytics: false, canExportData: false, canViewForecasting: false,
        canViewAccounting: false, canManageExpenses: false, canManageSalaries: false,
        canCreateConsignment: false, canClaimConsignment: false, canViewConsignments: false,
        canManagePromotions: false, canManageSettings: false, canManageBarInfo: false,
        canCreateBars: false, canSwitchBars: false,
        // ⭐ Le serveur est à l'interface salle/cuisine : il voit et sert, sans produire.
        canViewKitchenOrders: true, canUpdateKitchenOrderStatus: false,
        canServeKitchenItem: true, canManageRecipes: false,
        canManageIngredientStock: false, canCancelKitchenOrderItem: false,
        canRefundPrepaidKitchenItem: false, canViewKitchenCosts: false,
      },
      // ⭐ CUISINIER — produit sans vendre. Tous ses droits sont des permissions
      // cuisine ; AUCUNE permission bar. Symétrie exacte du serveur.
      cuisinier: {
        canManageUsers: false, canCreateManagers: false, canCreateServers: false,
        canAddProducts: false, canEditProducts: false, canDeleteProducts: false,
        canManageInventory: false, canViewInventory: false,
        canSell: false, canValidateSales: false,
        canCancelSales: false, canViewAllSales: false, canViewOwnSales: false,
        canViewAnalytics: false, canExportData: false, canViewForecasting: false,
        canViewAccounting: false, canManageExpenses: false, canManageSalaries: false,
        canCreateConsignment: false, canClaimConsignment: false, canViewConsignments: false,
        canManagePromotions: false, canManageSettings: false, canManageBarInfo: false,
        canCreateBars: false, canSwitchBars: false,
        canViewKitchenOrders: true, canUpdateKitchenOrderStatus: true,
        canServeKitchenItem: false, canManageRecipes: true,
        canManageIngredientStock: true, canCancelKitchenOrderItem: true,
        canRefundPrepaidKitchenItem: false, canViewKitchenCosts: false,
      },
    };

    it.each(ALL_ROLES)('%s a exactement les permissions attendues', (role) => {
      // Arrange
      const expected = EXPECTED[role];

      // Act
      const actual = ROLE_PERMISSIONS[role];

      // Assert — permission par permission, pour que l'échec nomme la coupable
      for (const permission of REQUIRED_PERMISSIONS) {
        expect(
          actual[permission],
          `${role}.${permission} a changé`
        ).toBe(expected[permission]);
      }
    });

    it('aucune permission requise n\'est absente ou non booléenne', () => {
      for (const role of ALL_ROLES) {
        for (const permission of REQUIRED_PERMISSIONS) {
          expect(
            typeof ROLE_PERMISSIONS[role][permission],
            `${role}.${permission} doit être un booléen défini`
          ).toBe('boolean');
        }
      }
    });
  });

  describe('👑 Permissions optionnelles — super_admin seul', () => {
    it.each(OPTIONAL_PERMISSIONS)('super_admin porte %s', (permission) => {
      expect(ROLE_PERMISSIONS.super_admin[permission]).toBe(true);
    });

    it.each(OPTIONAL_PERMISSIONS)(
      'les 3 autres rôles ne portent pas %s',
      (permission) => {
        for (const role of ['promoteur', 'gerant', 'serveur'] as const) {
          // Absentes de l'objet → undefined, jamais true
          expect(ROLE_PERMISSIONS[role][permission] ?? false).toBe(false);
        }
      }
    );
  });

  describe('⛔ Invariants de sécurité — ce qui ne doit JAMAIS changer', () => {
    it('seul le serveur est privé de canViewAllSales', () => {
      // ⭐ C'est l'invariant qui porte tout le nettoyage §6 zone 4 :
      // remplacer `role === 'serveur'` par `!hasPermission('canViewAllSales')`
      // est neutre UNIQUEMENT si ces deux expressions coïncident aujourd'hui.
      const withoutGlobalRead = CURRENT_ROLES.filter(
        (role) => !ROLE_PERMISSIONS[role].canViewAllSales
      );

      expect(withoutGlobalRead).toEqual(['serveur']);
    });

    it('seul le serveur est privé de canValidateSales', () => {
      // ⭐ Invariant portant le nettoyage §6 zone 5 : remplacer
      // `role === 'serveur' ? 'pending' : 'validated'` par
      // `hasPermission('canValidateSales') ? 'validated' : 'pending'` est neutre
      // UNIQUEMENT si ces deux expressions coïncident — c'est ce qu'on vérifie ici.
      const withoutValidation = CURRENT_ROLES.filter(
        (role) => !ROLE_PERMISSIONS[role].canValidateSales
      );

      expect(withoutValidation).toEqual(['serveur']);
    });

    it('seul le serveur est privé de canManageSettings', () => {
      const withoutSettings = CURRENT_ROLES.filter(
        (role) => !ROLE_PERMISSIONS[role].canManageSettings
      );

      expect(withoutSettings).toEqual(['serveur']);
    });

    it('seul le serveur est privé de canViewInventory', () => {
      const withoutInventory = CURRENT_ROLES.filter(
        (role) => !ROLE_PERMISSIONS[role].canViewInventory
      );

      expect(withoutInventory).toEqual(['serveur']);
    });

    it('tous les rôles actuels peuvent vendre', () => {
      // ⚠ Deviendra faux avec `cuisinier` (canSell: false) — c'est voulu et documenté.
      // Ce test doit alors être étendu, pas supprimé : il garantit qu'aucun rôle
      // existant ne perd canSell pendant le nettoyage.
      for (const role of CURRENT_ROLES) {
        expect(ROLE_PERMISSIONS[role].canSell, `${role} doit pouvoir vendre`).toBe(true);
      }
    });

    it('la comptabilité reste réservée à promoteur et super_admin', () => {
      const withAccounting = CURRENT_ROLES.filter(
        (role) => ROLE_PERMISSIONS[role].canViewAccounting
      );

      expect(withAccounting.sort()).toEqual(['promoteur', 'super_admin']);
    });

    it('le gérant peut retirer un produit du catalogue (arbitrage 02/08/2026)', () => {
      // ⭐ Le gérant assure la gestion quotidienne du bar — décision métier.
      //
      // `useInventoryActions.handleDeleteClick` le bloquait par un test de rôle,
      // au motif d'un « risque de perte d'historique ». Motif FACTUELLEMENT FAUX :
      // deleteProduct → ProductsService.deactivateProduct, un SOFT DELETE
      // (`is_active: false`). Aucune ligne effacée, ventes passées intactes.
      //
      // Le garde suit désormais cette permission. Si elle repassait à false
      // pour le gérant, l'UI le bloquerait automatiquement — les deux ne
      // peuvent plus diverger.
      expect(ROLE_PERMISSIONS.gerant.canDeleteProducts).toBe(true);
      expect(ROLE_PERMISSIONS.serveur.canDeleteProducts).toBe(false);
      expect(ROLE_PERMISSIONS.cuisinier.canDeleteProducts).toBe(false);
    });

    it('la création de bars reste réservée à promoteur et super_admin', () => {
      const withBarCreation = CURRENT_ROLES.filter(
        (role) => ROLE_PERMISSIONS[role].canCreateBars
      );

      expect(withBarCreation.sort()).toEqual(['promoteur', 'super_admin']);
    });
  });

  describe('🍳 Invariants cuisine — sémantique du module restauration', () => {
    it('le serveur voit la file cuisine mais ne fait pas avancer la production', () => {
      // ⭐ §6.1 : le serveur doit repérer ce qui est `ready` pour le retirer,
      // sans pouvoir accepter/démarrer/marquer prêt — ce sont deux métiers.
      expect(ROLE_PERMISSIONS.serveur.canViewKitchenOrders).toBe(true);
      expect(ROLE_PERMISSIONS.serveur.canUpdateKitchenOrderStatus).toBe(false);
    });

    it('servir et produire sont des droits disjoints', () => {
      // ⭐ `serve` crée la VENTE (§6.1). Un rôle qui produit ne doit pas vendre :
      // c'est ce qui justifiera canSell=false + canServeKitchenItem=false pour
      // le cuisinier, et l'inverse pour le serveur.
      expect(ROLE_PERMISSIONS.serveur.canServeKitchenItem).toBe(true);
      expect(ROLE_PERMISSIONS.serveur.canManageRecipes).toBe(false);
      expect(ROLE_PERMISSIONS.serveur.canManageIngredientStock).toBe(false);
    });

    it('le serveur ne voit ni les coûts ni les remboursements', () => {
      // §13.1 : le remboursement d'un prépaiement est une sortie de caisse.
      // §8 : le coût matière est une information de gestion.
      expect(ROLE_PERMISSIONS.serveur.canRefundPrepaidKitchenItem).toBe(false);
      expect(ROLE_PERMISSIONS.serveur.canViewKitchenCosts).toBe(false);
    });

    it('le gérant voit les coûts cuisine bien qu\'il n\'ait pas la comptabilité', () => {
      // ⚠️ Volontaire : la marge matière est un outil de pilotage opérationnel (§8),
      // pas de la comptabilité. C'est l'argument commercial central du module.
      expect(ROLE_PERMISSIONS.gerant.canViewAccounting).toBe(false);
      expect(ROLE_PERMISSIONS.gerant.canViewKitchenCosts).toBe(true);
    });

    it('le stock ingrédients est disjoint du stock boissons', () => {
      // ⚠️ §12.5 : canManageIngredientStock ≠ canManageInventory (casiers).
      // Aujourd'hui les 3 rôles gestionnaires ont les deux, mais le cuisinier
      // n'aura QUE le premier — d'où la séparation dès maintenant.
      const withIngredients = CURRENT_ROLES.filter(
        (r) => ROLE_PERMISSIONS[r].canManageIngredientStock
      );
      const withBarStock = CURRENT_ROLES.filter(
        (r) => ROLE_PERMISSIONS[r].canManageInventory
      );

      expect(withIngredients).toEqual(withBarStock);
    });
  });

  describe('🔗 getPermissionsByRole — chaîne alimentant currentSession.permissions', () => {
    // AuthContext:72 fait `permissions: getPermissionsByRole(authUser.role)`, puis
    // hasPermission() lit currentSession.permissions. Ce helper est donc le seul
    // point de passage entre ROLE_PERMISSIONS et l'UI.

    it.each(ALL_ROLES)('retourne les permissions de %s', (role) => {
      expect(getPermissionsByRole(role)).toEqual(ROLE_PERMISSIONS[role]);
    });

    it('⭐ toute permission NOUVELLE est immédiatement visible pour un rôle donné', () => {
      // ⛔ BUG CONSTATÉ EN PROD le 02/08/2026 : hasPermission lisait
      // `currentSession.permissions`, une COPIE figée au login et PERSISTÉE
      // (useDataStore). L'ajout de `canValidateSales` a rendu les sessions
      // existantes obsolètes — les ventes d'un promoteur naissaient `pending`
      // parce que la permission manquait de sa session restaurée.
      //
      // hasPermission dérive désormais du RÔLE via getPermissionsByRole.
      // Ce test garantit que la table est complète pour chaque rôle : si une
      // permission y manquait, elle serait `undefined` et donc refusée
      // silencieusement — exactement le symptôme d'origine.
      for (const role of ALL_ROLES) {
        const derived = getPermissionsByRole(role);
        for (const permission of REQUIRED_PERMISSIONS) {
          expect(
            typeof derived[permission],
            `${role}.${permission} absente de la table → refusée silencieusement`
          ).toBe('boolean');
        }
      }
    });

    it('un serveur ne reçoit pas la lecture globale des ventes', () => {
      expect(getPermissionsByRole('serveur').canViewAllSales).toBe(false);
    });

    it('un gérant reçoit la lecture globale des ventes', () => {
      expect(getPermissionsByRole('gerant').canViewAllSales).toBe(true);
    });
  });

  describe('🚧 Garde-fou d\'extension — détecte l\'ajout d\'un rôle', () => {
    it('ROLE_PERMISSIONS contient exactement 5 rôles', () => {
      // ⭐ A joué son rôle le 02/08/2026 : il a échoué à l'ajout de `cuisinier`,
      // forçant à revenir étendre la table de vérité ci-dessus plutôt qu'à hériter
      // silencieusement des permissions du serveur. Maintenu pour le prochain rôle.
      expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([
        'cuisinier',
        'gerant',
        'promoteur',
        'serveur',
        'super_admin',
      ]);
    });
  });

  describe('👨‍🍳 CUISINIER — tests obligatoires (MATRICE_RBAC_CUISINIER.md §8)', () => {
    const cuisinier = ROLE_PERMISSIONS.cuisinier;

    it('⛔ ne peut PAS vendre', () => {
      // Doublé côté DB : create_sale_idempotent refuse tout rôle hors liste
      // blanche depuis la migration 20260731120000.
      expect(cuisinier.canSell).toBe(false);
    });

    it('⛔ ne peut PAS valider de vente', () => {
      expect(cuisinier.canValidateSales).toBe(false);
      expect(cuisinier.canCancelSales).toBe(false);
    });

    it('⛔ ne lit PAS la comptabilité', () => {
      expect(cuisinier.canViewAccounting).toBe(false);
      expect(cuisinier.canManageExpenses).toBe(false);
      expect(cuisinier.canManageSalaries).toBe(false);
    });

    it('⛔ ne voit AUCUNE vente — ni globale, ni propre', () => {
      // ⚠️ canViewOwnSales = false et non true : il n'a aucune vente propre
      // puisqu'il ne vend pas. `true` afficherait un écran vide et trompeur.
      expect(cuisinier.canViewAllSales).toBe(false);
      expect(cuisinier.canViewOwnSales).toBe(false);
    });

    it('⛔ ne voit PAS les coûts ni ne rembourse', () => {
      expect(cuisinier.canViewKitchenCosts).toBe(false);
      expect(cuisinier.canRefundPrepaidKitchenItem).toBe(false);
    });

    it('⭐ produit sans servir — le serveur sert sans produire', () => {
      // L'invariant central du module (§6.1) : `serve` crée la VENTE.
      expect(cuisinier.canUpdateKitchenOrderStatus).toBe(true);
      expect(cuisinier.canServeKitchenItem).toBe(false);

      expect(ROLE_PERMISSIONS.serveur.canUpdateKitchenOrderStatus).toBe(false);
      expect(ROLE_PERMISSIONS.serveur.canServeKitchenItem).toBe(true);
    });

    it('⭐ gère le stock INGRÉDIENTS mais pas le stock BOISSONS', () => {
      // §12.5 : permissions volontairement disjointes.
      expect(cuisinier.canManageIngredientStock).toBe(true);
      expect(cuisinier.canManageInventory).toBe(false);
      expect(cuisinier.canViewInventory).toBe(false);
    });

    it('⭐ tous ses droits sont des permissions CUISINE', () => {
      const KITCHEN = [
        'canViewKitchenOrders', 'canUpdateKitchenOrderStatus', 'canServeKitchenItem',
        'canManageRecipes', 'canManageIngredientStock', 'canCancelKitchenOrderItem',
        'canRefundPrepaidKitchenItem', 'canViewKitchenCosts',
      ] as const;

      const granted = REQUIRED_PERMISSIONS.filter((p) => cuisinier[p]);

      // Aucune permission accordée hors du périmètre cuisine.
      expect(granted.every((p) => (KITCHEN as readonly string[]).includes(p))).toBe(true);
      expect(granted.sort()).toEqual([
        'canCancelKitchenOrderItem',
        'canManageIngredientStock',
        'canManageRecipes',
        'canUpdateKitchenOrderStatus',
        'canViewKitchenOrders',
      ]);
    });

    it('⭐ n\'est PAS un serveur enrichi ni un gérant diminué', () => {
      // §12.5 : rôle DISJOINT. Le test empêche un futur
      // `...ROLE_PERMISSIONS.serveur` qui lui donnerait canSell.
      expect(cuisinier).not.toEqual(ROLE_PERMISSIONS.serveur);
      expect(cuisinier).not.toEqual(ROLE_PERMISSIONS.gerant);

      const differsFromServeur = REQUIRED_PERMISSIONS.filter(
        (p) => cuisinier[p] !== ROLE_PERMISSIONS.serveur[p]
      );
      expect(differsFromServeur.length).toBeGreaterThan(0);
    });

    it('⛔ canSell est le SEUL critère de blocage du panier, pas le mode', () => {
      // ⭐ Constaté en test réel le 02/08/2026 : les gardes de AppProvider.addToCart,
      // Cart et QuickSaleFlow ne testaient que `isSimplifiedMode && ...`. En mode
      // COMPLET — le seul où la cuisine existe (§13.4) — un cuisinier pouvait
      // remplir un panier et voir « LANCER LA VENTE ». La vente échouait au RPC
      // (guard liste blanche), mais après coup.
      //
      // Ces trois écrans testent désormais canSell, indépendamment du mode.
      // Cet invariant garantit que le correctif reste neutre pour les rôles
      // vendeurs : si un rôle historique perdait canSell, le test le signalerait.
      const canSell = ALL_ROLES.filter((r) => ROLE_PERMISSIONS[r].canSell);

      expect(canSell.sort()).toEqual(['gerant', 'promoteur', 'serveur', 'super_admin']);
      expect(ROLE_PERMISSIONS.cuisinier.canSell).toBe(false);
    });

    it('ne porte aucune permission super_admin', () => {
      for (const permission of OPTIONAL_PERMISSIONS) {
        expect(cuisinier[permission] ?? false).toBe(false);
      }
    });
  });
});
