import React from 'react';
import { FallbackProps } from 'react-error-boundary';

/**
 * Fallback affiché par ErrorBoundary en cas d'erreur de rendu.
 *
 * Usage :
 *   <ErrorBoundary FallbackComponent={ErrorFallback} onError={captureError}>
 *     <App />
 *   </ErrorBoundary>
 */
export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 text-red-800 p-8 text-center">
      <div className="text-6xl mb-4">⚠️</div>
      <h2 className="text-2xl font-bold mb-2">Une erreur est survenue</h2>
      <p className="text-base mb-4 text-red-600">
        L'application a rencontré un problème inattendu.
      </p>
      <pre className="bg-red-100 border border-red-200 p-4 rounded-lg text-sm text-left max-w-lg w-full overflow-auto mb-6">
        {message}
      </pre>
      <button
        onClick={resetErrorBoundary}
        className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
      >
        Réessayer
      </button>
      <p className="mt-4 text-sm text-red-500">
        Si le problème persiste, contactez le support.
      </p>
    </div>
  );
}
