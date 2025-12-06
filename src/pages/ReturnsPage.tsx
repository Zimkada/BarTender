// src/pages/ReturnsPage.tsx
import { ReturnsSystem } from '../components/ReturnsSystem';

/**
 * Page Retours - Wrapper pour le composant ReturnsSystem
 * Route: /returns
 * 
 * Note: ReturnsSystem est conçu comme une modale, donc on le rend
 * toujours ouvert avec une fonction onClose qui navigue vers l'accueil
 */
export default function ReturnsPage() {
  // Le composant ReturnsSystem attend isOpen et onClose
  // En mode page, on le rend toujours "ouvert"
  return (
    <ReturnsSystem 
      isOpen={true} 
      onClose={() => window.history.back()} 
    />
  );
}
