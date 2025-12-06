// src/App.tsx
import { useEffect } from 'react';
import { syncHandler } from './services/SyncHandler';

// Ce composant App devient un "Shell" très fin.
// Sa responsabilité principale est de gérer les tâches de fond globales (comme le syncHandler)
// et d'être un point d'ancrage pour les fournisseurs de contexte si nécessaire.
// Toute l'interface utilisateur sera gérée par React Router via RootLayout/AuthLayout,
// et les modales seront rendues dans RootLayout en utilisant useModalState.
function App() {
  useEffect(() => {
    syncHandler.start(5000); // Traiter toutes les 5 secondes
    return () => {
      syncHandler.stop();
    };
  }, []);

  // App ne rend plus d'interface utilisateur directement.
  return null;
}

export default App;