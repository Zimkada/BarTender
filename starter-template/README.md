# vite-supabase-starter

Template React + TypeScript + Supabase + Sentry — prêt pour la production.

## Contenu

| Fichier | Description |
|---------|-------------|
| `src/lib/monitoring.ts` | Wrapper Sentry — jamais d'appel direct à Sentry |
| `src/lib/react-query.ts` | QueryClient configuré (retry, toast, persistance) |
| `src/lib/cache-strategy.ts` | `CACHE_STRATEGY` + `QUERY_KEYS` hiérarchiques |
| `src/lib/supabase.ts` | Client Supabase avec timeout 10s |
| `src/utils/cn.ts` | `cn()` = clsx + tailwind-merge |
| `src/utils/lazyWithRetry.ts` | `lazy()` avec retry expo (1s → 3s → 10s) |
| `src/utils/errorHandler.ts` | `getErrorMessage()` type-safe |
| `src/components/common/ErrorFallback.tsx` | Fallback ErrorBoundary |
| `src/main.tsx` | Bootstrap avec monitoring + handlers globaux |
| `vite.config.ts` | Sentry plugin + chunking + terser |
| `scripts/generate-version.cjs` | Génère `public/version.json` au build |
| `.env.production.example` | Template variables d'environnement |
| `CLAUDE.md` | Instructions projet pour Claude |

## Démarrage

```bash
# 1. Créer le projet depuis ce template
gh repo create mon-projet --template <ton-user>/vite-supabase-starter --private
# ou
git clone https://github.com/<ton-user>/vite-supabase-starter mon-projet
cd mon-projet && rm -rf .git && git init

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.production.example .env.production
# Remplir les valeurs : Supabase URL, Anon Key, Sentry DSN

# 4. Adapter les ⚠️ dans les fichiers
grep -r "⚠️" src/ vite.config.ts

# 5. Démarrer
npm run dev
```

## Dépendances requises

```bash
npm install @sentry/react @sentry/vite-plugin
npm install @tanstack/react-query @tanstack/query-persist-client-core @tanstack/query-async-storage-persister
npm install @supabase/supabase-js
npm install react-router-dom
npm install react-hot-toast
npm install react-error-boundary
npm install clsx tailwind-merge
npm install lucide-react
```

## Variables d'environnement

Voir `.env.production.example`.

`SENTRY_AUTH_TOKEN` → Vercel Dashboard uniquement (jamais dans les fichiers).

## Checklist avant premier déploiement

- [ ] Adapter `allowUrls` dans `monitoring.ts`
- [ ] Adapter `org` et `project` Sentry dans `vite.config.ts`
- [ ] Adapter `x-application-name` dans `supabase.ts`
- [ ] Remplir `.env.production` avec les vraies valeurs
- [ ] Configurer `SENTRY_AUTH_TOKEN` sur Vercel
- [ ] Remplir `CLAUDE.md` avec la description du projet
