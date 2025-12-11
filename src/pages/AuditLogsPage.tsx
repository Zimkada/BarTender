// src/pages/AuditLogsPage.tsx
import { useNavigate } from 'react-router-dom';
import AuditLogsPanel from '../components/AuditLogsPanel';

export default function AuditLogsPage() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/admin');
  };

  return <AuditLogsPanel isOpen={true} onClose={handleClose} />;
}
