# Runbook : Migration depuis Supabase

> **À LIRE LE JOUR OÙ TU DÉCIDES DE MIGRER.**
> Si tu ouvres ce document pour la première fois, prends 15 minutes pour le lire en entier avant de commencer quoi que ce soit.

**Date de création** : 2026-05-26
**Contexte** : Le code BarTender a été préparé en avance pour faciliter une éventuelle migration future, sans en démarrer une.

---

## ⚠️ Avant tout : faut-il vraiment migrer ?

Critères de décision techniques :

| Signal | Action |
|--------|--------|
| Facture Supabase reste une faible part du CA | **Ne migre pas.** Optimise (cache, egress, queries). |
| Facture devient significative par rapport au CA | Passe au plan supérieur (Team/Enterprise) avant migration. |
| Facture devient une part majeure du CA pendant plusieurs mois consécutifs | Migration justifiée. |
| Latence > 500ms en moyenne sur les RPCs critiques | Optimise d'abord, migre si pas d'amélioration. |
| Hard limit atteint (connexions DB, channels Realtime) | Migration ou plan Enterprise. |
| Client enterprise demande on-premise | Migration partielle (data layer uniquement). |

Les seuils chiffrés précis sont volontairement absents de ce document public — ils dépendent du modèle économique du moment et sont consignés ailleurs.

**Ne migre PAS si** :
- Tu n'as pas une équipe technique de 2+ personnes
- Tu n'as pas 3-6 mois devant toi sans urgence business
- Tu n'as pas testé la nouvelle stack sur au moins 1 bar pilote

---

## 🎯 Stratégie : migration progressive, jamais big-bang

**Règle d'or** : on ne migre **jamais** tout d'un coup. On migre **un module à la fois**, dans cet ordre (du moins risqué au plus risqué) :

```
Phase 1 : Storage          → Cloudflare R2 ou S3      (1 semaine)
Phase 2 : Realtime         → Pusher, Ably, ou self-hosted Postgres logical replication (2 semaines)
Phase 3 : Auth             → Auth0, Clerk, ou Cognito  (3 semaines)
Phase 4 : Database (gros)  → RDS Postgres, Neon, ou Cloud SQL (6-8 semaines, dual-write)
Phase 5 : Edge Functions   → Vercel Functions, AWS Lambda, ou Cloudflare Workers (2 semaines)
```

Chaque phase est **réversible** : si problème détecté, rollback en 1 commande.

---

## 📍 Couche d'abstraction déjà en place

✅ **Wrappers portables créés** (Phase A — préparation du terrain) :
- `src/services/auth/index.ts` → primitives auth (`authPrimitives`)
- `src/services/storage/index.ts` → primitives storage (`storageService`)
- `src/services/supabase/*.service.ts` → fichiers de logique métier DB
- `src/services/realtime/RealtimeService.ts` → wrapper realtime

