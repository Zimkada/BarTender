import React, { useState, useEffect } from 'react';
import { Building2, User as UserIcon, Lock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { User } from '../types';
//import { CheckCircle } from 'lucide-react';
//import { UserRole } from '../types';

export function LoginScreen() {
  const { login, users, changePassword } = useAuth();
  const { bars, barMembers } = useBarContext();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedBar, setSelectedBar] = useState<string>('');
  const [error, setError] = useState('');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Réinitialiser l'erreur quand on change les champs
  useEffect(() => {
    setError('');
  }, [username, password, selectedBar]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    if (!selectedBar) {
      setError('Veuillez sélectionner un bar');
      return;
    }

    // Trouver l'utilisateur et son rôle dans le bar sélectionné
    // Chercher l'utilisateur par username dans la liste des users
    const user = users.find((u: User) => u.username === username);
    if (!user) {
      setError('Identifiants incorrects');
      return;
    }

    // Vérifier que l'utilisateur a accès à ce bar
    const membership = barMembers.find(m => 
      (m.userId === user?.id || m.userId === username) && 
      m.barId === selectedBar && 
      m.isActive
    );

    if (!membership) {
      setError('Vous n\'avez pas accès à ce bar');
      return;
    }

    // Tenter la connexion
    const session = login(username, password, selectedBar, membership.role);
    
    if (session) {
      // Vérifier si c'est la première connexion
      if (user?.firstLogin) {
        setIsFirstLogin(true);
        setCurrentUserId(user.id);
      }
    } else {
      setError('Identifiants incorrects');
    }
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 4) {
      setError('Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    changePassword(currentUserId, newPassword);
    
    // Re-login avec le nouveau mot de passe
    const membership = barMembers.find(m => 
      m.userId === currentUserId && 
      m.barId === selectedBar && 
      m.isActive
    );
    
    if (membership) {
      login(username, newPassword, selectedBar, membership.role);
    }
  };

  // Écran de changement de mot de passe (première connexion)
  if (isFirstLogin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-orange-600" />
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-orange-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02]"
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-orange-400 to-amber-400 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">BarTender Pro</h1>
          <p className="text-gray-600 mt-2">Connectez-vous à votre espace</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bar
            </label>
            <select
              value={selectedBar}
              onChange={(e) => setSelectedBar(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="">Sélectionnez un bar</option>
              {bars.map(bar => (
                <option key={bar.id} value={bar.id}>
                  {bar.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom d'utilisateur
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Votre identifiant"
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3 rounded-lg font-semibold hover:from-orange-600 hover:to-amber-600 transition-all duration-200 transform hover:scale-[1.02]"
          >
            Se connecter
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Contactez votre administrateur pour obtenir vos identifiants
          </p>
        </div>
      </motion.div>
    </div>
  );
}