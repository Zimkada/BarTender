# [Nom du projet] — Instructions pour Claude

## Présentation

[Décrire le projet en 2-3 lignes : type d'app, domaine, stack.]

---

## Stack

| Couche         | Technologie                                      |
|----------------|--------------------------------------------------|
| Frontend       | React 18+, TypeScript strict, Vite               |
| State serveur  | TanStack React Query 5                           |
| State client   | React Context API                                |
| Backend        | Supabase (PostgreSQL + Auth + Realtime)          |
| UI             | Tailwind CSS + Radix UI                          |
| Monitoring     | Sentry (via `src/lib/monitoring.ts`)             |
| Déploiement    | Vercel                                           |

---

## Commandes

```bash
npm run dev           # Dev server
npm run build         # Build production
npm run lint          # ESLint
npm test              # Tests watch mode
npx supabase db push  # Push schema
```

---

## Architecture

### Providers (main.tsx)

```
QueryClientProvider
  └─ Toaster
      └─ [AuthProvider]
          └─ [ThemeProvider]
              └─ ErrorBoundary
                  └─ RouterProvider
```

### Routing (src/routes/)

```
/auth/*   → AuthLayout    (public)
/*        → RootLayout    (authentifié)
/admin/*  → AdminLayout   (admin uniquement)
```

### Dossiers

```
src/
├── components/
│   ├── ui/          # Design system (Button, Input, etc.)
│   └── common/      # ErrorFallback, etc.
├── context/         # Providers React
├── hooks/           # Custom hooks
├── layouts/         # RootLayout, AuthLayout, etc.
├── lib/             # supabase.ts, react-query.ts, monitoring.ts
├── pages/           # Pages
├── routes/          # createBrowserRouter
├── services/        # Appels DB Supabase
├── types/           # Types globaux
└── utils/           # cn.ts, lazyWithRetry.ts, errorHandler.ts
```

---

## Règles projet

### Données vs Actions

```typescript
// ✅ Données via hooks/queries dédiés
const { data: items } = useItems(tenantId);

// ✅ Actions via Context
const { addItem } = useAppContext();

// ❌ Ne pas stocker les données dans le Context
const { items } = useAppContext(); // anti-pattern
```

### Lazy loading — toujours lazyWithRetry

```typescript
// ✅ Avec retry automatique
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));

// ❌ Sans retry
const Dashboard = lazy(() => import('./pages/Dashboard'));
```

### Erreurs — toujours getErrorMessage

```typescript
// ✅
catch (error) {
  const msg = getErrorMessage(error);
}

// ❌
catch (error: any) {
  console.error(error.message);
}
```

### Monitoring — jamais Sentry directement

```typescript
// ✅
import { captureError } from '@/lib/monitoring';
captureError(error, { context: 'foo' });

// ❌
import * as Sentry from '@sentry/react';
Sentry.captureException(error);
```

---

## RBAC

[Décrire les rôles et permissions du projet.]

---

## Supabase

### Isolation multi-tenant

Toujours filtrer par `tenant_id` (ou `bar_id`, `org_id`, etc.) — jamais de query cross-tenant.

### RLS

Toutes les tables ont RLS activé. Vérifier avec `/review-rls` avant déploiement.

---

## Déploiement — Checklist

- [ ] `npm run build` sans erreur
- [ ] `npm run lint` sans warning
- [ ] Variables d'env à jour sur Vercel
- [ ] `SENTRY_AUTH_TOKEN` configuré sur Vercel
- [ ] Migrations DB appliquées (`npx supabase db push`)
- [ ] Si développé sur Windows → supprimer `package-lock.json` avant push
