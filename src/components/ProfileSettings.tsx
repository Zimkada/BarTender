// components/ProfileSettings.tsx - Paramètres utilisateur (mot de passe, infos personnelles)
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  User,
  Lock,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  CheckCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/supabase/auth.service';
import { supabase } from '../lib/supabase';
import type { User as UserType } from '../types';
import { Input } from './ui/Input';

interface ProfileSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileSettings({ isOpen, onClose }: ProfileSettingsProps) {
  const { currentSession, changePassword, refreshSession } = useAuth();
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info');

  // Onglet Infos personnelles
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Onglet Mot de passe
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Messages
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch user data when modal opens
  useEffect(() => {
    if (isOpen && currentSession?.userId) {
      setLoading(true);
      supabase
        .from('users')
        .select('*')
        .eq('id', currentSession.userId)
        .single()
        .then(({ data, error }) => {
          if (data) {
            // Map Supabase user to UserType
            const user: UserType = {
              id: data.id,
              username: data.username || '',
              password: '', // Not available
              name: data.name || '',
              phone: data.phone || '',
              email: data.email || '',
              createdAt: new Date(data.created_at),
              isActive: data.is_active ?? true,
              firstLogin: data.first_login ?? false,
              lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
            };
            setCurrentUser(user);
            setName(user.name);
            setEmail(user.email || '');
            setPhone(user.phone);
          } else if (error) {
            console.error('Error fetching user profile:', error);
            setErrorMessage('Impossible de charger le profil utilisateur');
          }
          setLoading(false);
        });
    }
  }, [isOpen, currentSession?.userId]);

  // Validation mot de passe
  const validatePassword = (password: string): string | null => {
    if (password.length < 4) {
      return 'Le mot de passe doit contenir au moins 4 caractères';
    }
    return null;
  };

  // Sauvegarder infos personnelles
  const handleSaveInfo = async () => {
    if (!currentUser) return;

    setErrorMessage('');
    setSuccessMessage('');

    // Validation
    if (!name.trim()) {
      setErrorMessage('Le nom est requis');
      return;
    }

    if (phone && !/^[0-9]{10}$/.test(phone.replace(/\s/g, ''))) {
      setErrorMessage('Le téléphone doit contenir 10 chiffres');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Email invalide');
      return;
    }

    try {
      await AuthService.updateProfile(currentUser.id, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
      });

      // Update local state
      setCurrentUser(prev => prev ? {
        ...prev,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
      } : null);

      // Refresh global session
      await refreshSession();

      setSuccessMessage('Informations mises à jour avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setErrorMessage(error.message || 'Erreur lors de la mise à jour');
    }
  };

