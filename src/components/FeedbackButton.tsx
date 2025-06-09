// components/FeedbackButton.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface FeedbackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  successAnimation?: boolean;
  children: React.ReactNode;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({
  isLoading = false,
  loadingText = 'Chargement...',
  successAnimation = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <motion.button
      whileHover={!isLoading && !disabled ? { scale: 1.02 } : {}}
      whileTap={!isLoading && !disabled ? { scale: 0.98 } : {}}
      animate={successAnimation ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.2 }}
      disabled={isLoading || disabled}
      className={`
        relative overflow-hidden transition-all duration-200
        ${isLoading ? 'cursor-not-allowed opacity-70' : ''}
        ${className}
      `}
      {...props}
    >
      <div className={`flex items-center justify-center gap-2 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="ml-2">{loadingText}</span>
        </div>
      )}
    </motion.button>
  );
};
