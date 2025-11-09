import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Building2,
  TrendingUp,
  UserPlus,
  Eye,
  EyeOff,
  Ban,
  CheckCircle,
  ShieldCheck,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Bar, User } from '../types';

interface SuperAdminDashboardProps {
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

export default function SuperAdminDashboard({ isOpen, onClose }: SuperAdminDashboardProps) {
  const { bars, createBar, updateBar, barMembers, getBarMembers } = useBarContext();
  const { users, createUser } = useAuth();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreatePromoteurForm>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<CreatePromoteurForm>>({});

  // Statistiques globales
  const stats = useMemo(() => {
    const promoteurs = users.filter(u => {
      const memberRoles = barMembers.filter(m => m.userId === u.id).map(m => m.role);
      return memberRoles.includes('promoteur');
    });

    const totalRevenue = 0; // TODO: Calculer CA total de tous les bars

    return {
      totalBars: bars.length,
      totalPromoteurs: promoteurs.length,
      activeBars: bars.filter(b => b.isActive).length,
      totalRevenue,
    };
  }, [bars, users, barMembers]);

  // Validation formulaire
  const validateForm = (): boolean => {
    const errors: Partial<CreatePromoteurForm> = {};

    if (!formData.email.trim()) errors.email = 'Email requis';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Email invalide';

    if (!formData.phone.trim()) errors.phone = 'Téléphone requis';
    else if (!/^\d{8,}$/.test(formData.phone.replace(/\s/g, ''))) errors.phone = 'Téléphone invalide';

    if (!formData.password.trim()) errors.password = 'Mot de passe requis';
    else if (formData.password.length < 6) errors.password = 'Minimum 6 caractères';

    if (!formData.firstName.trim()) errors.firstName = 'Prénom requis';
    if (!formData.lastName.trim()) errors.lastName = 'Nom requis';
    if (!formData.barName.trim()) errors.barName = 'Nom du bar requis';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Créer promoteur + bar
  const handleCreatePromoteur = () => {
    if (!validateForm()) return;

    try {
      // 1. Créer utilisateur
      const username = formData.email.split('@')[0]; // email prefix comme username
      const newUser = createUser(
        {
          username,
          password: formData.password,
          name: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone,
          email: formData.email,
          isActive: true,
          firstLogin: true,
        },
        'promoteur'
      );

      if (!newUser) {
        alert('Erreur lors de la création du promoteur');
        return;
      }

      // 2. Créer bar
      const newBar = createBar({
        name: formData.barName,
        address: formData.barAddress || undefined,
        phone: formData.barPhone || undefined,
        email: formData.email,
        isActive: true,
        settings: {
          currency: 'FCFA',
          currencySymbol: ' FCFA',
          timezone: 'Africa/Porto-Novo',
          language: 'fr',
          businessDayCloseHour: 6,
          operatingMode: 'full',
          consignmentExpirationDays: 7,
        },
      });

      if (!newBar) {
        alert('Erreur lors de la création du bar');
        return;
      }

      // 3. Succès
      alert(`✅ Promoteur créé avec succès!\n\nCredentials:\nEmail: ${formData.email}\nMot de passe: ${formData.password}\n\n(Envoyez ces informations au promoteur)`);

      setFormData(initialFormData);
      setShowCreateForm(false);
    } catch (error) {
      console.error('Erreur création promoteur:', error);
      alert('Erreur lors de la création');
    }
  };

  // Suspendre/Activer un bar
  const toggleBarStatus = (barId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'suspendre' : 'activer';
    if (confirm(`Voulez-vous vraiment ${action} ce bar ?`)) {
      updateBar(barId, { isActive: !currentStatus });
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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Super Admin Dashboard</h2>
                <p className="text-purple-100 text-sm">Gestion globale de BarTender Pro</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="p-6 bg-gradient-to-b from-purple-50 to-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-md border border-purple-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total Bars</p>
                    <p className="text-2xl font-bold text-purple-600">{stats.totalBars}</p>
                  </div>
                  <Building2 className="w-10 h-10 text-purple-400" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-md border border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Promoteurs</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.totalPromoteurs}</p>
                  </div>
                  <Users className="w-10 h-10 text-blue-400" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-md border border-green-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Bars Actifs</p>
                    <p className="text-2xl font-bold text-green-600">{stats.activeBars}</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-green-400" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-md border border-orange-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">CA Total</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {stats.totalRevenue.toLocaleString()} FCFA
                    </p>
                  </div>
                  <DollarSign className="w-10 h-10 text-orange-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Bouton Créer Promoteur */}
            <div className="mb-6">
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow"
              >
                <UserPlus className="w-5 h-5" />
                Créer un Promoteur
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
                          placeholder="Jean"
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
                          placeholder="Dupont"
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
                          placeholder="jean@example.com"
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
                          placeholder="97123456"
                        />
                        {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mot de passe *
                        </label>
                        <div className="relative">
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
                        {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
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
                          placeholder="97987654"
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

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleCreatePromoteur}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-shadow"
                    >
                      Créer le Promoteur
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

            {/* Liste des Bars */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-purple-600" />
                Tous les Bars ({bars.length})
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bars.map((bar) => {
                  const owner = users.find(u => u.id === bar.ownerId);
                  const members = getBarMembers(bar.id);

                  return (
                    <div
                      key={bar.id}
                      className={`bg-white rounded-xl p-4 border-2 ${
                        bar.isActive ? 'border-green-200' : 'border-red-200'
                      } hover:shadow-lg transition-shadow`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-lg text-gray-900">{bar.name}</h4>
                          <p className="text-sm text-gray-500">{bar.address || 'Pas d\'adresse'}</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          bar.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {bar.isActive ? 'Actif' : 'Suspendu'}
                        </div>
                      </div>

                      <div className="space-y-2 text-sm mb-4">
                        <p className="text-gray-600">
                          <span className="font-semibold">Promoteur:</span> {owner?.name || 'Inconnu'}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-semibold">Email:</span> {bar.email || 'N/A'}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-semibold">Téléphone:</span> {bar.phone || 'N/A'}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-semibold">Membres:</span> {members.length}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-semibold">Créé le:</span>{' '}
                          {new Date(bar.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleBarStatus(bar.id, bar.isActive)}
                          className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 ${
                            bar.isActive
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {bar.isActive ? (
                            <>
                              <Ban className="w-4 h-4" />
                              Suspendre
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Activer
                            </>
                          )}
                        </button>
                        <button className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-semibold text-sm hover:bg-purple-200 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          Stats
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {bars.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-semibold">Aucun bar créé pour le moment</p>
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
