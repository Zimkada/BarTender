import React, { useState } from 'react';
import { Input } from './ui/Input';
import { Alert } from './ui/Alert';

interface AddBarFormData {
  barName: string;
  barAddress: string;
  barPhone: string;
}

interface AddBarFormProps {
  promoterName: string;
  onSubmit: (data: AddBarFormData) => void | Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Formulaire réutilisable pour créer un bar
 * Utilisé par AddBarModal et potentiellement d'autres contextes
 * État minimal : formData + formErrors seulement
 */
export function AddBarForm({ promoterName, onSubmit, loading, error }: AddBarFormProps) {
  const [formData, setFormData] = useState<AddBarFormData>({
    barName: '',
    barAddress: '',
    barPhone: '',
  });

  const [formErrors, setFormErrors] = useState<Partial<AddBarFormData>>({});

  const validateForm = (): boolean => {
    const errors: Partial<AddBarFormData> = {};

    // barName - requis
    if (!formData.barName.trim()) {
      errors.barName = 'Le nom du bar est requis';
    } else if (formData.barName.length < 2 || formData.barName.length > 100) {
      errors.barName = 'Le nom doit contenir entre 2 et 100 caractères';
    }

    // barAddress - optionnel mais validé si fourni
    if (formData.barAddress.trim() && formData.barAddress.length > 200) {
      errors.barAddress = 'L\'adresse ne doit pas dépasser 200 caractères';
    }

    // barPhone - optionnel mais validé si fourni
    if (formData.barPhone.trim()) {
      const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
      if (!phoneRegex.test(formData.barPhone)) {
        errors.barPhone = 'Numéro de téléphone invalide (min 10 chiffres)';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    onSubmit({
      barName: formData.barName.trim(),
      barAddress: formData.barAddress.trim() || '',
      barPhone: formData.barPhone.trim() || '',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Affichage du promoteur cible (readonly) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Promoteur
        </label>
        <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600">
          {promoterName}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" title="Erreur">
          {error}
        </Alert>
      )}

      {/* Nom du bar - requis */}
      <div>
        <Input
          label="Nom du bar *"
          type="text"
          value={formData.barName}
          onChange={(e) => setFormData(prev => ({ ...prev, barName: e.target.value }))}
          placeholder="Ex: Le Privilège"
          disabled={loading}
        />
        {formErrors.barName && (
          <p className="text-red-500 text-xs mt-1">{formErrors.barName}</p>
        )}
      </div>

      {/* Adresse - optionnel */}
      <div>
        <Input
          label="Adresse"
          type="text"
          value={formData.barAddress}
          onChange={(e) => setFormData(prev => ({ ...prev, barAddress: e.target.value }))}
          placeholder="Ex: Cotonou, Bénin"
          disabled={loading}
        />
        {formErrors.barAddress && (
          <p className="text-red-500 text-xs mt-1">{formErrors.barAddress}</p>
        )}
      </div>

      {/* Téléphone - optionnel */}
      <div>
        <Input
          label="Téléphone"
          type="tel"
          value={formData.barPhone}
          onChange={(e) => setFormData(prev => ({ ...prev, barPhone: e.target.value }))}
          placeholder="Ex: 01 97 XX XX XX"
          disabled={loading}
        />
        {formErrors.barPhone && (
          <p className="text-red-500 text-xs mt-1">{formErrors.barPhone}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 transition-all duration-200 transform hover:scale-[1.02]"
      >
        {loading ? 'Création en cours...' : 'Créer le bar'}
      </button>
    </form>
  );
}
