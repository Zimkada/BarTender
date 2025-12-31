// src/pages/ProfilePage.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileSettings } from '../components/ProfileSettings';

/**
 * Cette page agit comme un "emballage" pour le composant ProfileSettings,
 * lui permettant d'être utilisé comme une page complète via le routeur.
 */
export default function ProfilePage() {
  const navigate = useNavigate();

  // La fonction de fermeture navigue maintenant vers la page précédente.
  const handleClose = () => {
    navigate(-1); // Revient à la page précédente
  };

  return <ProfileSettings isOpen={true} onClose={handleClose} />;
}
