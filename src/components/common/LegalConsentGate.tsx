import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { AuthService } from '../../services/supabase/auth.service';
import { CURRENT_CONSENT_VERSION, LEGAL_ROUTES } from '../../config/legal';
import { getErrorMessage } from '../../utils/errorHandler';

/**
 * 🛡️ Garde-fou de consentement légal.
 *
 * Affiche un modal BLOQUANT tant que l'utilisateur courant n'a pas accepté la
 * version en vigueur des documents légaux (consent_version < CURRENT_CONSENT_VERSION).
 * Couvre les comptes existants (jamais passés par la case à cocher de première
 * connexion) et les futures révisions des documents.
 *
 * Les nouveaux comptes consentent déjà via LoginScreen (flux first_login) : pour eux
 * consent_version est à jour, le modal ne s'affiche pas.
 *
 * Rendu dans RootLayout (utilisateurs de bar). Le SuperAdmin — l'éditeur — n'a pas à
 * consentir à ses propres CGU et n'est donc pas concerné.
 */
export const LegalConsentGate: React.FC = () => {
  const { currentSession, acceptLegalTerms } = useAuth();
  const userId = currentSession?.userId;

  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { data: consentVersion, isLoading, refetch } = useQuery({
    queryKey: ['consent-version', userId],
    queryFn: () => AuthService.getConsentVersion(userId as string),
    enabled: !!userId,
    staleTime: Infinity, // Ne change qu'après acceptation (on refetch manuellement)
  });

  // Pas de session, chargement en cours, ou consentement déjà à jour → rien à afficher.
  if (!userId || isLoading || consentVersion === undefined) return null;
  if (consentVersion >= CURRENT_CONSENT_VERSION) return null;

  const handleAccept = async () => {
    if (!accepted) {
      setError('Vous devez cocher la case pour continuer');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await acceptLegalTerms(CURRENT_CONSENT_VERSION);
      await refetch(); // Relit consent_version → le modal se ferme de lui-même
    } catch (e) {
      setError(getErrorMessage(e) || 'Erreur lors de l\'enregistrement du consentement');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      {/* Overlay non cliquable : le consentement est obligatoire, pas d'échappatoire */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8"
      >
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 bg-brand-subtle rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7 text-brand-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Mise à jour de nos conditions</h2>
          <p className="text-foreground/70 mt-2 text-sm">
            Pour continuer à utiliser BarTender, merci de prendre connaissance de nos
            conditions et de les accepter.
          </p>
        </div>

        <div className="flex items-start gap-2 mb-4">
          <input
            type="checkbox"
            id="consentGate"
            checked={accepted}
            onChange={(e) => { setAccepted(e.target.checked); setError(''); }}
            className="mt-0.5 w-4 h-4 accent-brand cursor-pointer flex-shrink-0"
          />
          <label htmlFor="consentGate" className="text-sm text-foreground/70 cursor-pointer select-none">
            J'ai lu et j'accepte les{' '}
            <a href={LEGAL_ROUTES.terms} target="_blank" rel="noopener noreferrer"
              className="text-brand-primary underline hover:text-brand-primary/80">
              Conditions Générales
            </a>{' '}
            et la{' '}
            <a href={LEGAL_ROUTES.privacy} target="_blank" rel="noopener noreferrer"
              className="text-brand-primary underline hover:text-brand-primary/80">
              Politique de confidentialité
            </a>.
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!accepted || submitting}
          className="btn-brand w-full py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Enregistrement...' : 'Accepter et continuer'}
        </button>
      </motion.div>
    </div>
  );
};

export default LegalConsentGate;
