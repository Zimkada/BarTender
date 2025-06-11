import React, { useState } from 'react';
import { Users, UserPlus, Shield, User as UserIcon, X, Check, Trash2 } from 'lucide-react';
//import { Edit2} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from "../context/AuthContext";
import { useBarContext } from '../context/BarContext';
import { UserRole } from '../types';

export function UserManagement() {
  const { createUser, hasPermission,  users } = useAuth();
  const { currentBar, getBarMembers, addBarMember, removeBarMember } = useBarContext();
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('serveur');
  
  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!currentBar) return null;

  const barMembers = getBarMembers(currentBar.id);
  const managers = barMembers.filter(m => m.role === 'gerant');
  const servers = barMembers.filter(m => m.role === 'serveur');

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'promoteur': return Shield;
      case 'gerant': return UserIcon;
      case 'serveur': return Users;
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'promoteur': return 'text-purple-600 bg-purple-100';
      case 'gerant': return 'text-orange-600 bg-orange-100';
      case 'serveur': return 'text-amber-600 bg-amber-100';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'promoteur': return 'Promoteur';
      case 'gerant': return 'Gérant';
      case 'serveur': return 'Serveur';
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

    // Vérifier que le username n'existe pas déjà
    if (users.some(u => u.username === username)) {
      setError('Ce nom d\'utilisateur existe déjà');
      return;
    }

    // Créer l'utilisateur
    const newUser = createUser({
      username,
      password,
      name,
      phone,
      email,
      isActive: true,
      firstLogin: true,
    }, selectedRole);

    if (newUser) {
      // Ajouter au bar actuel
      const member = addBarMember(newUser.id, selectedRole);
      
      if (member) {
        setSuccess(`${getRoleLabel(selectedRole)} créé avec succès`);
        // Reset form
        setUsername('');
        setPassword('');
        setName('');
        setPhone('');
        setEmail('');
        setTimeout(() => {
          setShowAddUser(false);
          setSuccess('');
        }, 2000);
      }
    }
  };

  const handleRemoveMember = (memberId: string, userName: string) => {
    if (window.confirm(`Êtes-vous sûr de vouloir retirer ${userName} ?`)) {
      removeBarMember(memberId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Équipe du bar</h2>
          <p className="text-gray-600">{currentBar.name}</p>
        </div>
        
        {(hasPermission('canCreateManagers') || hasPermission('canCreateServers')) && (
          <button
            onClick={() => setShowAddUser(true)}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            <UserPlus size={20} />
            Ajouter un membre
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">Gérants</p>
              <p className="text-2xl font-bold">{managers.length}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-orange-600" />
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
                      <p className="font-medium text-gray-800">{member.user.name}</p>
                      <p className="text-sm text-gray-500">
                        {getRoleLabel(member.role)} • @{member.user.username}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {member.user.lastLoginAt && (
                      <span className="text-xs text-gray-400">
                        Dernière connexion: {new Date(member.user.lastLoginAt).toLocaleDateString()}
                      </span>
                    )}
                    
                    {member.role !== 'promoteur' && 
                     ((member.role === 'gerant' && hasPermission('canCreateManagers')) ||
                      (member.role === 'serveur' && hasPermission('canCreateServers'))) && (
                      <button
                        onClick={() => handleRemoveMember(member.id, member.user.name)}
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
                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rôle
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {hasPermission('canCreateManagers') && (
                      <button
                        type="button"
                        onClick={() => setSelectedRole('gerant')}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          selectedRole === 'gerant'
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <UserIcon className="w-5 h-5 mx-auto mb-1 text-orange-600" />
                        <span className="text-sm">Gérant</span>
                      </button>
                    )}
                    
                    {hasPermission('canCreateServers') && (
                      <button
                        type="button"
                        onClick={() => setSelectedRole('serveur')}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          selectedRole === 'serveur'
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Users className="w-5 h-5 mx-auto mb-1 text-amber-600" />
                        <span className="text-sm">Serveur</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Form Fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom d'utilisateur *
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="nom.prenom"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mot de passe temporaire *
                  </label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Minimum 4 caractères"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    L'utilisateur devra le changer à sa première connexion
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Prénom Nom"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="97000000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email (optionnel)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="email@exemple.com"
                  />
                </div>

                {/* Messages */}
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}
                
                {success && (
                  <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">
                    {success}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddUser(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Créer le compte
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}