// src/pages/HomePage.tsx
import React from 'react';

export function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] text-gray-800 p-4">
      <h1 className="text-3xl font-bold text-amber-700 mb-4">Bienvenue sur BarTender !</h1>
      <p className="text-lg text-gray-600">Votre tableau de bord est prêt.</p>
      <p className="text-sm text-gray-500 mt-2">Utilisez la navigation pour explorer l'application.</p>
    </div>
  );
}
