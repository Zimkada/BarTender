import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert } from './ui/Alert';

import { useAuthNav } from '../layouts/AuthLayout';

function ForgotPasswordScreen() {
  const { navigateToLogin } = useAuthNav();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!email) {
      setError('Veuillez entrer votre adresse email');
      setIsLoading(false);
      return;
    }

    try {
      await resetPassword(email);
      setSuccess('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
    } catch (error: any) {
      // On affiche un message de succès générique pour ne pas révéler si un email existe ou non
      setSuccess('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Mot de passe oublié</h2>
          <p className="text-gray-600 mt-2">Entrez votre email pour recevoir un lien de réinitialisation.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="votre.email@example.com"
                autoComplete="email"
                disabled={!!success}
              />
            </div>
          </div>

          {error && (
            <Alert show={!!error} variant="destructive">
              {error}
            </Alert>
          )}

          {success && (
            <Alert show={!!success} variant="success">
              {success}
              <p className="mt-2 text-xs text-gray-700">En cas de difficulté, veuillez contacter votre administrateur.</p>
            </Alert>
          )}

          <button
            type="submit"
            disabled={isLoading || !!success}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-amber-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Envoi en cours...' : 'Envoyer le lien'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={navigateToLogin}
            className="font-medium text-amber-600 hover:text-amber-500 bg-transparent border-none cursor-pointer"
          >
            Retour à la connexion
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default ForgotPasswordScreen;
