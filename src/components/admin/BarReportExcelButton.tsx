import React, { useState } from 'react';
import { FileSpreadsheet, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

interface BarReportExcelButtonProps {
  bar: { id: string; name: string };
}

interface BarReport {
  report_meta: {
    generated_at: string;
    generated_by: string;
    report_date: string;
  };
  bar_info: {
    id: string;
    name: string;
    address: string;
    phone: string;
    is_active: boolean;
    status: string;
    created_at: string;
    closing_hour: number;
  };
  owner_info: {
    name: string;
    email: string;
  };
  daily_stats: {
    sales_count: number;
    total_revenue: number;
    average_sale: number;
  };
  top_products: Array<{
    product_name: string;
    volume: string;
    quantity_sold: number;
    revenue: number;
  }>;
  team: {
    active_members_count: number;
  };
  inventory: {
    stock_alerts_count: number;
  };
}

export const BarReportExcelButton: React.FC<BarReportExcelButtonProps> = ({ bar }) => {
  const [loading, setLoading] = useState(false);

  const handleGenerateExcel = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_generate_bar_report', {
        p_bar_id: bar.id
      });

      if (error) throw error;

      if (!data) {
        throw new Error('Aucune donnée reçue du serveur');
      }

      const report = data as BarReport;

      // Créer un nouveau classeur
      const wb = XLSX.utils.book_new();

      // ===== ONGLET 1: Informations Générales =====
      const infoData = [
        ['RAPPORT DE BAR - BARTENDER PRO'],
        [],
        ['Informations du Rapport'],
        ['Date du rapport', report.report_meta.report_date],
        ['Généré le', new Date(report.report_meta.generated_at).toLocaleString('fr-FR')],
        ['Généré par', report.report_meta.generated_by],
        [],
        ['Informations du Bar'],
        ['Nom', report.bar_info.name],
        ['Adresse', report.bar_info.address],
        ['Téléphone', report.bar_info.phone],
        ['Statut', report.bar_info.status],
        ['Heure de fermeture', `${report.bar_info.closing_hour}h`],
        ['Créé le', new Date(report.bar_info.created_at).toLocaleDateString('fr-FR')],
        [],
        ['Promoteur'],
        ['Nom', report.owner_info.name],
        ['Email', report.owner_info.email],
        [],
        ['Équipe'],
        ['Membres actifs', report.team.active_members_count],
        [],
        ['Inventaire'],
        ['Alertes stock', report.inventory.stock_alerts_count]
      ];

      const wsInfo = XLSX.utils.aoa_to_sheet(infoData);

      // Largeur des colonnes
      wsInfo['!cols'] = [{ wch: 25 }, { wch: 40 }];

      // Style pour le titre
      if (!wsInfo['A1']) wsInfo['A1'] = { t: 's', v: '' };
      wsInfo['A1'].s = {
        font: { bold: true, sz: 16 },
        alignment: { horizontal: 'center' }
      };

      XLSX.utils.book_append_sheet(wb, wsInfo, 'Informations');

      // ===== ONGLET 2: Statistiques du Jour =====
      const statsData = [
        ['STATISTIQUES DU JOUR'],
        [],
        ['Indicateur', 'Valeur'],
        ['Nombre de ventes', report.daily_stats.sales_count],
        ['Chiffre d\'affaires', `${report.daily_stats.total_revenue.toLocaleString('fr-FR')} FCFA`],
        ['Panier moyen', `${report.daily_stats.average_sale.toLocaleString('fr-FR')} FCFA`]
      ];

      const wsStats = XLSX.utils.aoa_to_sheet(statsData);
      wsStats['!cols'] = [{ wch: 30 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, wsStats, 'Statistiques');

      // ===== ONGLET 3: Top 10 Produits =====
      const topProductsData = [
        ['TOP 10 PRODUITS DU JOUR'],
        [],
        ['#', 'Produit', 'Volume', 'Quantité vendue', 'Chiffre d\'affaires (FCFA)']
      ];

      if (report.top_products && report.top_products.length > 0) {
        report.top_products.forEach((product, index) => {
          topProductsData.push([
            index + 1,
            product.product_name,
            product.volume || '-',
            product.quantity_sold,
            product.revenue.toLocaleString('fr-FR')
          ]);
        });

        // Ajouter le total
        const totalQty = report.top_products.reduce((sum, p) => sum + p.quantity_sold, 0);
        const totalRevenue = report.top_products.reduce((sum, p) => sum + p.revenue, 0);
        topProductsData.push([]);
        topProductsData.push([
          '',
          'TOTAL',
          '',
          totalQty,
          totalRevenue.toLocaleString('fr-FR')
        ]);
      } else {
        topProductsData.push(['', 'Aucune vente aujourd\'hui', '', '', '']);
      }

      const wsProducts = XLSX.utils.aoa_to_sheet(topProductsData);
      wsProducts['!cols'] = [
        { wch: 5 },
        { wch: 35 },
        { wch: 15 },
        { wch: 18 },
        { wch: 25 }
      ];
      XLSX.utils.book_append_sheet(wb, wsProducts, 'Top Produits');

      // ===== ONGLET 4: Résumé Exécutif =====
      const summaryData = [
        ['RÉSUMÉ EXÉCUTIF'],
        [],
        ['Indicateurs Clés de Performance (KPI)'],
        [],
        ['Performance des Ventes'],
        ['• Nombre de transactions', report.daily_stats.sales_count],
        ['• Chiffre d\'affaires total', `${report.daily_stats.total_revenue.toLocaleString('fr-FR')} FCFA`],
        ['• Valeur moyenne par transaction', `${report.daily_stats.average_sale.toLocaleString('fr-FR')} FCFA`],
        [],
        ['Équipe'],
        ['• Membres actifs', report.team.active_members_count],
        [],
        ['Inventaire'],
        ['• Produits en alerte stock (<10)', report.inventory.stock_alerts_count],
        [],
        ['Top 3 Produits'],
      ];

      if (report.top_products && report.top_products.length > 0) {
        report.top_products.slice(0, 3).forEach((product, index) => {
          summaryData.push([
            `${index + 1}. ${product.product_name}`,
            `${product.quantity_sold} unités - ${product.revenue.toLocaleString('fr-FR')} FCFA`
          ]);
        });
      }

      summaryData.push([]);
      summaryData.push(['Recommandations']);
      if (report.inventory.stock_alerts_count > 0) {
        summaryData.push(['⚠️ Action requise', `${report.inventory.stock_alerts_count} produit(s) nécessitent un réapprovisionnement`]);
      }
      if (report.daily_stats.sales_count === 0) {
        summaryData.push(['⚠️ Attention', 'Aucune vente enregistrée aujourd\'hui']);
      }

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 40 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé');

      // Générer le fichier Excel
      const fileName = `rapport_${bar.name.replace(/\s+/g, '_')}_${report.report_meta.report_date}.xlsx`;
      XLSX.writeFile(wb, fileName);

      console.log('✅ Rapport Excel généré et téléchargé avec succès');
    } catch (error: any) {
      console.error('❌ Erreur lors de la génération du rapport:', error);
      alert(`Erreur: ${error.message || 'Impossible de générer le rapport'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGenerateExcel}
      disabled={loading}
      className="w-full px-3 py-2 bg-green-100 text-green-700 rounded-lg font-semibold text-xs hover:bg-green-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Générer un rapport Excel détaillé du bar"
    >
      {loading ? (
        <>
          <Loader className="w-3.5 h-3.5 animate-spin" />
          <span>Génération...</span>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Rapport Excel</span>
        </>
      )}
    </button>
  );
};
