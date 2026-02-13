// src/App.tsx
import { useEffect } from 'react';
import { networkManager } from './services/NetworkManager';
import { syncManager } from './services/SyncManager';

// Ce composant App devient un "Shell" très fin.
// gère les tâches de fond globales
// et d'être un point d'ancrage pour les fournisseurs de contexte si nécessaire.
// Toute l'interface utilisateur sera gérée par React Router via RootLayout/AuthLayout,
// et les modales seront rendues dans RootLayout en utilisant useModalState.
function App() {
  useEffect(() => {
    // ⭐ Initialiser le NetworkManager (détection réseau avec grace period)
    networkManager.init();

    // ⭐ Initialiser le SyncManager (auto-sync offline → online)
    syncManager.init();

    return () => {
      networkManager.cleanup();
      syncManager.cleanup();
    };
  }, []);

  // App ne rend plus d'interface utilisateur directement.
  return null;
}

export default App;