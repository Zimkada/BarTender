# Jours Fériés du Bénin - Référence pour Système de Prévisions

**Date de création :** 26 Novembre 2025
**Usage :** Configuration des facteurs d'ajustement dans le système de prévisions de ventes

---

## 📅 Jours Fériés Fixes (Pré-programmés)

| Date | Nom | Impact Suggéré | Facteur Multiplicatif | Justification |
|------|-----|----------------|----------------------|---------------|
| **1er janvier** | Nouvel An | Très Fort | 1.60 (+60%) | Célébrations importantes, forte affluence bars |
| **10 janvier** | Fête du Vodoun | Fort | 1.40 (+40%) | Fête culturelle majeure, rassemblements |
| **1er mai** | Fête du Travail | Moyen | 1.30 (+30%) | Jour férié populaire, sorties en famille |
| **1er août** | Fête Nationale (Indépendance) | Fort | 1.50 (+50%) | Célébrations nationales, événements |
| **26 octobre** | Fête des Forces Armées | Moyen | 1.30 (+30%) | Cérémonies officielles, sorties |
| **1er novembre** | Toussaint | Faible | 1.20 (+20%) | Jour férié religieux, activité modérée |
| **30 novembre** | Fête Nationale (Indépendance du Dahomey) | Fort | 1.40 (+40%) | Commémoration historique, festivités |
| **25 décembre** | Noël | Très Fort | 1.70 (+70%) | Fête majeure, forte consommation |
| **31 décembre** | Réveillon / Saint-Sylvestre | Très Fort | 1.65 (+65%) | Soirées exceptionnelles, pics de consommation |

---

## 🌙 Jours Fériés Variables (Saisie Manuelle Requise)

Ces jours changent chaque année selon le calendrier lunaire ou religieux. Ils doivent être ajoutés manuellement via l'interface de gestion des événements.

### **Fêtes Chrétiennes**

| Fête | Période Approximative | Impact Suggéré | Facteur Recommandé |
|------|----------------------|----------------|-------------------|
| **Lundi de Pâques** | Mars/Avril (variable) | Moyen | 1.35 (+35%) |
| **Ascension** | Mai/Juin (40j après Pâques) | Faible | 1.25 (+25%) |
| **Lundi de Pentecôte** | Mai/Juin (50j après Pâques) | Moyen | 1.30 (+30%) |
| **Assomption** | 15 août | Faible | 1.20 (+20%) |

### **Fêtes Musulmanes**

| Fête | Période Approximative | Impact Suggéré | Facteur Recommandé |
|------|----------------------|----------------|-------------------|
| **Aïd el-Fitr** (Fin du Ramadan) | Variable (calendrier lunaire) | Fort | 1.50 (+50%) |
| **Aïd el-Adha** (Tabaski) | Variable (calendrier lunaire) | Fort | 1.55 (+55%) |
| **Mawlid** (Naissance du Prophète) | Variable (calendrier lunaire) | Moyen | 1.30 (+30%) |

**Note :** Les dates exactes doivent être vérifiées chaque année et ajoutées dans la table `bar_events` avec `is_recurring = false`.

---

## 📊 Méthodologie des Facteurs d'Impact

### **Comment les facteurs ont été déterminés**

Les facteurs multiplicatifs sont basés sur :
1. **Importance culturelle** : Popularité et ampleur des célébrations
2. **Données historiques** : Analyse des ventes passées lors d'événements similaires
3. **Comportement consommateur** : Tendance à sortir et consommer lors de ces jours
4. **Durée de la fête** : Événements sur plusieurs jours ont un impact plus fort

### **Catégories d'Impact**

| Catégorie | Facteur | Description |
|-----------|---------|-------------|
| **Très Fort** | 1.60 - 1.70 | Jours exceptionnels (Noël, Réveillon, Nouvel An) |
| **Fort** | 1.40 - 1.55 | Fêtes nationales et religieuses majeures |
| **Moyen** | 1.25 - 1.35 | Jours fériés populaires avec sorties familiales |
| **Faible** | 1.15 - 1.25 | Jours fériés calmes, activité légèrement supérieure |

---

## 🔧 Implémentation Technique

### **Dans la Fonction SQL `get_date_factors()`**

```sql
-- Jours fériés fixes du Bénin
CASE
  WHEN EXTRACT(MONTH FROM p_date) = 1 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.60   -- Nouvel An
  WHEN EXTRACT(MONTH FROM p_date) = 1 AND EXTRACT(DAY FROM p_date) = 10 THEN 1.40  -- Fête Vodoun
  WHEN EXTRACT(MONTH FROM p_date) = 5 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.30   -- Fête Travail
  WHEN EXTRACT(MONTH FROM p_date) = 8 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.50   -- Indépendance
  WHEN EXTRACT(MONTH FROM p_date) = 10 AND EXTRACT(DAY FROM p_date) = 26 THEN 1.30 -- Forces Armées
  WHEN EXTRACT(MONTH FROM p_date) = 11 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.20  -- Toussaint
  WHEN EXTRACT(MONTH FROM p_date) = 11 AND EXTRACT(DAY FROM p_date) = 30 THEN 1.40 -- Dahomey
  WHEN EXTRACT(MONTH FROM p_date) = 12 AND EXTRACT(DAY FROM p_date) = 25 THEN 1.70 -- Noël
  WHEN EXTRACT(MONTH FROM p_date) = 12 AND EXTRACT(DAY FROM p_date) = 31 THEN 1.65 -- Réveillon
  ELSE 1.0
END as holiday_factor
```

