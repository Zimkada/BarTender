/**
 * anomalyDetection.ts
 * Utilitaire centralisé pour détecter les anomalies de données et de gestion
 * sur les produits de l'inventaire.
 */

import { Product, ProductStockInfo, BarSettings } from '../types';

export type AnomalySeverity = 'red' | 'orange' | 'yellow';

export interface ProductAnomaly {
    type: string;
    label: string;
    severity: AnomalySeverity;
}

/**
 * Détecte les anomalies pour un produit donné.
 */
export function detectProductAnomaly(
    product: Product,
    stockInfo: ProductStockInfo | null,
    barSettings: BarSettings | undefined
): ProductAnomaly | null {
    if (!stockInfo) return null;

    // --- 1. ANOMALIES CRITIQUES (ROUGE) ---

    // Stock physique négatif (Corruption ou erreur synchro)
    if (stockInfo.physicalStock < 0) {
        return {
            type: 'NEGATIVE_PHYSICAL',
            label: `Stock physique incohérent (${stockInfo.physicalStock})`,
            severity: 'red'
        };
    }

    // Stock disponible négatif (Conflit de vente offline)
    if (stockInfo.availableStock < 0) {
        return {
            type: 'NEGATIVE_AVAILABLE',
            label: `Conflit de vente offline (Dispo: ${stockInfo.availableStock})`,
            severity: 'red'
        };
    }

    // --- 2. ANOMALIES LOGIQUES (ORANGE) ---

    // Consignation supérieure au stock physique (Impossible)
    if (stockInfo.consignedStock > stockInfo.physicalStock) {
        return {
            type: 'CONSIGNMENT_OVERFLOW',
            label: 'Consignations > Stock réel',
            severity: 'orange'
        };
    }

    // Produit Sans Catégorie
    if (!product.categoryId || product.categoryId === 'none') {
        return {
            type: 'NO_CATEGORY',
            label: 'Non classé : Aucune catégorie',
            severity: 'orange'
        };
    }

    // --- 3. ANOMALIES FINANCIÈRES & GESTION (JAUNE) ---

    // Vente à perte (CUMP ou coût initial > Prix Vente)
    const cost = product.currentAverageCost || product.initialUnitCost || 0;
    if (cost > 0 && cost >= product.price) {
        return {
            type: 'PRICE_BELOW_COST',
            label: `Vente à perte (Coût: ${cost} >= Prix: ${product.price})`,
            severity: 'yellow'
        };
    }

    // Valeur indéterminée (Stock présent mais aucun coût renseigné — ni CUMP, ni initial)
    if (stockInfo.physicalStock > 0 && cost <= 0) {
        return {
            type: 'MISSING_COST',
            label: 'Coût d\'achat non renseigné',
            severity: 'yellow'
        };
    }

    // Stock Dormant (Immobilisation)
    // Heuristique de transition (en attendant un vrai champ last_sold_at en DB) :
    // - On utilise updatedAt comme proxy de la dernière activité (approvisionnement, ajustement).
    //   À défaut, on retombe sur createdAt.
    // - Le seuil de stock est relatif au seuil d'alerte de réappro : si le stock est
    //   encore largement au-dessus du seuil d'alerte, c'est que le produit ne tourne pas.
    // - 3 cycles d'approvisionnement sans activité = considéré dormant.
    const frequency = barSettings?.supplyFrequency || 7;
    const lastActivity = product.updatedAt ?? product.createdAt;
    const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    const stockThreshold = Math.max(product.alertThreshold * 2, 1);

    if (stockInfo.physicalStock > stockThreshold && daysSinceActivity > frequency * 3) {
        return {
            type: 'DORMANT_STOCK',
            label: `Stock dormant (> ${Math.floor(daysSinceActivity)}j sans mouvement)`,
            severity: 'yellow'
        };
    }

    return null;
}

/**
 * Détecte les doublons potentiels dans une liste de produits.
 * (Même volume + Nom similaire)
 */
export function findDuplicateAnomaly(
    product: Product,
    allProducts: Product[]
): ProductAnomaly | null {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetName = normalize(product.name);
    const targetVolume = product.volume?.toLowerCase().trim();

    const duplicate = allProducts.find(p =>
        p.id !== product.id &&
        normalize(p.name) === targetName &&
        p.volume?.toLowerCase().trim() === targetVolume
    );

    if (duplicate) {
        return {
            type: 'POTENTIAL_DUPLICATE',
            label: `Doublon probable : Nom identique à [${duplicate.name}]`,
            severity: 'yellow'
        };
    }

    return null;
}
