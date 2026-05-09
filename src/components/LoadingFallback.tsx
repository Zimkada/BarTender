import { motion } from 'framer-motion';

interface RouteLoadingFallbackProps {
  label?: string;
}

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

export function RouteLoadingFallback({ label = 'Chargement...' }: RouteLoadingFallbackProps) {
  return (
    <div
      className="w-full min-h-[45vh] flex items-center justify-center px-4 py-10"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-full max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border-4 border-brand-subtle border-t-brand-primary animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-700">{label}</p>
            <p className="text-xs text-gray-500">Les donnees arrivent, l'interface reste disponible.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
              <div className="h-3 w-1/3 rounded bg-gray-200 mb-4" />
              <div className="h-7 w-2/3 rounded bg-gray-200 mb-2" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
          <div className="h-4 w-48 rounded bg-gray-200 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
