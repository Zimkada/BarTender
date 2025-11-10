# 🛡️ Testing Super Admin System

> Guide de test pour le système Super Administrateur

---

## 🎯 Fonctionnalités Implémentées

### ✅ Phase 1: Infrastructure Super Admin (COMPLÉTÉE)

1. **Nouveau rôle `super_admin`**
   - Ajouté dans `UserRole` type
   - Permissions spéciales définies dans `ROLE_PERMISSIONS`

2. **Compte Super Admin créé**
   - Username: `admin`
   - Password: `Admin@2025`
   - Email: `admin@bartender.bj`
   - ID: `super_admin_001`

3. **SuperAdminDashboard Component**
   - Modal plein écran avec design purple/indigo
   - 4 cartes statistiques (Total Bars, Promoteurs, Bars Actifs, CA Total)
   - Formulaire création promoteur
   - Liste de tous les bars avec actions (Suspendre/Activer)

4. **Intégration UI**
   - Bouton purple dans Header (mobile + desktop)
   - Protection via `RoleBasedComponent` avec permission `canAccessAdminDashboard`
   - Icône ShieldCheck pour identifier le super admin

---

## 🧪 Plan de Test

### **Test 1: Connexion Super Admin**

**Objectif:** Vérifier que le super admin peut se connecter

**Étapes:**
1. Ouvrir http://localhost:5173
2. Si déjà connecté, se déconnecter
3. Commencer à taper username: `admin`
   - ✅ Le sélecteur de bar **disparaît automatiquement**
4. Credentials:
   - Username: `admin`
   - Password: `Admin@2025`
5. Cliquer sur "Se connecter" (PAS besoin de sélectionner un bar)

**Résultat attendu:**
- ✅ Sélecteur de bar caché quand username = "admin"
- ✅ Connexion réussie sans sélection de bar
- ✅ Header affiche "Super Admin" comme rôle
- ✅ Icône ShieldCheck (bouclier) visible dans le header
- ✅ Bouton purple "Admin Dashboard" visible à côté du bouton déconnexion

---

### **Test 2: Accès Admin Dashboard**

**Objectif:** Vérifier que le super admin peut ouvrir le dashboard

**Étapes:**
1. Connecté en tant que super admin
2. Cliquer sur le bouton purple avec icône ShieldCheck dans le header

**Résultat attendu:**
- ✅ Modal plein écran s'ouvre
- ✅ Titre "Super Admin Dashboard" avec fond purple/indigo
- ✅ 4 cartes statistiques affichées:
  - Total Bars
  - Promoteurs
  - Bars Actifs
  - CA Total (0 FCFA pour le moment)

---

### **Test 3: Créer un Promoteur**

**Objectif:** Vérifier que le super admin peut créer un nouveau promoteur + bar

**Étapes:**
1. Dans l'Admin Dashboard, cliquer sur "Créer un Promoteur"
2. Remplir le formulaire:
   - **Prénom:** Jean
   - **Nom:** Kouassi
   - **Email:** jean.kouassi@example.com
   - **Téléphone:** 97123456
   - **Mot de passe:** Test123
   - **Nom du Bar:** Bar La Plage
   - **Adresse:** Cotonou, Bénin (optionnel)
   - **Téléphone Bar:** 97654321 (optionnel)
3. Cliquer sur "Créer le Promoteur"

**Résultat attendu:**
- ✅ Alert affiche les credentials créés
- ✅ Formulaire se réinitialise
- ✅ Nouveau bar apparaît dans la liste des bars en bas
- ✅ Stats "Total Bars" et "Promoteurs" s'incrémentent

---

### **Test 4: Suspendre/Activer un Bar**

**Objectif:** Vérifier que le super admin peut suspendre/activer des bars

**Étapes:**
1. Dans la liste des bars, trouver "Bar Demo"
2. Cliquer sur "Suspendre"
3. Confirmer l'action
4. Observer le changement de statut
5. Cliquer sur "Activer" pour réactiver

**Résultat attendu:**
- ✅ Badge passe de "Actif" (vert) à "Suspendu" (rouge)
- ✅ Stat "Bars Actifs" se décrémente/incrémente
- ✅ Bouton change de "Suspendre" à "Activer"

---

### **Test 5: Permissions Super Admin**

**Objectif:** Vérifier que seul le super admin voit le bouton Admin Dashboard

**Étapes:**
1. Se déconnecter
2. Se reconnecter en tant que promoteur:
   - Username: `promoteur`
   - Password: `1234`
3. Observer le header

**Résultat attendu:**
- ✅ Bouton purple Admin Dashboard **NON visible**
- ✅ Rôle affiché: "Promoteur" avec icône Crown

---

### **Test 6: Validation Formulaire**

**Objectif:** Vérifier que la validation fonctionne

**Étapes:**
1. Connecté en tant que super admin
2. Ouvrir Admin Dashboard
3. Cliquer "Créer un Promoteur"
4. Laisser tous les champs vides
5. Cliquer "Créer le Promoteur"

