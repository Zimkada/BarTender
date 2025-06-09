import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertCircle, Info } from 'lucide-react';

type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string) => void;
  hideNotification: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = (type: NotificationType, message: string) => {
    const id = Date.now().toString();
    setNotifications((prev) => [...prev, { id, type, message }]);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      hideNotification(id);
    }, 3000);
  };

  const hideNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  return (
    <NotificationsContext.Provider value={{ notifications, showNotification, hideNotification }}>
      {children}
      <NotificationsContainer />
    </NotificationsContext.Provider>
  );
};

const NotificationsContainer: React.FC = () => {
  const { notifications, hideNotification } = useNotifications();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-2"
          >
            <NotificationItem notification={notification} onClose={() => hideNotification(notification.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const NotificationItem: React.FC<{
  notification: Notification;
  onClose: () => void;
}> = ({ notification, onClose }) => {
  const { type, message } = notification;

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bgColor: 'bg-green-500',
          icon: <Check size={18} className="text-white" />,
        };
      case 'error':
        return {
          bgColor: 'bg-red-500',
          icon: <AlertCircle size={18} className="text-white" />,
        };
      case 'info':
        return {
          bgColor: 'bg-orange-500',
          icon: <Info size={18} className="text-white" />,
        };
      default:
        return {
          bgColor: 'bg-gray-500',
          icon: <Info size={18} className="text-white" />,
        };
    }
  };

  const { bgColor, icon } = getTypeStyles();

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      className={`${bgColor} text-white px-4 py-3 rounded-xl shadow-lg min-w-[300px] max-w-md flex items-center justify-between backdrop-blur-sm`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <p className="font-medium">{message}</p>
      </div>
      <motion.button 
        onClick={onClose} 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="text-white/70 hover:text-white transition-colors"
      >
        <X size={16} />
      </motion.button>
    </motion.div>
  );
};