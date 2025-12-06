import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Import direct de supabase

export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);

  useEffect(() => {
    // Écouter l'événement de récupération de mot de passe de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
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

    } catch (error: any) {
      setError(error.message || 'Erreur lors de la mise à jour du mot de passe.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-center">
        <div className="max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-gray-800">Lien invalide ou expiré</h2>
          <p className="mt-2 text-gray-600">
            Pour réinitialiser votre mot de passe, veuillez faire une nouvelle demande depuis la page "Mot de passe oublié".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Réinitialiser le mot de passe</h2>
          <p className="text-gray-600 mt-2">Choisissez un nouveau mot de passe sécurisé.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Minimum 6 caractères"
              disabled={!!success}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Retapez le mot de passe"
              disabled={!!success}
            />
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle size={20} /> <span className="text-sm">{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-green-50 text-green-700 p-3 rounded-lg flex items-center gap-2">
              <CheckCircle size={20} /> <span className="text-sm">{success}</span>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={isLoading || !!success}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-amber-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

export default ResetPasswordScreen;
