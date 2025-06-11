import { motion } from 'framer-motion';
import React from 'react';

// @refresh reset
// Variantes d'animation pour les conteneurs
export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      when: "beforeChildren"
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1
    }
  }
};

// Variantes d'animation pour les éléments
export const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  },
  exit: { opacity: 0, y: 20, transition: { duration: 0.2 } }
};

// Variantes pour les modales
export const modalVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 }
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }
};

// Composant de transition de page
export const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
);


interface AnimatedButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

// Composant pour les boutons avec feedback

export const AnimatedButton = ({ children, className = '', ...props }: AnimatedButtonProps) => (
  <motion.button
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.97 }}
    className={className}
    {...props}
  >
    {children}
  </motion.button>
);

// Conteneur animé pour les listes
export const AnimatedList = motion.ul;

// Élément animé pour les listes
export const AnimatedItem = motion.li;

// Conteneur animé pour les grilles
export const AnimatedGrid = motion.div;

// Élément pour les notifications de succès/erreur
export const FeedbackMessage: React.FC<{
  type: 'success' | 'error' | 'info';
  message: string;
}> = ({ type, message }) => {
  const bgColor = 
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 
    'bg-blue-500';
    
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`${bgColor} text-white px-4 py-2 rounded-md shadow-lg`}
    >
      {message}
    </motion.div>
  );
};