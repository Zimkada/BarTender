import React from 'react';
import { FallbackProps } from 'react-error-boundary';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  // Safely extract error message
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-orange-100 text-red-800 p-4 text-center">
      <AlertTriangle size={64} className="mb-4 text-red-500" />
      <h2 className="text-2xl font-bold mb-2">Oups ! Une erreur est survenue.</h2>
      <p className="text-lg mb-4">
        Nous sommes désolés, mais quelque chose s'est mal passé.
      </p>
      {/* Afficher le message d'erreur pour le débogage (peut être caché en production) */}
      <pre className="bg-red-100 p-4 rounded-lg overflow-auto max-w-lg mb-4 text-sm text-left">
        {errorMessage}
      </pre>
      <button
        onClick={resetErrorBoundary}
        className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors shadow-lg"
      >
        <RefreshCw size={20} />
        Réessayer
      </button>
      <p className="mt-4 text-sm text-red-700">
        Si le problème persiste, veuillez contacter le support.
      </p>
    </div>
  );
}