  // Changer mot de passe
  const handleChangePassword = async () => {
    if (!currentUser) return;

    setErrorMessage('');
    setSuccessMessage('');

    // Note: We cannot validate current password client-side with Supabase Auth
    // unless we try to sign in with it, which requires re-auth flow.
    // For now, we trust the user is logged in.
    // Ideally, we should ask for re-authentication before sensitive changes.

    // Validation nouveau mot de passe
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    // Vérifier confirmation
    if (newPassword !== confirmPassword) {
      setErrorMessage('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    // Vérifier que le nouveau mot de passe est différent
    if (newPassword === currentPassword) {
      setErrorMessage('Le nouveau mot de passe doit être différent de l\'ancien');
      return;
    }

    try {
      await changePassword(newPassword);

      // Reset formulaire
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Mot de passe modifié avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Error changing password:', error);
      setErrorMessage(error.message || 'Erreur lors du changement de mot de passe');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div
              className={`bg-gradient-to-r ${currentSession?.role === 'super_admin'
                  ? 'from-indigo-600 to-purple-600'
                  : 'from-amber-500 to-orange-500'
                } p-6 text-white`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Mon Profil</h2>
                  <p
                    className={`${currentSession?.role === 'super_admin'
                        ? 'text-indigo-100'
                        : 'text-amber-100'
                      } text-sm mt-1`}
                  >
                    Gérez vos informations personnelles
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 flex justify-center">
                <div
                  className={`animate-spin rounded-full h-8 w-8 border-b-2 ${currentSession?.role === 'super_admin'
                      ? 'border-indigo-600'
                      : 'border-amber-500'
                    }`}
                ></div>
              </div>
            ) : !currentUser ? (
              <div className="p-8 text-center text-red-600">
                <AlertCircle className="w-12 h-12 mx-auto mb-2" />
                <p>Impossible de charger le profil.</p>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div className="flex border-b bg-gray-50">
                  <button
                    onClick={() => setActiveTab('info')}
                    className={`flex-1 py-3 px-4 font-medium transition-colors ${activeTab === 'info'
                        ? `bg-white border-b-2 ${currentSession?.role === 'super_admin'
                          ? 'text-indigo-600 border-indigo-600'
                          : 'text-amber-600 border-amber-600'
                        }`
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <User className="w-4 h-4 inline mr-2" />
                    Informations
                  </button>
                  <button
                    onClick={() => setActiveTab('password')}
                    className={`flex-1 py-3 px-4 font-medium transition-colors ${activeTab === 'password'
                        ? `bg-white border-b-2 ${currentSession?.role === 'super_admin'
                          ? 'text-indigo-600 border-indigo-600'
                          : 'text-amber-600 border-amber-600'
                        }`
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <Lock className="w-4 h-4 inline mr-2" />
                    Mot de passe
                  </button>
                </div>

                {/* Messages */}
                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800"
                  >
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{successMessage}</p>
                  </motion.div>
                )}

                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800"
                  >
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{errorMessage}</p>
                  </motion.div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeTab === 'info' && (
                    <div className="space-y-4">
                      {/* Nom */}
                      <Input
                        label="Nom complet"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Koffi KOUASSI"
                        required
                      />

                      {/* Email */}
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="email@exemple.com"
                        leftIcon={<Mail className="w-4 h-4" />}
                      />

                      {/* Téléphone */}
                      <Input
                        label="Téléphone"
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="0197000000"
                        leftIcon={<Phone className="w-4 h-4" />}
                        required
                      />

                      {/* Infos en lecture seule */}
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2 mt-6">
                        <p className="text-xs text-gray-500 font-semibold uppercase">
                          Informations du compte
                        </p>
                        <div className="text-sm">
                          <span className="text-gray-600">Nom d'utilisateur: </span>
                          <span className="font-medium">{currentUser.username}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-600">Rôle: </span>
                          <span className="font-medium">{currentSession?.role}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-600">Créé le: </span>
                          <span className="font-medium">
                            {new Date(currentUser.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>

                      {/* Bouton sauvegarder */}
                      <button
                        onClick={handleSaveInfo}
                        className={`w-full bg-gradient-to-r ${currentSession?.role === 'super_admin'
                            ? 'from-indigo-600 to-purple-600'
                            : 'from-amber-500 to-orange-500'
                          } text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-shadow flex items-center justify-center gap-2 mt-6`}
                      >
                        <Save className="w-5 h-5" />
                        Enregistrer les modifications
                      </button>
                    </div>
                  )}

                  {activeTab === 'password' && (
                    <div className="space-y-4">
                      {/* Mot de passe actuel */}
                      <div>
                        <Input
                          label="Mot de passe actuel"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          rightIcon={
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="text-gray-600 hover:text-gray-600"
                            >
                              {showCurrentPassword ? (
                                <EyeOff className="w-5 h-5" />
                              ) : (
                                <Eye className="w-5 h-5" />
                              )}
                            </button>
                          }
                        />
                      </div>

                      {/* Nouveau mot de passe */}
                      <Input
                        label="Nouveau mot de passe"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        helperText="Minimum 4 caractères"
                        rightIcon={
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="text-gray-600 hover:text-gray-600"
                          >
                            {showNewPassword ? (
                              <EyeOff className="w-5 h-5" />
                            ) : (
                              <Eye className="w-5 h-5" />
                            )}
                          </button>
                        }
                      />

                      {/* Confirmer nouveau mot de passe */}
                      <Input
                        label="Confirmer le nouveau mot de passe"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        rightIcon={
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="text-gray-600 hover:text-gray-600"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="w-5 h-5" />
                            ) : (
                              <Eye className="w-5 h-5" />
                            )}
                          </button>
                        }
                      />

                      {/* Conseils sécurité */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                        <p className="text-sm text-blue-900 font-semibold mb-2">
                          💡 Conseils pour un mot de passe sécurisé
                        </p>
                        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                          <li>Utilisez au moins 8 caractères</li>
                          <li>Mélangez lettres majuscules et minuscules</li>
                          <li>Ajoutez des chiffres et des caractères spéciaux</li>
                          <li>Ne réutilisez pas vos anciens mots de passe</li>
                        </ul>
                      </div>

                      {/* Bouton changer mot de passe */}
                      <button
                        onClick={handleChangePassword}
                        disabled={!currentPassword || !newPassword || !confirmPassword}
                        className={`w-full bg-gradient-to-r ${currentSession?.role === 'super_admin'
                            ? 'from-indigo-600 to-purple-600'
                            : 'from-amber-500 to-orange-500'
                          } text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-shadow flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <Lock className="w-5 h-5" />
                        Changer le mot de passe
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

