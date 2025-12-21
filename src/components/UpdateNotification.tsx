import React, { useEffect, useState } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { VersionCheckService } from '../services/versionCheck.service';

/**
 * Composant de notification de mise à jour disponible
 * Affiche une notification sticky si une nouvelle version est détectée
 */
export const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    // S'abonner aux mises à jour disponibles
    const unsubscribe = VersionCheckService.onUpdateAvailable((version) => {
      console.log('[UpdateNotification] Mise à jour disponible:', version);
      setNewVersion(version);
      setUpdateAvailable(true);
    });

    return () => unsubscribe();
  }, []);

  if (!updateAvailable) {
    return null;
  }

  const handleReload = () => {
    console.log('[UpdateNotification] Utilisateur a cliqué sur "Recharger"');
    VersionCheckService.reloadPage();
  };

  const handleDismiss = () => {
    setUpdateAvailable(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-blue-50 border-2 border-blue-500 rounded-lg shadow-lg p-4">
        {/* En-tête */}
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">
              Mise à jour disponible
            </h3>
            <p className="text-sm text-blue-800 mt-1">
              Une nouvelle version est prête. Cliquez sur "Recharger" pour mettre à jour.
            </p>
            {newVersion && (
              <p className="text-xs text-blue-700 mt-2">
                Version: {newVersion}
              </p>
            )}
          </div>
        </div>

        {/* Boutons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleReload}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors flex-1"
          >
            <RotateCcw className="w-4 h-4" />
            Recharger
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-blue-100 text-blue-900 rounded font-medium hover:bg-blue-200 transition-colors"
          >
            Plus tard
          </button>
        </div>

        {/* Note importante */}
        <p className="text-xs text-blue-700 mt-3 italic">
          ⚠️ Il est recommandé de recharger pour bénéficier des corrections et des nouvelles fonctionnalités.
        </p>
      </div>
    </div>
  );
};
