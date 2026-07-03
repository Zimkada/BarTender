# Problème de Sécurité et Plan de Résolution (RLS)

## 1. Le Problème Identifié : Filtrage Côté Client
Actuellement, l'application sécurise l'affichage des données (Ventes, Consignations, Retours) principalement via le code JavaScript (Côté Client).

*   **Fonctionnement actuel** : L'application télécharge souvent plus de données que nécessaire (ex: toutes les consignations du bar) et le filtre ensuite sur le téléphone du serveur.
*   **Risque de Sécurité** : Un utilisateur malin pourrait inspecter les données reçues par son appareil et voir l'activité de ses collègues.
*   **Problème de Performance** : Télécharger des données inutiles consomme de la bande passante et ralentit l'application inutilement.

## 2. La Solution Proposée : Row Level Security (RLS)
Nous allons déplacer la logique de sécurité directement dans la base de données (Supabase/PostgreSQL).

### Les Règles Métier (Validées)
1.  **Gérants / Promoteurs / Admins** : Voient **TOUT**.
2.  **Serveurs** : Ne voient **QUE** ce qui les concerne directement.
    *   Soit ils ont créé l'élément (`sold_by` = Moi).
    *   Soit l'élément leur a été assigné (`server_id` = Moi).

### Implémentation Technique
Nous allons appliquer des "Policies" (Règles de sécurité) sur les tables `sales`, `returns`, et `consignments` :

```sql
-- Exemple de logique simplifiée pour un Serveur
(
  -- Je suis le créateur (Mode Complet)
  sold_by = auth.uid() 
  OR 
  -- Je suis le serveur assigné (Mode Simplifié)
  server_id = auth.uid()
)
-- OU j'ai un rôle de supervision (Gérant/Promoteur)
```

### Avantages
*   **Sécurité Maximale** : Impossible de voir les données d'autrui, même en "hackant" l'appli.
*   **Meilleure Performance** : La base de données ne renvoie que le strict nécessaire.
*   **Économie** : Réduction des coûts de transfert de données (Egress) chez Supabase.

---
*Ce document sert de référence pour l'implémentation technique des règles de sécurité.*
