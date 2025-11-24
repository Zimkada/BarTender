import React, { useState } from 'react';
import { Users, UserPlus, Shield, User as UserIcon, X, Check, Trash2 } from 'lucide-react';
//import { Edit2} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from "../context/AuthContext";
import { useBarContext } from '../context/BarContext';
import { UserRole } from '../types';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/supabase/auth.service';

interface UserManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserManagement({ isOpen, onClose }: UserManagementProps) {
  const { hasPermission } = useAuth();
  const { currentBar, barMembers, removeBarMember, refreshBars } = useBarContext();
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('serveur');

  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Email removed - auto-generated
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!currentBar) return null;

  // Use barMembers directly from context (it's an array, not a promise)
  const managers = barMembers.filter(m => m.role === 'gerant');
  const servers = barMembers.filter(m => m.role === 'serveur');

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return Shield; // Use Shield for super_admin too
      case 'promoteur': return Shield;
      case 'gerant': return UserIcon;
      case 'serveur': return Users;
      default: return Users;
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return 'text-purple-800 bg-purple-200';
      case 'promoteur': return 'text-purple-600 bg-purple-100';
      case 'gerant': return 'text-amber-600 bg-amber-100';
      case 'serveur': return 'text-amber-600 bg-amber-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'promoteur': return 'Promoteur';
      case 'gerant': return 'Gérant';
      case 'serveur': return 'Serveur';
      default: return role;
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!username || !password || !name || !phone) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (password.length < 4) {
      setError('Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    try {
      // Vérifier que le username n'existe pas déjà
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        setError('Ce nom d\'utilisateur existe déjà');
        return;
      }

      // Créer l'utilisateur et l'assigner au bar
      // Auto-generate email from username
      const generatedEmail = `${username}@bartender.local`;

      await AuthService.signup(
        {
          username,
          password,
          name,
          phone,
          email: generatedEmail,
        },
        currentBar.id,
        selectedRole as 'gerant' | 'serveur'
      );

      // Rafraîchir la liste des membres
      await refreshBars();

      setSuccess(`${getRoleLabel(selectedRole)} créé avec succès`);
      // Reset form
      setUsername('');
      setPassword('');
      setName('');
      setPhone('');
      setTimeout(() => {
        setShowAddUser(false);
        setSuccess('');
      }, 2000);

    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message || 'Erreur lors de la création de l\'utilisateur');
    }
  };

  const handleRemoveMember = (memberId: string, userName: string) => {
    if (window.confirm(`Êtes-vous sûr de vouloir retirer ${userName} ?`)) {
      removeBarMember(memberId);
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gradient-to-br from-amber-50 to-amber-50 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl"
          >
            {/* Header avec bouton fermer */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-500 p-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Users className="text-white" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Équipe du bar</h2>
                  <p className="text-amber-100">{currentBar?.name}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="text-white" size={24} />
              </button>
            </div>

            {/* Content scrollable */}
            <div className="overflow-y-auto max-h-[calc(90vh-88px)] p-6">
              <div className="space-y-6">
                {/* Action button */}
                {(hasPermission('canCreateManagers') || hasPermission('canCreateServers')) && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowAddUser(true)}
                      className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2 shadow-md"
                    >
                      <UserPlus size={20} />
                      Ajouter un membre
                    </button>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600">Gérants</p>
                        <p className="text-2xl font-bold">{managers.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600">Serveurs</p>
                        <p className="text-2xl font-bold">{servers.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600">Total équipe</p>
                        <p className="text-2xl font-bold">{barMembers.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <Check className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Members List */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b">
                    <h3 className="font-semibold text-gray-800">Membres de l'équipe</h3>
                  </div>

                  <div className="divide-y">
                    {barMembers.map(member => {
                      const Icon = getRoleIcon(member.role);
                      const colorClass = getRoleColor(member.role);

                      return (
                        <div key={member.id} className="p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                                <Icon size={20} />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{member.user?.name || 'Utilisateur inconnu'}</p>
                                <p className="text-sm text-gray-500">
                                  {getRoleLabel(member.role)} • @{member.user?.username || 'unknown'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {member.user?.lastLoginAt && (
                                <span className="text-xs text-gray-400">
                                  Dernière connexion: {new Date(member.user.lastLoginAt).toLocaleDateString()}
                                </span>
                              )}

                              {member.role !== 'promoteur' && member.role !== 'super_admin' &&
                                ((member.role === 'gerant' && hasPermission('canCreateManagers')) ||
                                  (member.role === 'serveur' && hasPermission('canCreateServers'))) && (
                                  <button
                                    onClick={() => member.user && handleRemoveMember(member.id, member.user.name)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add User Modal */}
                <AnimatePresence>
                  {showAddUser && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
                      onClick={() => setShowAddUser(false)}
                    >
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-xl p-6 w-full max-w-md"
                      >
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-bold">Ajouter un membre</h3>
                          <button
                            onClick={() => setShowAddUser(false)}
                            className="p-1 hover:bg-gray-100 rounded-lg"
                          >
                            <X size={20} />
                          </button>
                        </div>

                        <form onSubmit={handleAddUser} className="space-y-4">
                          {/* Role Selection - Compact */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                              Rôle
                            </label>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                              {hasPermission('canCreateManagers') && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRole('gerant')}
                                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${selectedRole === 'gerant'
                                    ? 'bg-white text-amber-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                  Gérant
                                </button>
                              )}
                              {hasPermission('canCreateServers') && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRole('serveur')}
                                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${selectedRole === 'serveur'
                                    ? 'bg-white text-amber-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                  Serveur
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Form Fields - Grid Layout */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="col-span-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Nom d'utilisateur *
                              </label>
                              <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                                placeholder="nom.prenom"
                              />
                            </div>

                            <div className="col-span-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Mot de passe *
                              </label>
                              <input
                                type="text"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                                placeholder="Min 4 chars"
                              />
                            </div>

                            <div className="col-span-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Nom complet *
                              </label>
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                                placeholder="Prénom Nom"
                              />
                            </div>

                            <div className="col-span-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Téléphone *
                              </label>
                              <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                                placeholder="0197000000"
                              />
                            </div>
                          </div>

                          {/* Messages */}
                          {error && (
                            <div className="bg-red-50 text-red-600 p-2 rounded-lg text-xs">
                              {error}
                            </div>
                          )}

                          {success && (
                            <div className="bg-green-50 text-green-600 p-2 rounded-lg text-xs">
                              {success}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowAddUser(false)}
                              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                            >
                              Annuler
                            </button>
                            <button
                              type="submit"
                              className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium"
                            >
                              Créer
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}