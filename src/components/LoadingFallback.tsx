import { motion } from 'framer-motion';

export function LoadingFallback() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center"
    >
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Chargement...</p>
      </div>
    </motion.div>
  );
}
