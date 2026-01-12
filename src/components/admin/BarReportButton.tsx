import React, { useState } from 'react';
import { FileText, Download, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BarReportButtonProps {
  bar: { id: string; name: string };
}

export const BarReportButton: React.FC<BarReportButtonProps> = ({ bar }) => {
  const [loading, setLoading] = useState(false);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_generate_bar_report', {
        p_bar_id: bar.id
      });

      if (error) throw error;

      if (!data) {
        throw new Error('Aucune donnée reçue du serveur');
      }

      // Format JSON pour téléchargement
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport_${bar.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Notification de succès (optionnelle)
      console.log('✅ Rapport généré et téléchargé avec succès');
    } catch (error: any) {
      console.error('❌ Erreur lors de la génération du rapport:', error);
      alert(`Erreur: ${error.message || 'Impossible de générer le rapport'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGenerateReport}
      disabled={loading}
      className="w-full px-3 py-2 bg-blue-100 text-blue-700 rounded-lg font-semibold text-xs hover:bg-blue-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Générer un rapport détaillé du bar (ventes, produits, équipe, stock)"
    >
      {loading ? (
        <>
          <Loader className="w-3.5 h-3.5 animate-spin" />
          <span>Génération...</span>
        </>
      ) : (
        <>
          <FileText className="w-3.5 h-3.5" />
          <span>Rapport</span>
        </>
      )}
    </button>
  );
};
