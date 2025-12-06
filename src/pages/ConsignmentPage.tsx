// src/pages/ConsignmentPage.tsx
import { ConsignmentSystem } from '../components/ConsignmentSystem';

/**
 * Page Consignations - Wrapper pour le composant ConsignmentSystem
 * Route: /consignments
 * 
 * Note: ConsignmentSystem est conçu comme une modale, donc on le rend
 * toujours ouvert avec une fonction onClose qui navigue en arrière
 */
export default function ConsignmentPage() {
  return (
    <ConsignmentSystem 
      isOpen={true} 
      onClose={() => window.history.back()} 
    />
  );
}