✅ **Patterns favorables à la migration** :
- Idempotency keys sur toutes les opérations critiques → retries safe
- Types DB séparés des types métier (`database.types.ts` vs `types/index.ts`)
- RPCs PostgreSQL pour les hot paths (portables vers n'importe quel Postgres)
- Offline-first avec queue (déjà découplé du provider)

### Audit rapide à refaire avant migration

```bash
# Composants UI qui importent supabase directement (à migrer vers les wrappers/services)
grep -rln "import.*supabase" src --include="*.ts" --include="*.tsx" \
  | grep -v "src/services/" \
  | grep -v "src/lib/supabase" \
  | grep -v "\.test\." \
  | grep -v "src/tests/"

# RLS policies dépendant de l'auth provider courant
grep -rln "auth\.uid()" supabase/migrations
```

Ces deux commandes te donneront un état des lieux à jour avant de commencer.

---

## 🛠️ Procédure détaillée par phase

### Phase 1 — Storage (1 semaine, risque MINIMAL)

**Pourquoi commencer par là** : peu de fichiers UI touchent le storage. Test grandeur nature de la stratégie sans risque pour le business.

1. **Provision le nouveau provider** (ex: Cloudflare R2)
2. **Adapte `src/services/storage/index.ts`** pour pointer vers le nouveau provider
3. **Migre les images existantes** :
   ```bash
   # Script de copie Supabase Storage → R2 (à créer dans scripts/migrate-storage.ts)
   # Pour chaque bucket : liste tous les fichiers, télécharge, upload vers R2
   ```
4. **Garde les deux providers actifs 1 semaine** (dual-read : nouveau d'abord, fallback Supabase)
5. **Coupe Supabase Storage** quand 100% confiance

**Rollback** : revert `src/services/storage/index.ts` vers Supabase.

### Phase 2 — Realtime (2 semaines, risque FAIBLE)

**Pré-requis** : `RealtimeService.ts` doit être le **seul** point d'utilisation des channels Supabase. Si `grep supabase.channel(` retourne autre chose, isole-le d'abord.

1. **Choisis un provider** :
   - Pusher : simple, payant
   - Ably : robuste, payant
   - Postgres logical replication self-hosted : gratuit mais complexe
2. **Adapte `RealtimeService.ts`** pour publier sur le nouveau provider
3. **Test sur 1 bar pilote** pendant 1 semaine
4. **Rollout progressif** (feature flag par bar)

**Rollback** : feature flag `useNewRealtime: false` pour le bar concerné.

### Phase 3 — Auth (3 semaines, risque MODÉRÉ)

**Pré-requis CRITIQUE** : tous les appels `supabase.auth.*` doivent passer par `authPrimitives` (sinon migration de plusieurs fichiers en même temps = risque énorme).

1. **Migre les fichiers** qui appellent `supabase.auth.*` directement vers `authPrimitives` (1 semaine, en gardant Supabase Auth)
2. **Choisis un provider** :
   - Auth0 : feature-rich
   - Clerk : moderne, mobile-friendly
   - Cognito : AWS-native, complexe
3. **Migration utilisateurs** :
   - Export Supabase auth.users
   - Import vers nouveau provider via leur API
   - Reset password OBLIGATOIRE (les hashes ne sont pas portables — bcrypt cost différent)
   - OU : login progressif (premier login après migration = re-hash)
4. **Adapte `authPrimitives` et `AuthService`** pour le nouveau provider
5. **Adapte les RLS** :
   - Si conservation Supabase Auth pour la DB → 0 changement
   - Sinon : remplacer `auth.uid()` par une session variable type `current_setting('app.user_id', true)::uuid`
6. **Test sur compte interne** avant rollout
7. **Communique aux utilisateurs** : tous devront re-créer un mot de passe

⚠️ **Plan de communication** : envoyer email 2 semaines avant, expliquer pourquoi, fournir support 24/7 le jour J.

### Phase 4 — Database (6-8 semaines, risque ÉLEVÉ)

**LE GROS MORCEAU.** À ne tenter qu'avec un plan dual-write rigoureux.

1. **Provision nouvelle DB Postgres** (RDS, Neon, Cloud SQL)
2. **Réplique le schéma** :
   - Export schéma Supabase : `npx supabase db dump --schema public > schema.sql`
   - Adapter `auth.uid()` si Phase 3 déjà faite
   - Apply sur la nouvelle DB
3. **Setup logical replication Supabase → nouvelle DB** (read-only pendant 2 semaines)
4. **Active dual-write** :
   - Modifie les services pour écrire dans LES DEUX DB
   - Compare les résultats en background
   - Log les divergences
5. **Pendant 2 semaines minimum** : surveille les divergences, corrige les bugs
6. **Bascule la lecture** :
   - Bar par bar (feature flag `useNewDB: true`)
   - Commence par les bars les moins critiques
7. **Coupe Supabase** quand 100% des bars sont basculés depuis 1 mois

⚠️ **Rollback** : à chaque étape, possibilité de revenir à Supabase en désactivant le feature flag.

⚠️ **Données critiques à protéger absolument** :
- `sales` (les ventes — argent réel)
- `payments` (paiements)
- `audit_logs` (compliance SYSCOHADA)
- `bars` + `bar_members` (multi-tenant)

### Phase 5 — Edge Functions (2 semaines, risque FAIBLE)

Pour chaque fonction dans `supabase/functions/` :

1. Réécriture Deno → Node.js (la plupart du code est compatible)
2. Deploy sur Vercel Functions ou AWS Lambda
3. Adapte les callers (composants UI qui appellent l'edge function via fetch)
4. Test, puis bascule URL

---

## 📋 Checklist le jour J

### Avant de démarrer
- [ ] Backup complet Supabase (DB dump + storage export + auth users)
- [ ] Communication client envoyée (si Phase 3 ou 4)
- [ ] Équipe technique disponible 48h en astreinte
- [ ] Rollback testé en environnement de staging
- [ ] Status page externe pour informer les utilisateurs

### Pendant la migration (chaque phase)
- [ ] Monitor : latence p50/p95/p99 des opérations critiques
- [ ] Monitor : taux d'erreur (Sentry)
- [ ] Monitor : nombre de ventes/heure (détection rapide de panne business)
- [ ] Compare : opérations avant/après chaque jalon
- [ ] Document : tout changement non prévu

### Après chaque phase
- [ ] Attendre 1 semaine sans incident avant phase suivante
- [ ] Mettre à jour ce runbook avec les leçons apprises
- [ ] Communiquer aux utilisateurs la fin de la phase

### Quand tout est terminé
- [ ] Décommissionner les wrappers devenus inutiles
- [ ] Supprimer le code Supabase mort
- [ ] Annuler les abonnements Supabase
- [ ] Mise à jour CLAUDE.md (stack technique)

---

## 🚨 Cas d'urgence — Rollback complet

Si une migration tourne mal :

### Storage (Phase 1)
```typescript
// Revert src/services/storage/index.ts → revenir à Supabase Storage
// Les images uploadées sur le nouveau provider restent accessibles
// car on garde le dual-read pendant 1 semaine
```

### Realtime (Phase 2)
```sql
-- Feature flag global
UPDATE bars SET settings = jsonb_set(settings, '{useNewRealtime}', 'false');
```

### Auth (Phase 3)
**Le plus risqué** : si la migration auth a déjà commencé et les utilisateurs ne peuvent plus se connecter :
1. Communiquer immédiatement
2. Re-activer Supabase Auth en frontend (revert `authPrimitives`)
3. Les nouveaux mots de passe créés sur le nouveau provider sont perdus → users reset password sur Supabase
4. Investigation post-mortem

### Database (Phase 4)
```typescript
// Feature flag par bar
await BarsService.updateBar(barId, { settings: { useNewDB: false } });

// Si dual-write actif, les données ont été écrites dans les 2 DB
// Bascule lecture sur Supabase = retour à la normale instantané
```

---

## 📚 Références

- Wrappers créés en préparation :
  - [src/services/auth/index.ts](../src/services/auth/index.ts)
  - [src/services/storage/index.ts](../src/services/storage/index.ts)
- Couche service existante : [src/services/supabase/](../src/services/supabase/)
- Tests d'intégration (à utiliser pour valider) : [src/tests/integration/](../src/tests/integration/)

---

## 🧭 Note finale

Une migration est un projet à part entière. Donne-lui le respect qu'elle mérite : timeline réaliste, équipe dédiée, rollback testé, communication soignée. Ne fais jamais cette migration sous pression ou dans l'urgence.

**Si tu hésites, ne migre pas.** Supabase scale loin.
