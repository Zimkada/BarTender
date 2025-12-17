import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const AnimatedBarName: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Déclenche l'animation après le montage du composant
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className={`inline-flex ${className || ''}`}>
      {text.split('').map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          initial={{ opacity: 0, y: -20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{
            duration: 0.4,
            delay: index * 0.08, // 80ms entre chaque lettre (plus lent et élégant)
            ease: "easeOut"
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
};

export default AnimatedBarName;