**Résultat attendu:**
- ✅ Erreurs de validation affichées en rouge sous chaque champ requis
- ✅ Email invalide: "Email invalide"
- ✅ Téléphone court: "Téléphone invalide"
- ✅ Mot de passe court: "Minimum 6 caractères"

---

### **Test 7: Affichage Mobile**

**Objectif:** Vérifier que le bouton Admin Dashboard est visible sur mobile

**Étapes:**
1. Ouvrir DevTools (F12)
2. Basculer en mode mobile (Ctrl+Shift+M)
3. Connecté en tant que super admin
4. Observer le header mobile

**Résultat attendu:**
- ✅ Bouton purple compact (16px icon) visible
- ✅ Bouton bien placé entre SyncStatusBadge et Logout

---

### **Test 8: Impersonation (Mode Impersonation)**

**Objectif:** Vérifier que le super admin peut se connecter en tant qu'un promoteur

**Étapes:**
1. Connecté en tant que super admin
2. Ouvrir Admin Dashboard
3. Trouver "Bar Demo" dans la liste des bars
4. Cliquer sur le bouton orange "Impersonate"

**Résultat attendu:**
- ✅ Modal se ferme automatiquement
- ✅ Bannière jaune "Mode Impersonation" apparaît sous le header
- ✅ Texte indique "Connecté en tant que Promoteur Principal"
- ✅ Bouton "Retour Admin" visible dans la bannière
- ✅ Interface change pour celle du promoteur (produits, ventes, etc.)
- ✅ Header affiche "Promoteur" comme rôle (pas Super Admin)
- ✅ Sélecteur de bar visible (fonctionnalité promoteur)

**Test Retour Admin:**
1. Cliquer sur "Retour Admin" dans la bannière jaune
2. Observer le changement

**Résultat attendu:**
- ✅ Bannière jaune disparaît
- ✅ Retour à l'interface Super Admin (écran de bienvenue purple)
- ✅ Header affiche "Super Admin" comme rôle
- ✅ Session originale restaurée

---

## 🐛 Problèmes Connus / Limitations

### À Implémenter Plus Tard

1. **Statistiques CA Total**
   - Actuellement 0 FCFA
   - Nécessite agrégation de toutes les ventes de tous les bars

2. **Filtres et Recherche**
   - Pas de filtre sur la liste des bars
   - Pas de recherche par nom

3. **Pagination**
   - Affiche tous les bars (OK pour <100 bars)

4. **Bouton "Stats" sur chaque bar**
   - Affiche un placeholder (à implémenter)

---

## 📝 Données de Test

### Comptes Utilisateurs

| Rôle | Username | Password | Email |
|------|----------|----------|-------|
| Super Admin | `admin` | `Admin@2025` | admin@bartender.bj |
| Promoteur | `promoteur` | `1234` | promoteur@bar.com |
| Gérant | `gerant1` | `1234` | gerant@bar.com |
| Serveur | `serveur1` | `1234` | - |

### Bars Existants

| Nom | Owner | Actif |
|-----|-------|-------|
| Bar Demo | Promoteur Principal | ✅ Oui |

---

## ✅ Checklist Tests

- [ ] Test 1: Connexion Super Admin
- [ ] Test 2: Accès Admin Dashboard
- [ ] Test 3: Créer un Promoteur
- [ ] Test 4: Suspendre/Activer un Bar
- [ ] Test 5: Permissions Super Admin
- [ ] Test 6: Validation Formulaire
- [ ] Test 7: Affichage Mobile
- [ ] Test 8: Impersonation (Mode Impersonation)

---

## 🚀 Prochaines Étapes

Après validation des tests ci-dessus:

1. **Stats Globales CA**
   - Calculer CA total de tous les bars
   - Graphiques évolution par bar

2. **Backend Supabase**
   - Migration schéma multi-tenant
   - RLS policies par barId
   - RPC functions

3. **BarCreateModal** (pour promoteurs)
   - UI pour que promoteurs créent leurs propres bars
   - Workflow simplifié

---

## ✅ Fonctionnalités Implémentées (Session Actuelle)

### Phase 1: Infrastructure Super Admin
- ✅ Nouveau rôle `super_admin` avec permissions spéciales
- ✅ Compte admin unique (admin@bartender.bj / Admin@2025)
- ✅ SuperAdminDashboard component (4 stats + formulaire + liste bars)
- ✅ Intégration UI (bouton purple Header mobile/desktop)
- ✅ Protection via RoleBasedComponent
- ✅ Interface dédiée Super Admin (écran bienvenue purple)

### Phase 2: Impersonation Feature
- ✅ AuthContext: isImpersonating, originalSession, impersonate(), stopImpersonation()
- ✅ Bouton "Impersonate" (orange) sur chaque bar card
- ✅ Bannière jaune "Mode Impersonation" dans Header (mobile + desktop)
- ✅ Bouton "Retour Admin" pour restaurer session
- ✅ Persistence localStorage des sessions
- ✅ Fermeture automatique dashboard après impersonation

---

*Dernière mise à jour: Novembre 2025 - Super Admin + Impersonation Implementation*
