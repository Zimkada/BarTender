import React, { useState, useEffect } from 'react';
import { Building2, User as UserIcon, Lock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';


function LoginScreen({ onNavigateToForgotPassword }: { onNavigateToForgotPassword: () => void }) {
  const { login, changePassword, verifyMfa } = useAuth();
  const { bars } = useBarContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedBar, setSelectedBar] = useState<string>('');
  const [barSearchQuery] = useState(''); // 🔒 Recherche bar par nom au lieu de dropdown
  const [error, setError] = useState('');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // États pour la 2FA
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');

  // 🔒 Trouver le bar par nom (sécurité: pas de liste visible)
  // Désactivé pour super admin (pas besoin de bar)
  useEffect(() => {
    if (barSearchQuery.trim() && !email.includes('@')) {
      const foundBar = bars.find(b =>
        b.name.toLowerCase() === barSearchQuery.toLowerCase().trim()
      );
      setSelectedBar(foundBar?.id || '');
    } else {
      setSelectedBar('');
    }
  }, [barSearchQuery, bars, email]);

  // Réinitialiser l'erreur quand on change les champs
  useEffect(() => {
    setError('');
  }, [email, password, selectedBar, barSearchQuery]);

  // Vérifier si la session a expiré
  useEffect(() => {
    if (sessionStorage.getItem('session_expired') === 'true') {
      setError('Votre session a expiré. Veuillez vous reconnecter.');
      sessionStorage.removeItem('session_expired');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMfaError(''); // Clear MFA errors

    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    // Support login par nom d'utilisateur
    let loginEmail = email;
    if (!email.includes('@')) {
      loginEmail = `${email}@bartender.app`;
    }

    try {
      const result = await login(loginEmail, password);

      if (result.mfaRequired) {
        setMfaRequired(true);
        setMfaFactorId(result.mfaFactorId || null);
        setError(''); // Clear general login error
        return;
      }

      if (result.user) {
        if (result.user.first_login) {
          setIsFirstLogin(true);
        }
        // Login successful, context will handle setting currentSession
      } else if (result.error) {
        setError(result.error);
      }
    } catch (error: any) {
      setError(error.message || 'Erreur lors de la connexion');
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');

    if (!mfaCode || mfaCode.length !== 6) {
      setMfaError('Veuillez entrer un code à 6 chiffres valide.');
      return;
    }
    if (!mfaFactorId) {
      setMfaError('Erreur: ID du facteur MFA manquant.');
      return;
    }

    try {
      const result = await verifyMfa(mfaFactorId, mfaCode);

      if (result.user) {
        // MFA login successful, context will handle setting currentSession
        setMfaRequired(false);
        setMfaFactorId(null);
        setMfaCode('');
      } else if (result.error) {
        setMfaError(result.error);
      }
    } catch (error: any) {
      setMfaError(error.message || 'Erreur lors de la vérification MFA.');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 4) {
      setError('Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    try {
      // Changer le mot de passe via AuthService (Supabase Auth)
      await changePassword(newPassword);

      // Re-login automatique avec le nouveau mot de passe
      // Support login par nom d'utilisateur pour le re-login aussi
      let loginEmail = email;
      if (!email.includes('@')) {
        loginEmail = `${email}@bartender.local`;
      }

      const result = await login(loginEmail, newPassword);

      if (result.user) {
        // Connexion réussie, l'écran de login disparaîtra automatiquement
        setIsFirstLogin(false);
      }
    } catch (error: any) {
      setError(error.message || 'Erreur lors du changement de mot de passe');
    }
  };

  // Écran de défi MFA
  if (mfaRequired) {
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
            <h2 className="text-2xl font-bold text-gray-800">Vérification 2FA</h2>
            <p className="text-gray-600 mt-2">Veuillez entrer le code de votre application d'authentification.</p>
          </div>

          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Code à 6 chiffres
              </label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center text-xl tracking-widest"
                placeholder="XXXXXX"
                maxLength={6}
                autoFocus
              />
            </div>

            {mfaError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2"
              >
                <AlertCircle size={20} />
                <span className="text-sm">{mfaError}</span>
              </motion.div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-amber-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02]"
            >
              Vérifier le code
            </button>
            <button
              type="button"
              onClick={() => {
                setMfaRequired(false);
                setMfaFactorId(null);
                setMfaCode('');
                setMfaError('');
                setError('Connexion annulée.'); // Optionally show a message
              }}
              className="w-full mt-2 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-all duration-200"
            >
              Annuler
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Écran de changement de mot de passe (première connexion)
  if (isFirstLogin) {
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
            <h2 className="text-2xl font-bold text-gray-800">Première connexion</h2>
            <p className="text-gray-600 mt-2">Veuillez changer votre mot de passe</p>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Minimum 4 caractères"
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
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2"
              >
                <AlertCircle size={20} />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-amber-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02]"
            >
              Changer le mot de passe
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Écran de connexion principal
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-500 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">BarTender Pro</h1>
          <p className="text-gray-600 mt-2">Connectez-vous à votre espace</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email ou Nom d'utilisateur
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Email ou nom d'utilisateur"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2"
              >
                <AlertCircle size={20} />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-amber-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-amber-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02]"
          >
            Se connecter
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={onNavigateToForgotPassword}
            className="font-medium text-amber-600 hover:text-amber-500 bg-transparent border-none cursor-pointer"
          >
            Mot de passe oublié ?
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Contactez votre administrateur pour obtenir vos identifiants
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default LoginScreen;