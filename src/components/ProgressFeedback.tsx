// components/ProgressFeedback.tsx
import React from 'react';
import { motion } from 'framer-motion';

interface ProgressFeedbackProps {
  steps: string[];
  currentStep: number;
  completed?: boolean;
}

export const ProgressFeedback: React.FC<ProgressFeedbackProps> = ({
  steps,
  currentStep,
  completed = false
}) => {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`flex items-center gap-3 p-2 rounded-lg ${
            index < currentStep ? 'bg-green-50 text-green-700' :
            index === currentStep ? 'bg-blue-50 text-blue-700' :
            'bg-gray-50 text-gray-500'
          }`}
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
            index < currentStep ? 'bg-green-500 text-white' :
            index === currentStep ? 'bg-blue-500 text-white' :
            'bg-gray-300 text-gray-600'
          }`}>
            {index < currentStep ? '✓' : index + 1}
          </div>
          <span>{step}</span>
          {index === currentStep && !completed && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
            />
          )}
        </motion.div>
      ))}
    </div>
  );
};