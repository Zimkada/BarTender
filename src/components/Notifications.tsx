import React, { useState, createContext, useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertCircle, Info } from 'lucide-react';
import { NOTIFICATION_DURATION } from '../config/notifications';

type NotificationType = 'success' | 'error' | 'info';
interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

interface NotificationsContextType {
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string, options?: { duration?: number }) => void;
  hideNotification: (id: string) => void;
}

const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = (
    type: NotificationType,
    message: string,
    options?: { duration?: number }
  ) => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const duration = options?.duration ?? NOTIFICATION_DURATION.NORMAL;

    setNotifications((prev) => [...prev, { id, type, message, duration }]);

    // Auto-dismiss after specified duration
    setTimeout(() => {
      hideNotification(id);
    }, duration);
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile on mount and window resize
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      className={`fixed z-[2000] ${isMobile
          ? 'top-20 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)]' // Mobile: top center
          : 'bottom-4 right-4' // Desktop: bottom right
        }`}
    >
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: isMobile ? -20 : 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isMobile ? -20 : 20, scale: 0.95 }}
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
          bgColor: 'bg-amber-500',
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
      className={`${bgColor} text-white px-4 py-3 rounded-xl shadow-lg min-w-[200px] max-w-md flex items-center justify-between backdrop-blur-sm`}
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

export { useNotifications };
