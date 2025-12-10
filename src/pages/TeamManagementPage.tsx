import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Shield, User as UserIcon, X, Check, Trash2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from "../context/AuthContext";
import { useBarContext } from '../context/BarContext';
import { UserRole } from '../types';
import { AuthService } from '../services/supabase/auth.service';
import { useViewport } from '../hooks/useViewport';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Alert } from '../components/ui/Alert';
import { Modal } from '../components/ui/Modal';

/**
 * TeamManagementPage - Page de gestion de l'équipe
 * Route: /team
 * Refactoré de modale vers page
 */
export default function TeamManagementPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentBar, barMembers, removeBarMember, refreshBars } = useBarContext();
  const { isMobile } = useViewport();
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('serveur');

  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!currentBar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Sélectionnez un bar pour gérer l'équipe</p>
      </div>
    );
  }

  // Use barMembers directly from context
  const managers = barMembers.filter(m => m.role === 'gerant');
  const servers = barMembers.filter(m => m.role === 'serveur');

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return Shield;
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

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    try {
      const generatedEmail = username.includes('@')
        ? username
        : `${username}@bartender.app`;

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

      await new Promise(resolve => setTimeout(resolve, 200));
      await refreshBars();

      const successMessage = selectedRole === 'gerant'
        ? `✅ Gérant "${name}" créé avec succès !\n📧 Email: ${generatedEmail}\n🔑 Mot de passe: ${password}\n\n⚠️ Communiquez ces identifiants au gérant.`
        : `✅ Serveur "${name}" créé avec succès !\n📧 Email: ${generatedEmail}\n🔑 Mot de passe: ${password}\n\n⚠️ Communiquez ces identifiants au serveur.`;

      setSuccess(successMessage);

      setUsername('');
      setPassword('');
      setName('');
      setPhone('');

      setTimeout(() => {
        setShowAddUser(false);
        setSuccess('');
      }, 4000);

    } catch (err: any) {
      console.error('Error creating user:', err);
      let errorMessage = 'Erreur lors de la création de l\'utilisateur';

      if (err.message.includes('duplicate') || err.message.includes('already exists')) {
        errorMessage = '❌ Ce nom d\'utilisateur ou cet email existe déjà.';
      } else if (err.message.includes('Invalid login credentials')) {
        errorMessage = '❌ Identifiants invalides. Veuillez réessayer.';
      } else if (err.message.includes('Email not confirmed')) {
        errorMessage = '❌ L\'email n\'a pas été confirmé. Contactez l\'administrateur.';
      } else if (err.message.includes('permission')) {
        errorMessage = '❌ Vous n\'avez pas les permissions nécessaires.';
      } else if (err.message) {
        errorMessage = `❌ ${err.message}`;
      }

      setError(errorMessage);
    }
  };

  const handleRemoveMember = (memberId: string, userName: string) => {
    if (window.confirm(`Êtes-vous sûr de vouloir retirer ${userName} ?`)) {
      removeBarMember(memberId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate(-1)}
              variant="ghost"
              size="icon"
              className="rounded-lg transition-colors hover:bg-white/20"
            >
              <ArrowLeft size={24} />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Users className="text-white" size={24} />
              </div>
              <div>
                <h1 className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                  {isMobile ? 'Équipe' : 'Équipe du bar'}
                </h1>
                <p className={`text-amber-100 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  {currentBar.name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Action button */}
        {(hasPermission('canCreateManagers') || hasPermission('canCreateServers')) && (
          <div className="flex justify-end">
            <Button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 shadow-md"
            >
              <UserPlus size={20} className="mr-2" />
              Ajouter un membre
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100">
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

          <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100">
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

          <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100">
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
        <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Membres de l'équipe</h3>
          </div>

          <div className="divide-y divide-gray-100">
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
                        <span className="text-xs text-gray-400 hidden sm:inline">
                          Dernière connexion: {new Date(member.user.lastLoginAt).toLocaleDateString()}
                        </span>
                      )}

                      {member.role !== 'promoteur' && member.role !== 'super_admin' &&
                        ((member.role === 'gerant' && hasPermission('canCreateManagers')) ||
                          (member.role === 'serveur' && hasPermission('canCreateServers'))) && (
                          <Button
                            onClick={() => member.user && handleRemoveMember(member.id, member.user.name)}
                            variant="ghost"
                            size="icon"
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Retirer de l'équipe"
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add User Modal - Kept as internal modal for the form */}
        <Modal
          open={showAddUser}
          onClose={() => setShowAddUser(false)}
          title="Ajouter un membre"
          size="md"
          footer={
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={() => setShowAddUser(false)}
                variant="secondary"
                className="flex-1 text-sm"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                form="add-member-form"
                className="flex-1 text-sm font-medium"
              >
                Créer
              </Button>
            </div>
          }
        >
          <form id="add-member-form" onSubmit={handleAddUser} className="space-y-4">
            {/* Role Selection - Compact */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Rôle
              </label>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                {hasPermission('canCreateManagers') && (
                  <Button
                    type="button"
                    onClick={() => setSelectedRole('gerant')}
                    variant={selectedRole === 'gerant' ? 'default' : 'ghost'}
                    className="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
                  >
                    Gérant
                  </Button>
                )}
                {hasPermission('canCreateServers') && (
                  <Button
                    type="button"
                    onClick={() => setSelectedRole('serveur')}
                    variant={selectedRole === 'serveur' ? 'default' : 'ghost'}
                    className="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
                  >
                    Serveur
                  </Button>
                )}
              </div>
            </div>

            {/* Form Fields - Grid Layout */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="col-span-1">
                                  <Label htmlFor="username" className="text-xs">
                                    Nom d'utilisateur *
                                  </Label>
                                  <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                                    placeholder="nom.prenom"
                                    className="text-sm"
                                  />
                                </div>
            
                                <div className="col-span-1">
                                  <Label htmlFor="password" className="text-xs">
                                    Mot de passe *
                                  </Label>
                                  <Input
                                    id="password"
                                    type="text"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Min 8 chars"
                                    className="text-sm"
                                  />
                                </div>
            
                                <div className="col-span-1">
                                  <Label htmlFor="name" className="text-xs">
                                    Nom complet *
                                  </Label>
                                  <Input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Prénom Nom"
                                    className="text-sm"
                                  />
                                </div>
            
                                <div className="col-span-1">
                                  <Label htmlFor="phone" className="text-xs">
                                    Téléphone *
                                  </Label>
                                  <Input
                                    id="phone"
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="0197000000"
                                    className="text-sm"
                                  />
                                </div>
                              </div>
            {/* Messages */}
            {error && (
              <Alert show={!!error} variant="destructive" className="text-xs">
                {error}
              </Alert>
            )}

            {success && (
              <Alert show={!!success} variant="success" className="text-xs">
                {success}
              </Alert>
            )}
          </form>
        </Modal>
      </div>
    </div>
  );
}
