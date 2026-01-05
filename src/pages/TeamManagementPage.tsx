import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Shield, User as UserIcon, Check, Trash2, ArrowLeft, GitBranch, ChevronDown, ChevronUp } from 'lucide-react';
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
import { ServerMappingsManager } from '../components/ServerMappingsManager';
import { BarsService } from '../services/supabase/bars.service';
import { FEATURES } from '../config/features';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('serveur');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New states for "Existing Member" feature
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  const [existingEmail, setExistingEmail] = useState('');
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; email: string; role: string; sourceBarName: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showMappings, setShowMappings] = useState(false);

  // Load candidates when switching to 'existing' tab
  React.useEffect(() => {
    if (showAddUser && activeTab === 'existing' && currentBar) {
      loadCandidates();
    }
  }, [showAddUser, activeTab, currentBar]);

  const loadCandidates = async () => {
    if (!currentBar) return;
    setLoadingCandidates(true);
    try {
      const data = await BarsService.getStaffCandidates(currentBar.id);
      setCandidates(data);
    } catch (err) {
      console.error('Error loading candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleAddExistingUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedCandidateId && !existingEmail) {
      setError('Veuillez sélectionner un membre ou entrer un email');
      return;
    }

    try {
      // Auto-append domain if username is provided instead of email
      let emailToUse = existingEmail;
      if (emailToUse && !emailToUse.includes('@')) {
        emailToUse = `${emailToUse}@bartender.app`;
      }

      const result = await BarsService.addMemberExisting(
        currentBar!.id,
        { userId: selectedCandidateId || undefined, email: emailToUse || undefined },
        selectedRole as 'gerant' | 'serveur'
      );

      if (result.success) {
        setSuccess(result.message || 'Membre ajouté avec succès !');
        await refreshBars();
        setTimeout(() => {
          setShowAddUser(false);
          setSuccess('');
          setExistingEmail('');
          setSelectedCandidateId('');
        }, 2000);
      } else {
        setError(result.error || "Erreur lors de l'ajout");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!currentBar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Sélectionnez un bar pour gérer l'équipe</p>
      </div>
    );
  }

  // Filtrer les membres selon le toggle Inactif
  const displayedMembers = barMembers.filter(member => showInactive || member.isActive);

  // Stats sur TOUS les membres actifs uniquement pour les compteurs
  const activeMembers = barMembers.filter(m => m.isActive);
  const managersCount = activeMembers.filter(m => m.role === 'gerant').length;
  const serversCount = activeMembers.filter(m => m.role === 'serveur').length;
  const inactiveCount = barMembers.filter(m => !m.isActive).length;

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

  const handleRemoveMember = async (memberId: string, userName: string) => {
    if (window.confirm(`Êtes-vous sûr de vouloir retirer ${userName} ?`)) {
      try {
        const result = await removeBarMember(memberId);

        if (result.success) {
          import('react-hot-toast').then(({ default: toast }) => {
            toast.success(`✅ ${userName} a été retiré(e) de l'équipe`);
          });
        } else {
          import('react-hot-toast').then(({ default: toast }) => {
            toast.error(`❌ Erreur: ${result.error || 'Impossible de retirer le membre'}`);
          });
          console.error('[TeamManagement] Remove failed:', result.error);
        }
      } catch (error: any) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast.error('❌ Une erreur est survenue lors du retrait du membre');
        });
        console.error('[TeamManagement] Remove error:', error);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
          <div className="flex items-center justify-between">
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

            {/* Action buttons in header */}
            <div className="flex items-center gap-2">
              {inactiveCount > 0 && (
                <Button
                  onClick={() => setShowInactive(!showInactive)}
                  variant="ghost"
                  className={`flex items-center gap-2 text-white hover:bg-white/20 ${showInactive ? 'bg-white/20' : ''}`}
                  title={showInactive ? "Masquer les inactifs" : "Afficher les inactifs"}
                >
                  <Users size={18} className="text-white" />
                  {isMobile ? (showInactive ? 'Actifs' : 'Tous') : (showInactive ? 'Masquer inactifs' : `Voir inactifs (${inactiveCount})`)}
                </Button>
              )}

              {(hasPermission('canCreateManagers') || hasPermission('canCreateServers')) && (
                <Button
                  onClick={() => setShowAddUser(true)}
                  variant="default"
                  size={isMobile ? 'icon' : 'default'}
                  className="flex items-center gap-2"
                  title="Ajouter un membre"
                >
                  {isMobile ? (
                    <UserPlus size={18} />
                  ) : (
                    'Ajouter un membre'
                  )}
                </Button>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600">Gérants</p>
                <p className="text-2xl font-bold">{managersCount}</p>
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
                <p className="text-2xl font-bold">{serversCount}</p>
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
                <p className="text-2xl font-bold">{activeMembers.length}</p>
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
            {displayedMembers.map(member => {
              const Icon = getRoleIcon(member.role);
              const colorClass = getRoleColor(member.role);

              return (
                <div key={member.id} className={`p-4 hover:bg-gray-50 transition-colors ${!member.isActive ? 'opacity-70 bg-gray-50/50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-800">{member.user?.name || 'Utilisateur inconnu'}</p>
                          {!member.isActive && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-200 text-gray-600 rounded uppercase tracking-wider">
                              Inactif
                            </span>
                          )}
                          {member.role === 'promoteur' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded uppercase tracking-wider border border-purple-200">
                              Propriétaire
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {getRoleLabel(member.role)} • @{member.user?.username || 'unknown'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {member.user?.lastLoginAt && (
                        <span className="text-xs text-gray-600 hidden sm:inline">
                          Dernière connexion: {new Date(member.user.lastLoginAt).toLocaleDateString()}
                        </span>
                      )}

                      {member.isActive && member.role !== 'promoteur' && member.role !== 'super_admin' &&
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

        {/* ✨ NOUVEAU: Mappings de serveurs (Mode Simplifié) */}
        {FEATURES.ENABLE_SWITCHING_MODE && (
          <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
            <button
              onClick={() => setShowMappings(!showMappings)}
              className="w-full p-6 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <GitBranch size={20} className="text-amber-500" />
                <div className="text-left">
                  <h3 className="font-semibold text-gray-800">Mappings Serveurs (Mode Simplifié)</h3>
                  <p className="text-xs text-gray-500">Associez des noms de serveurs (ex: "Afi") à des comptes réels.</p>
                </div>
              </div>
              {showMappings ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
            </button>

            {showMappings && (
              <div className="p-6">
                <ServerMappingsManager
                  barId={currentBar.id}
                  barMembers={barMembers
                    .filter(m => m.isActive)
                    .map(m => ({
                      userId: m.userId,
                      name: m.user?.name || 'Inconnu',
                      role: m.role
                    }))
                  }
                  enabled={FEATURES.SHOW_SWITCHING_MODE_UI}
                />
              </div>
            )}
          </div>
        )}



        {/* Add User Modal - Kept as internal modal for the form */}
        <Modal
          open={showAddUser}
          onClose={() => setShowAddUser(false)}
          title="Ajouter un membre"
          size="lg"
          footer={null} // Footer handling inside for tabs
        >
          {/* Tabs Navigation */}
          <div className="flex border-b mb-4">
            <button
              className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'new' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('new')}
            >
              Nouveau Compte
            </button>
            <button
              className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'existing' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('existing')}
            >
              Membre Existant / Import
            </button>
          </div>

          {/* Role Selection (Common) */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Rôle à attribuer
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

          {/* Tab Content: Existing User */}
          {activeTab === 'existing' && (
            <form onSubmit={handleAddExistingUser} className="space-y-4">
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-4">
                <p className="text-xs text-amber-800">
                  💡 Importez rapidement vos employés d'autres bars ou ajoutez quelqu'un par email.
                </p>
              </div>

              {/* Candidate Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Importer de mon équipe (Autre Bar)
                </label>
                {loadingCandidates ? (
                  <p className="text-xs text-gray-500">Chargement...</p>
                ) : (
                  <select
                    className="w-full text-sm border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500"
                    value={selectedCandidateId}
                    onChange={(e) => {
                      setSelectedCandidateId(e.target.value);
                      if (e.target.value) setExistingEmail(''); // Clear email if selecting
                    }}
                  >
                    <option value="">-- Sélectionner un employé --</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role} chez {c.sourceBarName})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="text-center text-xs text-gray-400 font-medium my-2">- OU -</div>

              {/* Email/Username Input */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ajouter par Email ou Nom d'utilisateur
                </label>
                <Input
                  type="text"
                  placeholder="email@exemple.com ou nom.utilisateur"
                  value={existingEmail}
                  onChange={(e) => {
                    setExistingEmail(e.target.value.trim()); // Trim spaces
                    if (e.target.value) setSelectedCandidateId('');
                  }}
                  className="text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  💡 Si vous entrez un nom d'utilisateur (ex: "toto"), nous chercherons "toto@bartender.app".
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" onClick={() => setShowAddUser(false)} variant="secondary" className="flex-1">
                  Annuler
                </Button>
                <Button type="submit" disabled={!selectedCandidateId && !existingEmail} className="flex-1">
                  Ajouter
                </Button>
              </div>
            </form>
          )}

          {/* Tab Content: New User (Existing Form) */}
          {activeTab === 'new' && (
            <form id="add-member-form" onSubmit={handleAddUser} className="space-y-4">
              {/* Copied Grid Layout from original but removing Role (already atop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-1">
                  <Label htmlFor="username" className="text-xs">Nom d'utilisateur *</Label>
                  <Input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="nom.prenom" className="text-sm" />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="password" className="text-xs">Mot de passe *</Label>
                  <Input id="password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" className="text-sm" />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="name" className="text-xs">Nom complet *</Label>
                  <Input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" className="text-sm" />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="phone" className="text-xs"> Téléphone *</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0197000000" className="text-sm" />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" onClick={() => setShowAddUser(false)} variant="secondary" className="flex-1"> Annuler </Button>
                <Button type="submit" className="flex-1"> Créer </Button>
              </div>
            </form>
          )}

          {/* Status Messages (Common) */}
          <div className="mt-4">
            {error && <Alert show={!!error} variant="destructive" className="text-xs">{error}</Alert>}
            {success && <Alert show={!!success} variant="success" className="text-xs whitespace-pre-line">{success}</Alert>}
          </div>

        </Modal>
      </div>
    </div>
  );
}
