# Rapport de Réconciliation de Stock : Guinness
**Période : Du 04/02/2026 au 12/02/2026**
**Établissement : Bar Restau Le Marché**

## 1. Synthèse des Mouvements Globaux
Le tableau ci-dessous retrace l'évolution du stock calculée à partir de l'état actuel (16 unités au 12/02) en remontant l'historique des ventes et des approvisionnements validés.

| Date | Événement | Flux (Qté) | Stock Final Journée |
| :--- | :--- | :---: | :---: |
| **04/02** | Ouverture / Ventes (7) / Appro (+12) | +5 | **25** |
| **05/02** | Aucune activité | 0 | **25** |
| **06/02** | Ventes (8) | -8 | **17** |
| **07/02** | Ventes (20) - *Rupture détectée* | -20 | **-3** |
| **08/02** | Ventes (15) / Appro (+24) | +9 | **6** |
| **09/02** | Ventes (3) | -3 | **3** |
| **10/02** | Ventes (4) / Appro (+24) | +20 | **23** |
| **11/02** | Ventes (7) | -7 | **16** |
| **12/02** | État actuel | - | **16** |

---

## 2. Détails Chronologiques pour le Promoteur

### A. Phase de Lancement (04/02)
*   **Stock à l'ouverture (04/02 06h00) :** 20 unités.
*   **Stock avant approvisionnement :** 13 unités (après 7 unités vendues).
*   **Approvisionnement (18:10) :** +12 unités.
*   **Stock après approvisionnement :** 25 unités.

### B. Situation au matin du 07/02
*   **Stock à l'ouverture du 07/02 :** 17 unités.
*   **Ventes totales de la journée :** 20 unités.
    *   Le stock informatique a été épuisé à partir de la 18ème unité vendue.

### C. Analyse de l'incident (Ventes Simultanées du 07/02)
L'analyse des logs montre que la rupture physique a été "forcée" par deux ventes rapprochées en fin de service (nuit du 08/02) :
1.  **Vente n°63edcb55 (01:40) :** 3 unités (Vendeur : `c4de...`). Le stock descend à **1 unité**.
2.  **Vente n°b8e3d295 (02:02) :** 4 unités (Vendeur : `3cef...`). Cette vente, réalisée alors qu'il ne restait qu'une bouteille théorique, a fait basculer le stock à **-3**.

**Conclusion technique :** Les deux serveurs ont servi les clients car les bouteilles étaient physiquement présentes au bar, ce qui prouve que le stock réel était supérieur au stock déclaré dans l'application (écart de 3 bouteilles).

### D. Régularisation
*   Le stock est resté négatif le 08/02 au matin suite à 15 ventes supplémentaires.
*   **Régularisation le 08/02 à 18:17 :** L'approvisionnement de 2 casiers (+24 unités) a ramené le stock en positif (+6).

---

## 3. Observations et Recommandations
1.  **Écart initial :** Il existait un écart de +3 bouteilles non saisies avant le 07/02.
2.  **Validation :** Le gérant a validé les ventes simultanées de 01:40 et 02:02, entérinant ainsi le fait que les produits ont bien été servis malgré l'alerte de stock.
3.  **Action :** Le stock actuel de **16 unités** au 12/02 est cohérent avec l'ensemble des mouvements saisis depuis le 04/02.
