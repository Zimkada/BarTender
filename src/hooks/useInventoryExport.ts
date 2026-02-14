import { useState } from 'react';
import { Product, ProductStockInfo, Category } from '../types';
import { useInventoryHistory } from './useInventoryHistory';
import { dateToYYYYMMDD } from '../utils/businessDateHelpers';
import { getErrorMessage } from '../utils/errorHandler';
import { useFeedback } from './useFeedback';

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
    const { showSuccess, showError } = useFeedback();

    const exportToExcel = async (
        mode: 'current' | 'historical',
        targetDate?: Date,
        authorName: string = 'Système'
    ) => {
        setIsExporting(true);
        try {
            // ✅ Lazy load XLSX library (saves ~142KB gzipped on initial bundle)
            const XLSX = await import('xlsx');

            interface ExportRow {
                [key: string]: string | number;
            }

            let data: ExportRow[] = [];
            let title = '';
            let subtitle = '';

            const now = new Date();
            const dateStr = dateToYYYYMMDD(now);
            const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            if (mode === 'historical' && targetDate) {
                // --- MODE HISTORIQUE (TIME TRAVEL) ---
                title = `INVENTAIRE HISTORIQUE RECONSTITUÉ`;

                // ✅ FIX: Display actual target time, not hardcoded "06:00"
                const targetDateStr = targetDate.toLocaleDateString('fr-FR');
                const targetTimeStr = targetDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                subtitle = `Date Cible : ${targetDateStr} ${targetTimeStr} | Généré le ${dateStr} à ${timeStr}`;

                // 1. Lancer le calcul lourd
                const historicalRecords = await calculateHistoricalStock(targetDate);

                // 2. Formater pour Excel
                data = historicalRecords.map(record => {
                    const product = products.find(p => p.id === record.productId);
                    const category = categories.find(c => c.id === product?.categoryId);

                    // ✅ FIX CRITIQUE: Use currentAverageCost (CUMP), NOT sale price
                    const costPrice = product?.currentAverageCost ?? 0;

                    return {
                        'Catégorie': category?.name || 'Sans catégorie',
                        'Produit': record.productName,
                        'Volume': product?.volume || '-',

                        // Colonnes Clés
                        'Stock Calculé (T)': record.historicalStock,
                        'Stock Actuel (Réel)': record.currentStock,

                        // Audit Mouvements (Transition T -> Maintenant)
                        'Ventes depuis T': record.movements.sales,
                        'Approv. depuis T': record.movements.supplies,
                        'Ajust. depuis T': record.movements.adjustments,
                        'Retours depuis T': record.movements.returns,
                        'Consign. récup. depuis T': record.movements.consignments, // ✅ NEW column

                        // Infos Prix
                        'Prix Achat CUMP': costPrice,
                        'Prix Vente': product?.price || 0,
                        'Valeur Stock (Achat)': record.historicalStock * costPrice
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

                    // ✅ Use CUMP (cost price), not sale price for valuation
                    const costPrice = product.currentAverageCost ?? 0;

                    return {
                        'Catégorie': category?.name || 'Sans catégorie',
                        'Produit': product.name,
                        'Volume': product.volume,

                        // Stocks
                        'Stock Total (Physique)': physical,
                        'Dont Consigné': consigned,
                        'Disponible Vente': available,

                        // Valeurs
                        'Prix Achat CUMP': costPrice,
                        'Prix Vente': product.price,
                        'Valeur Stock (Achat)': physical * costPrice,
                        'Valeur Stock (Vente)': physical * product.price,

                        // Colonnes pour pointage manuel
                        'Stock Compté (Manuel)': '',
                        'Écart': '',
                        'Notes': ''
                    };
                });
            }

            // 3. Génération du Fichier Excel
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);

            // Auto-size columns for better readability
            const headers = Object.keys(data[0] || {});
            const columnWidths: { wch: number }[] = [];

            headers.forEach((header, colIndex) => {
                let maxWidth = header.length;
                data.forEach((row) => {
                    const cellValue = String(row[header] || '');
                    maxWidth = Math.max(maxWidth, cellValue.length);
                });
                columnWidths[colIndex] = { wch: Math.min(maxWidth + 2, 50) };
            });

            ws['!cols'] = columnWidths;

            XLSX.utils.book_append_sheet(wb, ws, "Inventaire");

            // Sauvegarde
            // ✅ FIX: Explicit naming for clarity
            const modeLabel = mode === 'historical' ? 'RECONSTITUTION' : 'PHYSIQUE';

            // ✅ FIX: Use target date for filename if historical, otherwise use generation date
            const fileDateStr = (mode === 'historical' && targetDate)
                ? dateToYYYYMMDD(targetDate)
                : dateStr;

            const fileName = `Inventaire_${barName}_${modeLabel}_${fileDateStr}.xlsx`;
            XLSX.writeFile(wb, fileName);

            // ✅ Success notification
            showSuccess(`Export Excel généré : ${fileName}`);

        } catch (error) {
            console.error("Erreur export Excel:", error);
            const errorMessage = getErrorMessage(error);

            // ✅ FIX: Use notification system instead of alert()
            showError(`Erreur lors de la génération de l'export: ${errorMessage}`);
        } finally {
            setIsExporting(false);
        }
    };

    return {
        exportToExcel,
        isExporting: isExporting || isCalculating
    };
}
