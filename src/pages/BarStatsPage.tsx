import { useParams, useNavigate } from 'react-router-dom';
import { useBarContext } from '../context/BarContext';
import BarStatsModal from '../components/BarStatsModal';

/**
 * Page wrapper for BarStatsModal
 * Allows BarStatsModal to be used as a route (/admin/bars/:barId)
 */
export default function BarStatsPage() {
  const { barId } = useParams<{ barId: string }>();
  const navigate = useNavigate();
  const { bars } = useBarContext();

  // Find the bar by ID from params
  const bar = bars?.find(b => b.id === barId);

  if (!bar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Bar not found</p>
      </div>
    );
  }

  return (
    <BarStatsModal
      isOpen={true}
      onClose={() => navigate('/admin/bars')}
      bar={bar}
    />
  );
}
