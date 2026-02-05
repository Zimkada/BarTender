// src/App.tsx
import { useEffect } from 'react';
import { syncHandler } from './services/SyncHandler';
import { networkManager } from './services/NetworkManager';
import { syncManager } from './services/SyncManager';

// Ce composant App devient un "Shell" très fin.
// Sa responsabilité principale est de gérer les tâches de fond globales (comme le syncHandler)
// et d'être un point d'ancrage pour les fournisseurs de contexte si nécessaire.
// Toute l'interface utilisateur sera gérée par React Router via RootLayout/AuthLayout,
// et les modales seront rendues dans RootLayout en utilisant useModalState.
function App() {
  useEffect(() => {
    // ⭐ Initialiser le NetworkManager (détection réseau avec grace period)
    networkManager.init();

    // ⭐ Initialiser le SyncManager (auto-sync offline → online)
    syncManager.init();

    // Démarrer l'ancien syncHandler (legacy sync logic)
    syncHandler.start(5000); // Traiter toutes les 5 secondes

    return () => {
      networkManager.cleanup();
      syncManager.cleanup();
      syncHandler.stop();
    };
  }, []);

  // App ne rend plus d'interface utilisateur directement.
  return null;
}

export default App;