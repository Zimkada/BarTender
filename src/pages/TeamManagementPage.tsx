// src/pages/TeamManagementPage.tsx
import { useNavigate } from 'react-router-dom';
import { UserManagement } from '../components/UserManagement';

/**
 * TeamManagementPage - Wrapper pour le composant UserManagement
 * Route: /team
 */
export default function TeamManagementPage() {
  const navigate = useNavigate();

  return (
    <UserManagement
      isOpen={true}
      onClose={() => navigate(-1)}
    />
  );
}