### **Jours Variables via Table `bar_events`**

Pour ajouter un jour férié variable (ex: Aïd el-Fitr 2026) :

```sql
INSERT INTO bar_events (bar_id, event_type, event_name, event_date, impact_multiplier, is_recurring)
VALUES (
  'your-bar-id',
  'holiday',
  'Aïd el-Fitr 2026',
  '2026-04-11',  -- Date calculée selon calendrier lunaire
  1.50,
  false  -- Non récurrent (date change chaque année)
);
```

---

## 📝 Calendrier des Jours Fériés 2025-2026 (Référence)

### **2025**

| Date | Jour | Fête |
|------|------|------|
| 1er janvier 2025 | Mercredi | Nouvel An |
| 10 janvier 2025 | Vendredi | Fête du Vodoun |
| 30 mars 2025 | Dimanche | Aïd el-Fitr (estimation) |
| 21 avril 2025 | Lundi | Lundi de Pâques |
| 1er mai 2025 | Jeudi | Fête du Travail |
| 29 mai 2025 | Jeudi | Ascension |
| 5 juin 2025 | Jeudi | Aïd el-Adha/Tabaski (estimation) |
| 9 juin 2025 | Lundi | Lundi de Pentecôte |
| 1er août 2025 | Vendredi | Fête Nationale |
| 15 août 2025 | Vendredi | Assomption |
| 26 octobre 2025 | Dimanche | Fête des Forces Armées |
| 1er novembre 2025 | Samedi | Toussaint |
| 30 novembre 2025 | Dimanche | Fête Nationale Dahomey |
| 25 décembre 2025 | Jeudi | Noël |
| 31 décembre 2025 | Mercredi | Réveillon |

### **2026**

| Date | Jour | Fête |
|------|------|------|
| 1er janvier 2026 | Jeudi | Nouvel An |
| 10 janvier 2026 | Samedi | Fête du Vodoun |
| 20 mars 2026 | Vendredi | Aïd el-Fitr (estimation) |
| 6 avril 2026 | Lundi | Lundi de Pâques |
| 1er mai 2026 | Vendredi | Fête du Travail |
| 14 mai 2026 | Jeudi | Ascension |
| 25 mai 2026 | Lundi | Lundi de Pentecôte |
| 27 mai 2026 | Mercredi | Aïd el-Adha/Tabaski (estimation) |
| 1er août 2026 | Samedi | Fête Nationale |
| 15 août 2026 | Samedi | Assomption |
| 26 octobre 2026 | Lundi | Fête des Forces Armées |
| 1er novembre 2026 | Dimanche | Toussaint |
| 30 novembre 2026 | Lundi | Fête Nationale Dahomey |
| 25 décembre 2026 | Vendredi | Noël |
| 31 décembre 2026 | Jeudi | Réveillon |

**Note :** Les dates des fêtes musulmanes sont des **estimations** basées sur le calendrier lunaire. Les dates réelles doivent être confirmées chaque année.

---

## 🎯 Bonnes Pratiques

### **Pour les Gérants de Bars**

1. **Vérifier annuellement** les dates des jours fériés variables (Pâques, Ramadan, Tabaski)
2. **Ajouter les événements locaux** spécifiques à votre région (festivals, événements culturels)
3. **Ajuster les facteurs** selon votre expérience terrain :
   - Si Noël génère +100% dans votre bar → modifier le facteur à 2.0
   - Si certains jours fériés n'ont pas d'impact → réduire le facteur à 1.0
4. **Planifier les stocks** en conséquence pour les jours à fort impact

### **Pour les Développeurs**

1. **Synchroniser annuellement** : Créer une routine pour mettre à jour les jours fériés variables
2. **Permettre la personnalisation** : Les facteurs doivent pouvoir être ajustés par bar
3. **Historiser l'impact réel** : Comparer les prévisions avec les ventes réelles pour affiner les facteurs
4. **Documentation utilisateur** : Expliquer comment ajouter/modifier des événements

---

## 📚 Sources

- **Jours fériés officiels du Bénin** : Loi n°65-12 du 15 juin 1965 et décrets subséquents
- **Calendrier béninois** : Ministère du Travail et de la Fonction Publique
- **Fêtes religieuses** : Calendriers chrétien et musulman (dates variables)
- **Facteurs d'impact** : Analyse empirique basée sur le comportement consommateur dans le secteur HoReCa (Hôtellerie-Restauration-Café) au Bénin

---

## 🔄 Mise à Jour du Document

Ce document doit être révisé **annuellement** pour :
- Mettre à jour les dates des fêtes variables (Pâques, Ramadan, Tabaski)
- Ajuster les facteurs d'impact selon les retours terrain
- Ajouter de nouveaux jours fériés si déclarés par le gouvernement
- Intégrer les événements culturels récurrents significatifs

**Dernière mise à jour :** 26 Novembre 2025
**Prochaine révision recommandée :** Janvier 2026

---

**Document créé pour :** BarTender - Application de Gestion de Bars
**Responsable :** Équipe Développement
**Statut :** ✅ Validé et Prêt à l'Usage
