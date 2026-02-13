import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Product, ProductStockInfo, Category } from '../types';
import { useInventoryHistory } from './useInventoryHistory';
import { dateToYYYYMMDD } from '../utils/businessDateHelpers';

interface UseInventoryExportProps {
    barId: string;
    barName: string;
    products: Product[];
    categories: Category[];
    getStockInfo: (id: string) => ProductStockInfo | null;
}

export function useInventoryExport({
    barId,
    barName,
    products,
    categories,
    getStockInfo
}: UseInventoryExportProps) {
    const { calculateHistoricalStock, isCalculating } = useInventoryHistory({ barId, products });
    const [isExporting, setIsExporting] = useState(false);

    const exportToExcel = async (
        mode: 'current' | 'historical',
        targetDate?: Date,
        authorName: string = 'Système'
    ) => {
        setIsExporting(true);
        try {
            let data: any[] = [];
            let title = '';
            let subtitle = '';

            const now = new Date();
            const dateStr = dateToYYYYMMDD(now);
            const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            if (mode === 'historical' && targetDate) {
                // --- MODE HISTORIQUE (TIME TRAVEL) ---
                title = `INVENTAIRE HISTORIQUE RECONSTITUÉ`;
                subtitle = `Date Cible : ${targetDate.toLocaleDateString('fr-FR')} 06:00 | Généré le ${dateStr} à ${timeStr}`;

                // 1. Lancer le calcul lourd
                const historicalRecords = await calculateHistoricalStock(targetDate);

                // 2. Formater pour Excel
                data = historicalRecords.map(record => {
                    const product = products.find(p => p.id === record.productId);
                    const category = categories.find(c => c.id === product?.categoryId);
                    const stockInfo = getStockInfo(record.productId);

                    return {
                        'Catégorie': category?.name || 'Sans catégorie',
                        'Produit': record.productName,
                        'Volume': product?.volume || '-',

                        // Colonnes Clés
                        'Stock Calculé (Théorique)': record.historicalStock,
                        'Stock Actuel (Réel)': record.currentStock,

                        // Audit Mouvements (Transition T -> Maintenant)
                        'Ventes depuis T': record.movements.sales,
                        'Approv. depuis T': record.movements.supplies,
                        'Ajust. depuis T': record.movements.adjustments,
                        'Retours depuis T': record.movements.returns,

                        // Infos Prix
                        'P.Achat': product?.price || 0, // Fallback si pas de costPrice
                        'Valeur Stock (Est.)': record.historicalStock * (product?.price || 0)
                    };
                });

            } else {
                // --- MODE ACTUEL (SNAPSHOT) ---
                title = `INVENTAIRE PHYSIQUE`;
                subtitle = `Date : ${dateStr} | Heure : ${timeStr} | Par : ${authorName}`;

                data = products.map(product => {
                    const category = categories.find(c => c.id === product.categoryId);
                    const stockInfo = getStockInfo(product.id);

                    // Calculs
                    const physical = stockInfo?.physicalStock ?? product.stock;
                    const consigned = stockInfo?.consignedStock ?? 0;
                    const available = stockInfo?.availableStock ?? product.stock;

                    return {
                        'Catégorie': category?.name || 'Sans catégorie',
                        'Produit': product.name,
                        'Volume': product.volume,

                        // Stocks
                        'Stock Total (Physique)': physical,
                        'Dont Consigné': consigned,
                        'Disponible Vente': available,

                        // Valeurs
                        'Prix Vente': product.price,
                        'Valeur Vente Totale': physical * product.price,

                        // Colonnes pour pointage manuel
                        'Stock Compté (Manuel)': '',
                        'Écart': '',
                        'Notes': ''
                    };
                });
            }

            // 3. Génération du Fichier Excel
            const wb = XLSX.utils.book_new();

            // Worksheet
            const ws = XLSX.utils.json_to_sheet(data);

            // Styling Header (Hack via cell styles impossible en version community basic, on fait du contenu)
            XLSX.utils.book_append_sheet(wb, ws, "Inventaire");

            // Sauvegarde
            const fileName = `Inventaire_${barName}_${mode}_${dateStr}.xlsx`;
            XLSX.writeFile(wb, fileName);

        } catch (error) {
            console.error("Erreur export Excel", error);
            alert("Erreur lors de la génération de l'export.");
        } finally {
            setIsExporting(false);
        }
    };

    return {
        exportToExcel,
        isExporting: isExporting || isCalculating
    };
}
