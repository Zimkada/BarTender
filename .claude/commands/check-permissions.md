# check-permissions — Auditer les permissions d'un composant ou flux

Vérifie qu'un composant ou une page respecte correctement le système RBAC du projet.

## Argument attendu

`/check-permissions <fichier-ou-fonctionnalité>`

## Étapes

1. Lire le composant/hook/page cible
2. Identifier toutes les actions qui nécessitent une permission
3. Vérifier que chaque action est protégée par :
   - `hasPermission('...')` ou `canAccess('...')` côté UI
   - RLS Supabase côté DB
4. Vérifier que les 4 rôles sont couverts (super_admin, promoteur, gerant, serveur)
5. Détecter les accès manquants ou trop permissifs
6. Lister les corrections à apporter

## Rôles et permissions clés à vérifier

- `super_admin` : tout autorisé
- `promoteur` : gère ses propres bars
- `gerant` : stocks + dépenses, pas de création d'utilisateurs
- `serveur` : ventes uniquement, pas de modification produits
