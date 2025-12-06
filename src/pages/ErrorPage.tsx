// src/pages/ErrorPage.tsx
import React from 'react';
import { useRouteError } from 'react-router-dom';

export function ErrorPage() {
  const error: any = useRouteError();
  console.error(error);

  return (
    <div id="error-page" className="flex flex-col items-center justify-center min-h-screen bg-amber-50 text-gray-800 p-4">
      <h1 className="text-4xl font-bold text-amber-700 mb-4">Oops!</h1>
      <p className="text-lg mb-2">Désolé, une erreur inattendue est survenue.</p>
      <p className="text-gray-600">
        <i>{error.statusText || error.message}</i>
      </p>
    </div>
  );
}
