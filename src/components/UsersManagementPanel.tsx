import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  UserPlus,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Users,
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { AuthService } from '../services/supabase/auth.service';
import { User } from '../types';

interface UsersManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreatePromoteurForm {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  barName: string;
  barAddress: string;
  barPhone: string;
}

const initialFormData: CreatePromoteurForm = {
  email: '',
  phone: '',
  password: '',
  firstName: '',
  lastName: '',
  barName: '',
  barAddress: '',
  barPhone: '',
};

type PromoterWithBars = User & { bars: { id: string; name: string }[] };

export function UsersManagementPanel({ isOpen, onClose }: UsersManagementPanelProps) {
  const { createBar } = useBarContext();
  const { initializeBarData } = useAppContext();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreatePromoteurForm>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<CreatePromoteurForm>>({});

  const [promoteurs, setPromoteurs] = useState<PromoterWithBars[]>([]);
  const [loading, setLoading] = useState(false);

  const [createdCredentials, setCreatedCredentials] = useState<{
    username: string;
    password: string;
    barName: string;
    name: string;
    email: string;
    phone: string;
  } | null>(null);

  // Charger les promoteurs
  const loadPromoters = async () => {
    try {
      setLoading(true);
      const data = await AuthService.getAllPromoters();
      // Map DbUser to AppUser
      const mappedPromoters = data.map(u => ({
        id: u.id,
        username: u.username || '',
        password: '',
        name: u.name || '',
        phone: u.phone || '',
        email: u.email || '',
        createdAt: new Date(u.created_at),
        isActive: u.is_active ?? true,
        firstLogin: u.first_login ?? false,
        lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : undefined,
        bars: u.bars
      }));
      setPromoteurs(mappedPromoters);
    } catch (error) {
      console.error('Erreur chargement promoteurs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPromoters();
    }
  }, [isOpen]);

  // Générer mot de passe sécurisé
  const generateSecurePassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    let password = '';

    // Garantir au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%&*'[Math.floor(Math.random() * 7)];

    // Compléter le reste
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Mélanger
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    setFormData({ ...formData, password });
  };

  // Copier credentials dans presse-papier
  const copyCredentials = (creds: any = formData) => {
    const username = creds.email.split('@')[0];
    const fullName = creds.name || `${creds.firstName} ${creds.lastName}`;
    const credentials = `Bar: ${creds.barName}\nNom: ${fullName}\nEmail: ${creds.email}\nTéléphone: ${creds.phone}\n\nCREDENTIALS:\nUsername: ${username}\nMot de passe: ${creds.password}`;

    navigator.clipboard.writeText(credentials).then(() => {
      alert('✅ Credentials copiés dans le presse-papier!');
    }).catch(() => {
      // Fallback pour navigateurs anciens
      const textarea = document.createElement('textarea');
      textarea.value = credentials;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('✅ Credentials copiés!');
    });
  };

  // Validation formulaire
  const validateForm = (): boolean => {
    const errors: Partial<CreatePromoteurForm> = {};

    if (!formData.email.trim()) errors.email = 'Email requis';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Email invalide';

    if (!formData.phone.trim()) errors.phone = 'Téléphone requis';
    else if (!/^01\d{8}$/.test(formData.phone.replace(/\s/g, ''))) errors.phone = 'Format: 01XXXXXXXX (10 chiffres)';

    if (!formData.password.trim()) errors.password = 'Mot de passe requis';
    else if (formData.password.length < 6) errors.password = 'Minimum 6 caractères';

    if (!formData.firstName.trim()) errors.firstName = 'Prénom requis';
    if (!formData.lastName.trim()) errors.lastName = 'Nom requis';
    if (!formData.barName.trim()) errors.barName = 'Nom du bar requis';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Créer promoteur + bar
  const handleCreatePromoteur = async () => {
    if (!validateForm()) return;

    try {
      // 1. Créer utilisateur via AuthService
      const username = formData.email.split('@')[0];
      const newUser = await AuthService.createPromoter({
        username,
        password: formData.password,
        name: `${formData.firstName} ${formData.lastName}`,
        phone: formData.phone,
        email: formData.email,
      });

      if (!newUser) {
        alert('Erreur lors de la création du promoteur');
        return;
      }

      // 2. Créer bar ET assigner le promoteur de manière atomique via RPC
      const barSettings = {
        currency: 'FCFA',
        currencySymbol: ' FCFA',
        timezone: 'Africa/Porto-Novo',
        language: 'fr',
        businessDayCloseHour: 6,
        operatingMode: 'full',
        consignmentExpirationDays: 7,
      };

      const result = await AuthService.setupPromoterBar(
        newUser.id,
        formData.barName,
        barSettings
      );

      if (!result.success || !result.barId) {
        alert(`Erreur lors de la création du bar: ${result.error || 'Erreur inconnue'}`);
        return;
      }

      // 3. Succès - Afficher modal de confirmation
      setCreatedCredentials({
        username,
        password: formData.password,
        barName: formData.barName,
        name: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        phone: formData.phone,
      });

      setFormData(initialFormData);
      setShowCreateForm(false);

      // Petit délai pour la propagation
      setTimeout(() => {
        loadPromoters();
      }, 500);
    } catch (error) {
      console.error('Erreur création promoteur:', error);
      alert('Erreur lors de la création');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
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
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col relative"
        >
          {/* Modal Succès Création */}
          <AnimatePresence>
            {createdCredentials && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 z-50 bg-white/95 backdrop-blur flex items-center justify-center p-4"
              >
                <div className="bg-white rounded-2xl shadow-2xl border border-green-100 p-8 max-w-md w-full text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <UserPlus className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Promoteur Créé !</h3>
                  <p className="text-gray-600 mb-6">
                    Le compte promoteur et son bar ont été créés avec succès.
                  </p>

                  <div className="bg-gray-50 rounded-xl p-4 text-left mb-6 border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Identifiants de connexion</p>
                    <div className="space-y-2 font-mono text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Bar:</span>
                        <span className="font-bold text-gray-900">{createdCredentials.barName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Username:</span>
                        <span className="font-bold text-purple-600">{createdCredentials.username}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Password:</span>
                        <span className="font-bold text-purple-600">{createdCredentials.password}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => copyCredentials(createdCredentials as any)}
                      className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Copy className="w-5 h-5" />
                      Copier les informations
                    </button>
                    <button
                      onClick={() => setCreatedCredentials(null)}
                      className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Gestion des Utilisateurs</h2>
                <p className="text-purple-100 text-sm">Créer et gérer les promoteurs</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Create Promoteur Button */}
            <div className="mb-4">
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow text-sm"
              >
                <UserPlus className="w-4 h-4" />
                {showCreateForm ? 'Masquer le formulaire' : 'Créer un Promoteur'}
              </button>
            </div>

            {/* Formulaire Création Promoteur */}
            <AnimatePresence>
              {showCreateForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-8 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200 overflow-hidden"
                >
                  <h3 className="text-xl font-bold text-purple-900 mb-4 flex items-center gap-2">
                    <UserPlus className="w-6 h-6" />
                    Nouveau Promoteur
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Infos Promoteur */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-purple-800 text-sm">Informations Promoteur</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Prénom *
                        </label>
                        <input
                          type="text"
                          value={formData.firstName}
                          onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.firstName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="Guy"
                        />
                        {formErrors.firstName && <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nom *
                        </label>
                        <input
                          type="text"
                          value={formData.lastName}
                          onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.lastName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="GOUNOU"
                        />
                        {formErrors.lastName && <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="guy.gounou@example.com"
                        />
                        {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Téléphone *
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.phone ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="0197123456"
                        />
                        {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mot de passe *
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                              className={`w-full px-4 py-2 border rounded-lg pr-10 ${formErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                              placeholder="Minimum 6 caractères"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={generateSecurePassword}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                            title="Générer un mot de passe sécurisé"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                        {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                        <p className="text-xs text-gray-500 mt-1">
                          💡 Cliquez sur <RefreshCw className="w-3 h-3 inline" /> pour générer un mot de passe sécurisé
                        </p>
                      </div>
                    </div>

                    {/* Infos Bar */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-purple-800 text-sm">Informations du Bar</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nom du Bar *
                        </label>
                        <input
                          type="text"
                          value={formData.barName}
                          onChange={(e) => setFormData({ ...formData, barName: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.barName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="Bar La Plage"
                        />
                        {formErrors.barName && <p className="text-red-500 text-xs mt-1">{formErrors.barName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Adresse (optionnel)
                        </label>
                        <input
                          type="text"
                          value={formData.barAddress}
                          onChange={(e) => setFormData({ ...formData, barAddress: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          placeholder="Cotonou, Bénin"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Téléphone Bar (optionnel)
                        </label>
                        <input
                          type="tel"
                          value={formData.barPhone}
                          onChange={(e) => setFormData({ ...formData, barPhone: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          placeholder="0197987654"
                        />
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-purple-200 mt-6">
                        <h5 className="font-semibold text-gray-700 text-sm mb-2">Récapitulatif</h5>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Username: <span className="font-mono text-purple-600">{formData.email.split('@')[0] || '(email)'}</span></li>
                          <li>• Email: <span className="font-mono text-purple-600">{formData.email || '(à remplir)'}</span></li>
                          <li>• Rôle: <span className="font-semibold text-purple-700">Promoteur</span></li>
                          <li>• Bar créé automatiquement</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-6">
                    <button
                      onClick={handleCreatePromoteur}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-shadow"
                    >
                      Créer le Promoteur
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCredentials()}
                      disabled={!formData.email || !formData.password}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      title="Copier les credentials dans le presse-papier"
                    >
                      <Copy className="w-4 h-4" />
                      Copier
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        setFormData(initialFormData);
                        setFormErrors({});
                      }}
                      className="px-6 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Liste des Promoteurs */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                Promoteurs ({promoteurs.length})
              </h3>

              {loading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-purple-600" />
                  <p className="mt-2 text-gray-500">Chargement des promoteurs...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {promoteurs.map((user) => (
                    <div
                      key={user.id}
                      className="bg-white rounded-lg p-4 border-2 border-purple-200 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-gray-900">{user.name}</h4>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                          {user.isActive ? 'Actif' : 'Suspendu'}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-gray-600">
                        <p><span className="font-semibold">Téléphone:</span> {user.phone}</p>
                        <p><span className="font-semibold">Bars:</span> {user.bars.length}</p>
                        {user.bars.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="font-semibold text-purple-700 mb-1">Bars gérés:</p>
                            <ul className="space-y-0.5">
                              {user.bars.map((bar) => (
                                <li key={bar.id} className="text-xs">
                                  • {bar.name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && promoteurs.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-semibold">Aucun promoteur créé pour le moment</p>
                  <p className="text-sm">Créez votre premier promoteur pour commencer</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
