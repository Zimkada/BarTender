/**
 * userRoleSync.test.ts
 * Synchronisation des déclarations dupliquées de `UserRole`.
 *
 * ⭐ POURQUOI CE FICHIER
 * `UserRole` est déclaré à 3 endroits, plus une liste blanche runtime. Ce sont
 * des unions inline STRUCTURELLEMENT INDÉPENDANTES : le compilateur ne détecte
 * QUE l'oubli dans `types/index.ts` (via `ROLE_PERMISSIONS`). Les autres passent
 * silencieusement.
 *
 * Constaté le 02/08/2026 à l'ajout de `cuisinier` : les 4 points ont dû être
 * modifiés À LA MAIN, sans aucune alerte du compilateur. La dette est documentée
 * (MATRICE_RBAC_CUISINIER.md §10) — ce test la rend DÉTECTABLE, ce qu'un
 * document ne fait pas : personne ne relit une doc avant d'ajouter un rôle.
 *
 * ⚠️ Ce test lit les FICHIERS SOURCE, pas les types : une union TypeScript
 * n'existe pas à l'exécution. C'est le seul moyen de comparer des déclarations
 * que le compilateur traite comme sans rapport.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROLE_PERMISSIONS } from '../../types';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8');

/** Extrait les littéraux d'une union `export type UserRole = 'a' | 'b';`. */
const extractUnionMembers = (source: string): string[] => {
  const match = source.match(/export type UserRole\s*=\s*([^;]+);/);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
};

/** Extrait les entrées d'un tableau `const validRoles = ['a', 'b'];`. */
const extractArrayMembers = (source: string, variableName: string): string[] => {
  const match = source.match(new RegExp(`${variableName}\\s*=\\s*\\[([^\\]]+)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
};

/** Rôles applicatifs réels — ROLE_PERMISSIONS est la source de vérité. */
const CANONICAL_ROLES = Object.keys(ROLE_PERMISSIONS).sort();

describe('UserRole — synchronisation des déclarations dupliquées (§10)', () => {
  it('la source de vérité expose bien les 5 rôles attendus', () => {
    expect(CANONICAL_ROLES).toEqual([
      'cuisinier',
      'gerant',
      'promoteur',
      'serveur',
      'super_admin',
    ]);
  });

  it('⭐ types/index.ts — union alignée sur ROLE_PERMISSIONS', () => {
    const members = extractUnionMembers(readSource('src/types/index.ts'));

    expect(members.length, 'union UserRole introuvable dans types/index.ts').toBeGreaterThan(0);
    expect(members).toEqual(CANONICAL_ROLES);
  });

  it('⭐ types/guide.ts — duplication à synchroniser à la main', () => {
    // ⚠️ Union inline indépendante : le compilateur ne signale PAS son retard.
    const members = extractUnionMembers(readSource('src/types/guide.ts'));

    expect(members.length, 'union UserRole introuvable dans types/guide.ts').toBeGreaterThan(0);
    expect(
      members,
      'types/guide.ts diverge de ROLE_PERMISSIONS — ajouter le rôle manquant'
    ).toEqual(CANONICAL_ROLES);
  });

  it('⭐ utils/validation.ts — liste blanche RUNTIME', () => {
    // ⚠️ Le point le plus dangereux : un rôle absent est rejeté à l'exécution
    // avec « Rôle invalide », sans qu'aucun type ne le signale.
    const members = extractArrayMembers(readSource('src/utils/validation.ts'), 'validRoles');

    expect(members.length, 'validRoles introuvable dans utils/validation.ts').toBeGreaterThan(0);
    expect(
      members,
      'validRoles rejetterait un rôle pourtant déclaré dans ROLE_PERMISSIONS'
    ).toEqual(CANONICAL_ROLES);
  });

  it('⚠️ OnboardingContext.tsx — duplication + alias legacy', () => {
    // Cette union porte en plus owner/manager/bartender (legacy). On vérifie
    // donc l'INCLUSION des rôles applicatifs, pas l'égalité stricte.
    const members = extractUnionMembers(readSource('src/context/OnboardingContext.tsx'));

    expect(members.length, 'union UserRole introuvable dans OnboardingContext').toBeGreaterThan(0);

    const missing = CANONICAL_ROLES.filter(
      // super_admin n'a jamais fait partie de cette union : il ne passe pas
      // par l'onboarding bar (RootLayout le redirige vers /admin).
      (role) => role !== 'super_admin' && !members.includes(role)
    );

    expect(
      missing,
      `OnboardingContext ne connaît pas ${missing.join(', ')} — parcours d'onboarding indisponible`
    ).toEqual([]);
  });
});
