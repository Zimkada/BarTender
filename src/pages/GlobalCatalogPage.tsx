// src/pages/GlobalCatalogPage.tsx
import { useNavigate } from 'react-router-dom';
import GlobalCatalogPanel from '../components/GlobalCatalogPanel';

export default function GlobalCatalogPage() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/admin');
  };

  return <GlobalCatalogPanel isOpen={true} onClose={handleClose} />;
}
