import { WifiOff, Wifi, Clock } from 'lucide-react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { motion } from 'framer-motion';

export function OfflineIndicator() {
  const { isOnline, pendingOperations, lastSyncTime } = useOfflineStatus();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        isOnline 
          ? 'bg-green-100 text-green-700' 
          : 'bg-red-100 text-red-700'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={16} />
          <span>En ligne</span>
        </>
      ) : (
        <>
          <WifiOff size={16} />
          <span>Hors ligne</span>
        </>
      )}
      
      {pendingOperations > 0 && (
        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
          isOnline ? 'bg-green-200' : 'bg-red-200'
        }`}>
          {pendingOperations} en attente
        </span>
      )}

      {isOnline && lastSyncTime && (
        <span className="text-xs opacity-75 ml-1">
          <Clock size={12} className="inline mr-1" />
          {new Date(lastSyncTime).toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </span>
      )}
    </motion.div>
  );
}