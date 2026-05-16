// Language: French (Français)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding, OnboardingStep } from '../../context/OnboardingContext';
import { useBar } from '../../context/BarContext';
import { LoadingButton } from '../ui/LoadingButton';
import { BarsService } from '../../services/supabase/bars.service';
import { formatAddress } from '../../utils/stringFormatting';
import type { BarSettings } from '../../types';

/**
 * ✅ Extended BarSettings with onboarding-specific fields
 * These fields are stored in the JSONB settings column during onboarding
 */
interface ExtendedBarSettings extends BarSettings {
  businessDayCloseHour?: number; // Business day closing hour (for revenue calculation)
  contact?: string; // Contact information (phone/email)
  // currency is already in BarSettings as string (required)
}

interface BarDetailsFormData {
  barName: string;
  location: string;
  closingHour: number;
  // Use UI-specific type for local state, mapped to DB type on save/load
  operatingMode: 'full' | 'simplifié';
  contact?: string;
  currency: string;
}

// Removed BarUpdatePayload interface as we cast to any/unknown for the service call or allow implicit typing


export const BarDetailsStep: React.FC = () => {
  const navigate = useNavigate();
  const { stepData, updateStepData, completeStep, nextStep, previousStep } = useOnboarding();
  const { currentBar } = useBar();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form: priority is saved data > currentBar data > defaults
  const savedData = stepData[OnboardingStep.OWNER_BAR_DETAILS] as BarDetailsFormData | undefined;
  const [formData, setFormData] = useState<BarDetailsFormData>({
    barName: savedData?.barName || currentBar?.name || '',
    location: savedData?.location || formatAddress(currentBar?.address),
    closingHour: savedData?.closingHour || currentBar?.closingHour || 6,
    // Map DB 'simplified' -> UI 'simplifié'
    operatingMode: savedData?.operatingMode ||
      (currentBar?.settings?.operatingMode === 'full' ? 'full' : 'simplifié'),
    contact: savedData?.contact || currentBar?.email || '',
    currency: savedData?.currency || currentBar?.settings?.currency || 'XOF',
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
      // ✅ Map UI 'simplifié' -> DB 'simplified'
      const dbOperatingMode = formData.operatingMode === 'full' ? 'full' : 'simplified';

      // ✅ Type-safe update payload
      const updatePayload = {
        name: formData.barName,
        address: formData.location,
        // Note: contact/email is stored in settings, not as a separate column
        settings: {
          ...currentSettings,
          businessDayCloseHour: formData.closingHour,
          operatingMode: dbOperatingMode,
          contact: formData.contact, // Store contact in settings
          currency: formData.currency, // Store currency
          currencySymbol: formData.currency === 'EUR' ? '€' : formData.currency === 'USD' ? '$' : 'FCFA', // Simple mapping
        } as ExtendedBarSettings,
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

  const inputClass = (hasError: boolean) =>
    `w-full h-11 px-4 border rounded-xl text-body-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary focus:outline-none transition-colors ${
      hasError ? 'border-red-400 focus:ring-red-200' : 'border-border bg-muted focus:bg-card'
    }`;

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-h1 text-foreground mb-2">Configurons votre bar</h1>
          <p className="text-body-sm text-muted-foreground">
            Vérifiez et ajustez les informations de votre bar. Les champs sont pré-remplis avec vos données existantes.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Bar Name */}
          <div className="space-y-1.5">
            <label htmlFor="barName" className="block text-caption font-medium text-muted-foreground">
              Nom du bar
            </label>
            <input
              id="barName"
              name="barName"
              type="text"
              value={formData.barName}
              onChange={handleChange}
              placeholder="ex : Chez Ali"
              className={inputClass(!!errors.barName)}
            />
            {errors.barName && (
              <p className="text-caption text-red-600">{errors.barName}</p>
            )}
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label htmlFor="location" className="block text-caption font-medium text-muted-foreground">
              Localisation <span className="text-muted-foreground">(optionnel)</span>
            </label>
            <input
              id="location"
              name="location"
              type="text"
              value={formData.location}
              onChange={handleChange}
              placeholder="ex : Cotonou, Bénin"
              className={inputClass(!!errors.location)}
            />
            {errors.location && (
              <p className="text-caption text-red-600">{errors.location}</p>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label htmlFor="currency" className="block text-caption font-medium text-muted-foreground">
              Devise *
            </label>
            <select
              id="currency"
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className={inputClass(!!errors.currency)}
            >
              <option value="XOF">Franc CFA (XOF)</option>
              <option value="EUR">Euro (€)</option>
              <option value="USD">Dollar ($)</option>
            </select>
            <p className="text-caption text-muted-foreground">La devise utilisée pour vos rapports financiers.</p>
          </div>

          {/* Contact Email */}
          <div className="space-y-1.5">
            <label htmlFor="contact" className="block text-caption font-medium text-muted-foreground">
              Email de contact <span className="text-muted-foreground">(optionnel)</span>
            </label>
            <input
              id="contact"
              name="contact"
              type="email"
              value={formData.contact}
              onChange={handleChange}
              placeholder="votre@email.com"
              className={inputClass(!!errors.contact)}
            />
            {errors.contact && (
              <p className="text-caption text-red-600">{errors.contact}</p>
            )}
          </div>

          {/* Closing Hour */}
          <div className="space-y-1.5">
            <label htmlFor="closingHour" className="block text-caption font-medium text-muted-foreground">
              Heure de fermeture *
            </label>
            <select
              id="closingHour"
              name="closingHour"
              value={formData.closingHour}
              onChange={handleChange}
              className={inputClass(!!errors.closingHour)}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i.toString().padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <p className="text-caption text-muted-foreground">
              Les ventes avant cette heure sont comptées sur la journée précédente.
            </p>
            {errors.closingHour && (
              <p className="text-caption text-red-600">{errors.closingHour}</p>
            )}
          </div>

          {/* Operating Mode */}
          <div className="space-y-1.5">
            <label htmlFor="operatingMode" className="block text-caption font-medium text-muted-foreground">
              Mode de fonctionnement *
            </label>
            <select
              id="operatingMode"
              name="operatingMode"
              value={formData.operatingMode}
              onChange={handleChange}
              className={inputClass(false)}
            >
              <option value="simplifié">Simplifié (pas de comptes serveurs, noms seulement)</option>
              <option value="full">Complet (compte utilisateur par serveur)</option>
            </select>
            <p className="text-caption text-muted-foreground">
              Vous pourrez modifier ce choix plus tard.
            </p>
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-caption text-red-700">{errors.submit}</p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-border space-y-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => previousStep()}
                className="flex-1 sm:flex-none h-11 px-5 text-body-sm font-medium text-foreground/80 bg-card border border-border rounded-xl hover:border-brand-primary hover:text-brand-primary transition-colors"
              >
                Retour
              </button>
              <LoadingButton
                type="submit"
                isLoading={loading}
                loadingText="Enregistrement…"
                className="flex-1 sm:flex-none sm:ml-auto btn-brand h-11 px-6 rounded-xl text-body-sm font-semibold"
              >
                Étape suivante
              </LoadingButton>
            </div>

            <div className="flex justify-center">
              <LoadingButton
                type="button"
                isLoading={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    if (!currentBar?.id) throw new Error('Aucun bar sélectionné');

                    const currentSettings: ExtendedBarSettings = (currentBar.settings as ExtendedBarSettings) || {
                      currency: 'XOF',
                      currencySymbol: 'FCFA',
                    };

                    const dbOperatingMode = formData.operatingMode === 'full' ? 'full' : 'simplified';

                    const updatePayload = {
                      name: formData.barName,
                      address: formData.location,
                      settings: {
                        ...currentSettings,
                        businessDayCloseHour: formData.closingHour,
                        operatingMode: dbOperatingMode,
                        contact: formData.contact,
                        currency: formData.currency,
                        currencySymbol: formData.currency === 'EUR' ? '€' : formData.currency === 'USD' ? '$' : 'FCFA',
                      } as ExtendedBarSettings,
                    };

                    await BarsService.updateBar(currentBar.id, updatePayload);

                    updateStepData(OnboardingStep.OWNER_BAR_DETAILS, formData);
                    completeStep(OnboardingStep.OWNER_BAR_DETAILS, formData);
                    navigate('/dashboard');
                  } catch (error: any) {
                    setErrors({ submit: 'Erreur lors de la sauvegarde : ' + error.message });
                  } finally {
                    setLoading(false);
                  }
                }}
                className="text-caption font-medium text-muted-foreground hover:text-foreground/70 px-3 py-2 transition-colors"
              >
                Compléter plus tard
              </LoadingButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
