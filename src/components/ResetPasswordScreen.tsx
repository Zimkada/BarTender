import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Import direct de supabase
import { Alert } from './ui/Alert';
import { getErrorMessage } from '../utils/errorHandler';
import { validatePassword } from '../utils/validation';

function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);

  useEffect(() => {
    // Écouter l'événement de récupération de mot de passe de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
      }
    });

    // Nettoyer l'abonnement au démontage du composant
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!password || !confirmPassword) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError + '.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }
      setSuccess('Votre mot de passe a été mis à jour avec succès ! Vous allez être redirigé.');

      // Rediriger vers la page de connexion après un court délai en rechargeant la page
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (error) {
      setError(getErrorMessage(error) || 'Erreur lors de la mise à jour du mot de passe.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4 text-center">
        <Alert variant="destructive" show={true}>
          <h2 className="mt-4 text-xl font-bold text-foreground">Lien invalide ou expiré</h2>
          <p className="mt-2 text-foreground/70">
            Pour réinitialiser votre mot de passe, veuillez faire une nouvelle demande depuis la page "Mot de passe oublié".
          </p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-subtle to-brand-subtle flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-brand-subtle rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-brand-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Réinitialiser le mot de passe</h2>
          <p className="text-foreground/70 mt-2">Choisissez un nouveau mot de passe sécurisé.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent outline-none"
              placeholder="Minimum 8 caractères"
              disabled={!!success}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent outline-none"
              placeholder="Retapez le mot de passe"
              disabled={!!success}
            />
          </div>

          {error && (
            <Alert show={!!error} variant="destructive">
              {error}
            </Alert>
          )}

          {success && (
            <Alert show={!!success} variant="success">
              {success}
            </Alert>
          )}

          <button
            type="submit"
            disabled={isLoading || !!success}
            className="btn-brand w-full py-3 rounded-lg font-semibold transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

export default ResetPasswordScreen;
