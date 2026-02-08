// Language: French (Français)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { BarsService } from '../../services/supabase/bars.service';
import type { BarSettings } from '../../types';

/**
 * ✅ Extended BarSettings with onboarding-specific fields
 * These fields are stored in the JSONB settings column during onboarding
 */
interface ExtendedBarSettings extends BarSettings {
  businessDayCloseHour?: number; // Business day closing hour (for revenue calculation)
  contact?: string; // Contact information (phone/email)
}

interface BarDetailsFormData {
  barName: string;
  location: string;
  closingHour: number;
  operatingMode: 'full' | 'simplifié';
  contact?: string;
}

/**
 * ✅ Type-safe payload for BarsService.updateBar()
 */
interface BarUpdatePayload {
  name: string;
  address: string;
  settings: ExtendedBarSettings;
}

export const BarDetailsStep: React.FC = () => {
  const navigate = useNavigate();
  const { stepData, updateStepData, completeStep, nextStep, previousStep, completeOnboarding } = useOnboarding();
  const { currentBar } = useBar();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form: priority is saved data > currentBar data > defaults
  const savedData = stepData[OnboardingStep.OWNER_BAR_DETAILS] as BarDetailsFormData | undefined;
  const [formData, setFormData] = useState<BarDetailsFormData>({
    barName: savedData?.barName || currentBar?.name || '',
    location: savedData?.location || currentBar?.address || '',
    closingHour: savedData?.closingHour || currentBar?.closingHour || 6,
    operatingMode: savedData?.operatingMode ||
      (currentBar?.settings?.operatingMode === 'simplified' ? 'simplifié' :
        currentBar?.settings?.operatingMode === 'full' ? 'full' : 'simplifié'),
    contact: savedData?.contact || currentBar?.email || '',
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Nom du bar: obligatoire (min 3 caractères)
    if (!formData.barName.trim()) {
      newErrors.barName = 'Le nom du bar est obligatoire';
    } else if (formData.barName.trim().length < 3) {
      newErrors.barName = 'Le nom du bar doit avoir au moins 3 caractères';
    }
    if (formData.barName.length > 50) {
      newErrors.barName = 'Nom du bar trop long (max 50 caractères)';
    }

    // Localisation: optionnel maintenant
    // Heure de fermeture: toujours requis
    if (formData.closingHour < 0 || formData.closingHour > 23) {
      newErrors.closingHour = 'L\'heure de fermeture doit être entre 0 et 23';
    }

    // Email: optionnel, validation seulement si renseigné
    if (formData.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact)) {
      newErrors.contact = 'Format d\'email invalide';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      if (!currentBar?.id) throw new Error('Aucun bar sélectionné');

      // 1. Persist to Database immediately (settings are JSONB, not separate columns)
      // ✅ Type-safe settings extraction with ExtendedBarSettings
      const currentSettings: ExtendedBarSettings = (currentBar.settings as ExtendedBarSettings) || {
        currency: 'XOF',
        currencySymbol: 'FCFA',
      };

      // ✅ Type-safe update payload with explicit interface
      const updatePayload: BarUpdatePayload = {
        name: formData.barName,
        address: formData.location,
        // Note: contact/email is stored in settings, not as a separate column
        settings: {
          ...currentSettings,
          businessDayCloseHour: formData.closingHour,
          operatingMode: formData.operatingMode,
          contact: formData.contact, // Store contact in settings
        },
      };

      await BarsService.updateBar(currentBar.id, updatePayload);

      // 2. Save form data to context for UI state
      updateStepData(OnboardingStep.OWNER_BAR_DETAILS, formData);
      completeStep(OnboardingStep.OWNER_BAR_DETAILS, formData);

      // 3. Move to next step
      nextStep();
    } catch (error: any) {
      console.error('Erreur lors de l\'enregistrement des détails du bar:', error);
      setErrors({ submit: error.message || 'Impossible d\'enregistrer les détails du bar' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === 'closingHour' ? parseInt(value, 10) : value,
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Configurons votre bar</h1>
          <p className="mt-2 text-gray-600">
            Vérifiez et ajustez les informations de votre bar. Les champs sont pré-remplis avec vos données existantes.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bar Name */}
          <div>
            <label htmlFor="barName" className="block text-sm font-medium text-gray-700 mb-1">
              Nom du Bar (optionnel - modifier si nécessaire)
            </label>
            <input
              id="barName"
              name="barName"
              type="text"
              value={formData.barName}
              onChange={handleChange}
              placeholder="ex : Chez Ali"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[hsl(var(--brand-hue),var(--brand-saturation),80%)] focus:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] focus:outline-none transition-all duration-200 ${errors.barName
                ? 'border-red-500 focus:ring-red-200'
                : 'border-gray-200'
                }`}
            />
            {!errors.barName && formData.barName && (
              <p className="mt-1 text-xs text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">✓ Valeur actuelle: {formData.barName}</p>
            )}
            {errors.barName && (
              <p className="mt-1 text-sm text-red-600">{errors.barName}</p>
            )}
          </div>

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Localisation (optionnel - modifier si nécessaire)
            </label>
            <input
              id="location"
              name="location"
              type="text"
              value={formData.location}
              onChange={handleChange}
              placeholder="ex : Cotonou, Bénin"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[hsl(var(--brand-hue),var(--brand-saturation),80%)] focus:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] focus:outline-none transition-all duration-200 ${errors.location
                ? 'border-red-500 focus:ring-red-200'
                : 'border-gray-200'
                }`}
            />
            {!errors.location && formData.location && (
              <p className="mt-1 text-xs text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">✓ Valeur actuelle: {formData.location}</p>
            )}
            {errors.location && (
              <p className="mt-1 text-sm text-red-600">{errors.location}</p>
            )}
          </div>

          {/* Contact Email */}
          <div>
            <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-1">
              Email de Contact (optionnel)
            </label>
            <input
              id="contact"
              name="contact"
              type="email"
              value={formData.contact}
              onChange={handleChange}
              placeholder="votre@email.com"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[hsl(var(--brand-hue),var(--brand-saturation),80%)] focus:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] focus:outline-none transition-all duration-200 ${errors.contact
                ? 'border-red-500 focus:ring-red-200'
                : 'border-gray-200'
                }`}
            />
            {!errors.contact && formData.contact && (
              <p className="mt-1 text-xs text-[hsl(var(--brand-hue),var(--brand-saturation),40%)]">✓ Valeur actuelle: {formData.contact}</p>
            )}
            {errors.contact && (
              <p className="mt-1 text-sm text-red-600">{errors.contact}</p>
            )}
          </div>

          {/* Closing Hour */}
          <div>
            <label htmlFor="closingHour" className="block text-sm font-medium text-gray-700 mb-1">
              Heure de Fermeture (Début du Jour Ouvrable) *
            </label>
            <select
              id="closingHour"
              name="closingHour"
              value={formData.closingHour}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[hsl(var(--brand-hue),var(--brand-saturation),80%)] focus:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] focus:outline-none transition-all duration-200 ${errors.closingHour
                ? 'border-red-500 focus:ring-red-200'
                : 'border-gray-200'
                }`}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i}:00 (fermeture à {i}:00 du matin)
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-500">
              ℹ️ Les ventes avant votre heure de fermeture sont comptées comme date d'hier
            </p>
            {errors.closingHour && (
              <p className="mt-1 text-sm text-red-600">{errors.closingHour}</p>
            )}
          </div>

          {/* Operating Mode */}
          <div>
            <label htmlFor="operatingMode" className="block text-sm font-medium text-gray-700 mb-1">
              Mode de Fonctionnement *
            </label>
            <select
              id="operatingMode"
              name="operatingMode"
              value={formData.operatingMode}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[hsl(var(--brand-hue),var(--brand-saturation),80%)] focus:border-[hsl(var(--brand-hue),var(--brand-saturation),60%)] focus:outline-none transition-all duration-200"
            >
              <option value="simplifié">Simplifié (pas de comptes utilisateurs, noms seulement)</option>
              <option value="full">Complet (comptes utilisateur pour chaque serveur)</option>
            </select>
            <p className="mt-2 text-sm text-gray-500">
              💡 Vous pouvez modifier cela plus tard si nécessaire
            </p>
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{errors.submit}</p>
            </div>
          )}

          {/* Buttons - Responsive Layout */}
          <div className="pt-6 border-t space-y-3">
            {/* Mobile: Retour + Étape Suivante sur la même ligne */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => previousStep()}
                className="flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[hsl(var(--brand-hue),var(--brand-saturation),20%)] bg-white border border-[hsl(var(--brand-hue),var(--brand-saturation),85%)] rounded-xl hover:bg-[hsl(var(--brand-hue),var(--brand-saturation),96%)] transition-colors duration-200"
              >
                Retour
              </button>
              <LoadingButton
                type="submit"
                isLoading={loading}
                loadingText="Enregistrement..."
                className="flex-1 sm:flex-none sm:ml-auto px-4 sm:px-6 py-2 bg-[image:var(--brand-gradient)] text-white font-semibold rounded-xl shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200"
              >
                Étape Suivante
              </LoadingButton>
            </div>

            {/* Completer Plus Tard centré en dessous */}
            <div className="flex justify-center">
              <LoadingButton
                type="button"
                isLoading={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    if (!currentBar?.id) throw new Error('Aucun bar sélectionné');

                    // Persist current state before leaving (settings are JSONB)
                    // ✅ Type-safe settings extraction with ExtendedBarSettings
                    const currentSettings: ExtendedBarSettings = (currentBar.settings as ExtendedBarSettings) || {
                      currency: 'XOF',
                      currencySymbol: 'FCFA',
                    };

                    // ✅ Type-safe update payload with explicit interface
                    const updatePayload: BarUpdatePayload = {
                      name: formData.barName,
                      address: formData.location,
                      // Note: contact/email is stored in settings, not as a separate column
                      settings: {
                        ...currentSettings,
                        businessDayCloseHour: formData.closingHour,
                        operatingMode: formData.operatingMode,
                        contact: formData.contact, // Store contact in settings
                      },
                    };

                    await BarsService.updateBar(currentBar.id, updatePayload);

                    updateStepData(OnboardingStep.OWNER_BAR_DETAILS, formData);
                    completeStep(OnboardingStep.OWNER_BAR_DETAILS, formData);
                    // Note: Do NOT call completeOnboarding() here - user wants to finish later
                    // Redirect to dashboard instead
                    navigate('/dashboard');
                  } catch (error: any) {
                    setErrors({ submit: 'Erreur lors de la sauvegarde : ' + error.message });
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full sm:w-auto px-4 sm:px-6 py-2 text-[hsl(var(--brand-hue),var(--brand-saturation),40%)] hover:text-[hsl(var(--brand-hue),var(--brand-saturation),20%)] font-medium text-sm transition-colors duration-200"
              >
                Compléter Plus Tard
              </LoadingButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
