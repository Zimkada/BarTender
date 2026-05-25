// src/pages/ErrorPage.tsx
import { useRouteError } from 'react-router-dom';

export function ErrorPage() {
  const error = useRouteError();
  console.error(error);

  // Safely extract error message
  let errorText = 'Une erreur inconnue est survenue';
  try {
    const err = error as { statusText?: string; message?: string } | string | null;
    if (err && typeof err === 'object' && err.statusText) {
      errorText = String(err.statusText);
    } else if (err && typeof err === 'object' && err.message) {
      errorText = String(err.message);
    } else if (typeof err === 'string') {
      errorText = err;
    }
  } catch {
    // If error can't be converted to string, use default
    errorText = 'Une erreur inconnue est survenue';
  }

  return (
    <div id="error-page" className="flex flex-col items-center justify-center min-h-screen bg-amber-50 text-gray-800 p-4">
      <h1 className="text-4xl font-bold text-amber-700 mb-4">Oops!</h1>
      <p className="text-lg mb-2">Désolé, une erreur inattendue est survenue.</p>
      <p className="text-gray-600">
        <i>{errorText}</i>
      </p>
    </div>
  );
}
