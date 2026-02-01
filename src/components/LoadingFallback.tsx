import { motion } from 'framer-motion';

export function LoadingFallback() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] bg-gradient-to-br from-brand-subtle to-brand-subtle flex items-center justify-center"
    >
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-brand-subtle border-t-brand-primary rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Chargement...</p>
      </div>
    </motion.div>
  );
}
