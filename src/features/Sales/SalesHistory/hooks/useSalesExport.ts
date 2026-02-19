import { useCallback } from 'react';
import { UnifiedReturn } from '../../../../hooks/pivots/useUnifiedReturns';
import { Sale, SaleItem, Return, User, BarMember, Category, Product } from '../../../../types';
import { getSaleDate } from '../../../../utils/saleHelpers';
import { useNotifications } from '../../../../components/Notifications';

interface UseSalesExportProps {
    filteredSales: Sale[];
    filteredReturns: (Return | UnifiedReturn)[];
    sales: Sale[]; // Needed to find original sale for returns/consignments
    returns: (Return | UnifiedReturn)[]; // Needed to find all returns related to sales
    products: Product[];
    categories: Category[];
    users: User[];
    barMembers: BarMember[];
    barId?: string; // ✨ NOUVEAU: Pour fetch intégral
    startDate?: string; // ✨ NOUVEAU
    endDate?: string; // ✨ NOUVEAU
    statusFilter?: string; // ✨ NOUVEAU
}

export function useSalesExport({
    filteredSales,
    filteredReturns,
    sales,
    returns,
    products,
    categories,
    users,
    barMembers,
    barId,
    startDate,
    endDate,
    statusFilter
}: UseSalesExportProps) {
    const { showNotification } = useNotifications();

    const exportSales = useCallback(async (format: 'csv' | 'excel') => {
        // ✨ NOUVEAU: Certification Perfection - Fetch intégral si besoin
        let salesToExport = filteredSales;
        let finalReturnsToExport = filteredReturns;

        // Si on est en mode Data Tier (limitée), on fetch tout pour l'export
        const isDataLimited = barId && (startDate || endDate);

        if (isDataLimited) {
            try {
                // Import dynamique pour éviter de charger les services si pas d'export
                const { SalesService } = await import('../../../../services/supabase/sales.service');
                const { ReturnsService } = await import('../../../../services/supabase/returns.service');
                const { mapSalesData } = await import('../../../../hooks/queries/useSalesQueries');
                const { mapReturnData } = await import('../../../../hooks/queries/useReturnsQueries');

                showNotification('info', "Génération d'un rapport intégral (Ceci peut prendre quelques secondes)...");

                const [fullSales, fullReturns] = await Promise.all([
                    SalesService.getBarSales(barId, {
                        startDate,
                        endDate,
                        status: statusFilter === 'all' ? undefined : (statusFilter || 'validated')
                    }),
                    ReturnsService.getReturns(barId, startDate, endDate)
                ]);

                salesToExport = mapSalesData(fullSales);
                finalReturnsToExport = mapReturnData(fullReturns);

                showNotification('success', "Données récupérées. Génération du fichier...");
            } catch (e) {
                console.error("Erreur lors du fetch intégral pour export", e);
                showNotification('info', "L'exportation pourrait être incomplète suite à une erreur réseau.");
            }
        }

        if (salesToExport.length === 0 && finalReturnsToExport.length === 0) {
            showNotification('error', "Aucune donnée à exporter");
            return;
        }

        // Préparer les données avec la nouvelle structure: lignes pour ventes + lignes pour retours
        const exportData: any[] = [];

        // 1. Ajouter toutes les ventes
        salesToExport.forEach(sale => {
            // Source of truth: soldBy is the business attribution
            const serverUserId = sale.soldBy;
            const user = users.find(u => u.id === serverUserId);
            const member = barMembers.find(m => m.userId === user?.id);
            const vendeur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

            // Déterminer le mode d'opération de cette vente
            const operationMode = sale.serverId ? 'Simplifié' : 'Complet';

            const saleDate = getSaleDate(sale);
            // Get actual transaction time (not business date which is normalized to midnight)
            const saleTimestamp = sale.validatedAt || sale.createdAt;

            sale.items.forEach((item: SaleItem) => {
                const name = item.product_name;
                const volume = item.product_volume || '';
                const price = item.unit_price;
                // For now, we can try to find product to get category
                const product = products.find(p => p.id === item.product_id);
                const category = categories.find(c => c.id === product?.categoryId);
                const cost = 0; // TODO: Calculer depuis Supply
                const total = price * item.quantity;
                const benefice = (price - cost) * item.quantity;

                exportData.push({
                    'Type': 'Vente',
                    'Mode': operationMode,
                    'Date': saleDate.toLocaleDateString('fr-FR'),
                    'Heure': new Date(saleTimestamp).toLocaleTimeString('fr-FR'),
                    'ID Transaction': sale.id.slice(-6),
                    'Produit': name,
                    'Catégorie': category?.name || 'Non classé',
                    'Volume': volume,
                    'Quantité': item.quantity,
                    'Prix unitaire': price,
                    'Coût unitaire': cost,
                    'Total': total,
                    'Bénéfice': benefice,
                    'Utilisateur': vendeur,
                    'Rôle': role,
                    'Statut': sale.status,
                    'Devise': sale.currency,
                    '_sortTimestamp': new Date(saleTimestamp).getTime() // ✨ Caché pour tri
                });
            });
        });

        // 2. Ajouter les retours
        finalReturnsToExport.forEach(ret => {
            // Récupérer le produit via productId
            const product = products.find(p => p.id === ret.productId);
            if (!product) {
                console.warn('⚠️ Retour avec produit introuvable:', ret.id);
                return;
            }

            // Source of truth: server_id is the business attribution for returns
            const serverUserId = ret.server_id;
            const user = users.find(u => u.id === serverUserId);
            const member = barMembers.find(m => m.userId === user?.id);
            const utilisateur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

            // Déterminer le mode d'opération de ce retour (basé sur la vente originale)
            const originalSale = sales.find(s => s.id === ret.saleId);
            const operationMode = originalSale?.serverId ? 'Simplifié' : 'Complet';

            const category = categories.find(c => c.id === product.categoryId);
            const cost = 0; // TODO: Calculer depuis Supply
            const total = ret.isRefunded ? -ret.refundAmount : 0; // Négatif si remboursé
            const benefice = ret.isRefunded ? -(ret.refundAmount - (cost * ret.quantityReturned)) : 0;

            exportData.push({
                'Type': 'Retour',
                'Mode': operationMode,
                'Date': new Date(ret.returnedAt).toLocaleDateString('fr-FR'),
                'Heure': new Date(ret.returnedAt).toLocaleTimeString('fr-FR'),
                'ID Transaction': ret.id.slice(-6),
                'Produit': ret.productName,
                'Catégorie': category?.name || 'Non classé',
                'Volume': ret.productVolume || '',
                'Quantité': -ret.quantityReturned, // Négatif pour indiquer retour
                'Prix unitaire': product.price,
                'Coût unitaire': cost,
                'Total': total,
                'Bénéfice': benefice,
                'Utilisateur': utilisateur,
                'Rôle': role,
                'Devise': 'XOF',
                '_sortTimestamp': new Date(ret.returnedAt).getTime() // ✨ Caché pour tri
            });
        });

        // ✅ Trier par date/heure décroissante (plus récent d'abord)
        exportData.sort((a, b) => {
            const timestampA = (a as any)._sortTimestamp || 0;
            const timestampB = (b as any)._sortTimestamp || 0;
            return timestampB - timestampA; // Décroissant (plus récent en premier)
        });

        // ✨ Supprimer le champ caché de tri avant d'exporter
        exportData.forEach(row => {
            delete (row as any)._sortTimestamp;
        });

        const fileName = `ventes_${new Date().toISOString().split('T')[0]}`;

        if (exportData.length === 0) {
            showNotification('error', 'Aucune donnée à exporter');
            return;
        }

        if (format === 'excel') {
            try {
                // Lazy load XLSX library only when export is triggered
                const XLSX = await import('xlsx');

                // Export Excel
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes');

                // Ajuster la largeur des colonnes
                const columnWidths = [
                    { wch: 10 }, // Type
                    { wch: 12 }, // Mode
                    { wch: 12 }, // Date
                    { wch: 10 }, // Heure
                    { wch: 12 }, // ID Transaction
                    { wch: 20 }, // Produit
                    { wch: 15 }, // Catégorie
                    { wch: 10 }, // Volume
                    { wch: 10 }, // Quantité
                    { wch: 12 }, // Prix unitaire
                    { wch: 12 }, // Coût unitaire
                    { wch: 12 }, // Total
                    { wch: 12 }, // Bénéfice
                    { wch: 15 }, // Utilisateur
                    { wch: 12 }, // Rôle
                    { wch: 8 },  // Devise
                    { wch: 12 }, // Statut
                    { wch: 15 }, // Client
                    { wch: 12 }  // Expiration
                ];
                worksheet['!cols'] = columnWidths;

                XLSX.writeFile(workbook, `${fileName}.xlsx`);
                showNotification('success', 'Export Excel généré avec succès');
            } catch (error) {
                console.error('❌ Erreur export Excel:', error);
                showNotification('error', `Erreur lors de l'export Excel`);
            }
        } else {
            // Export CSV
            const headers = Object.keys(exportData[0] || {});
            const csvContent = [
                headers.join(','),
                ...exportData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
            ].join('\n');

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${fileName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showNotification('success', 'Export CSV généré avec succès');
        }
    }, [filteredSales, filteredReturns, sales, returns, products, categories, users, barMembers, showNotification]);

    return { exportSales };
}
