import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, UserPlus, User as UserIcon, Trash2, GitBranch, Phone, Clock, Mail, Search, Eye, EyeOff, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from "../context/AuthContext";
import { useBarContext } from '../context/BarContext';
import { UserRole } from '../types';
import { AuthService } from '../services/supabase/auth.service';
import { useViewport } from '../hooks/useViewport';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Label } from '../components/ui/Label';
import { Alert } from '../components/ui/Alert';
import { ServerMappingsManager } from '../components/ServerMappingsManager';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { BarsService } from '../services/supabase/bars.service';
import { FEATURES } from '../config/features';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { OnboardingBreadcrumb } from '../components/onboarding/ui/OnboardingBreadcrumb';

/**
 * TeamManagementPage - Page de gestion de l'équipe
 * Route: /team
 * Refactoré de modale vers page
 */
export default function TeamManagementPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const isOnboardingMode = searchParams.get('mode') === 'onboarding';
  const onboardingTask = searchParams.get('task');

  const { hasPermission, currentSession } = useAuth();
  const { currentBar, barMembers, refreshBars } = useBarContext();
  const { isMobile } = useViewport();

  // Guide ID for team management
  const teamGuideId = 'manage-team';

  // States...
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('serveur');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New states for "Existing Member" feature
  // Modal states (renamed to avoid confusion if needed, but keeping for now)
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  // New Page Tab state
  const [pageTab, setPageTab] = useState<'members' | 'mappings' | 'add'>('members');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [existingEmail, setExistingEmail] = useState('');
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; email: string; role: string; sourceBarName: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Load candidates when switching to 'add' tab and 'existing' mode
  React.useEffect(() => {
    if (pageTab === 'add' && activeTab === 'existing' && currentBar) {
      loadCandidates();
    }
  }, [pageTab, activeTab, currentBar]);

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
        emailToUse = `${emailToUse} @bartender.app`;
      }

      const result = await BarsService.addMemberExisting(
        currentBar!.id,
        { userId: selectedCandidateId || undefined, email: emailToUse || undefined },
        selectedRole as 'gerant' | 'serveur',
        currentSession?.userId || '' // ✅ Pass current user ID for audit
      );

      if (result.success) {
        setSuccess(result.message || 'Membre ajouté avec succès !');
        await refreshBars();
        setTimeout(() => {
          setPageTab('members');
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

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!currentBar || !currentSession) return;

    if (!window.confirm(`Êtes-vous sûr de vouloir retirer ${memberName} de l'équipe ?`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      // Trouver le membre pour obtenir son userId
      const member = barMembers.find(m => m.id === memberId);
      if (!member || !member.userId) {
        setError('Membre introuvable');
        return;
      }

      const result = await BarsService.removeMember(
        currentBar.id,
        member.userId, // userId, pas memberId
        currentSession.userId // Qui fait la suppression
      );

      if (result.success) {
        setSuccess(`${memberName} a été retiré de l'équipe`);
        await refreshBars(); // Rafraîchir la liste des membres
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error || 'Erreur lors de la suppression');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression');
    }
  };

  if (!currentBar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Sélectionnez un bar pour gérer l'équipe</p>
      </div>
    );
  }

  // Filtrer les membres selon le toggle Inactif et la recherche
  const displayedMembers = barMembers.filter(member => {
    const matchesStatus = showInactive || member.isActive;
    const matchesSearch = searchTerm === '' ||
      (member.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.user?.username?.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  // Stats dynamiques basées sur le filtre "Afficher inactifs"
  // Si showInactive est ON, on compte tout le monde. Sinon, seulement les actifs.
  const statsSource = showInactive ? barMembers : barMembers.filter(m => m.isActive);

  const managersCount = statsSource.filter(m => m.role === 'gerant').length;
  const serversCount = statsSource.filter(m => m.role === 'serveur').length;

  const inactiveCount = barMembers.filter(m => !m.isActive).length;


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

      const newUser = await AuthService.signup(
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

      // ✨ AUTO-MAPPING: Si c'est un serveur, on crée/met à jour le mapping pour le Mode Simplifié
      if (selectedRole === 'serveur' && newUser?.id) {
        try {
          // On utilise le nom saisi pour faire le lien.
          // Si un mapping "Marc" existe déjà, il pointera désormais vers ce nouveau compte.
          // Sinon, on crée un nouveau mapping "Marc".
          await ServerMappingsService.upsertServerMapping(currentBar.id, name, newUser.id);
          console.log(`[TeamManagement] Auto-mapped server "${name}" to user ${newUser.id}`);
        } catch (mapErr) {
          console.warn('[TeamManagement] Auto-mapping failed (non-blocking):', mapErr);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      await refreshBars();

      const successMessage = selectedRole === 'gerant'
        ? `✅ Gérant "${name}" créé avec succès!\n📧 Email: ${generatedEmail} \n🔑 Mot de passe: ${password} \n\n⚠️ Communiquez ces identifiants au gérant.`
        : `✅ Serveur "${name}" créé avec succès!\n📧 Email: ${generatedEmail} \n🔑 Mot de passe: ${password} \n\n⚠️ Communiquez ces identifiants au serveur.`;

      setSuccess(successMessage);

      setUsername('');
      setPassword('');
      setName('');
      setPhone('');

      setTimeout(() => {
        setPageTab('members');
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
        errorMessage = `❌ ${err.message} `;
      }

      setError(errorMessage);
    }
  };


  return (
    <div className="max-w-7xl mx-auto">
      {isOnboardingMode && (
        <OnboardingBreadcrumb
          currentStep={
            onboardingTask === 'add-managers' ? 'Ajouter des Gérants' :
              onboardingTask === 'add-servers' ? 'Créer Comptes Serveurs' :
                'Configuration Équipe'
          }
          onBackToOnboarding={() => navigate('/onboarding')}
        />
      )}
      {/* Header avec Onglets */}
      <TabbedPageHeader
        title={isMobile ? 'Équipe' : "Gestion d'équipe"}
        subtitle="Configurez les accès, recrutez de nouveaux membres et organisez votre équipe de service."
        icon={<Users size={24} />}
        guideId={teamGuideId}
        hideSubtitleOnMobile={true}
        tabs={[
          { id: 'members', label: isMobile ? 'Équipe' : 'Mon Équipe', icon: Users },
          { id: 'add', label: isMobile ? 'Ajouter' : 'Recrutement', icon: UserPlus },
          ...(FEATURES.ENABLE_SWITCHING_MODE ? [{ id: 'mappings', label: isMobile ? 'Nom sur vente' : "Nom d'affichage sur vente", icon: GitBranch }] : [])
        ]}
        activeTab={pageTab}
        onTabChange={(id) => {
          setPageTab(id as 'members' | 'mappings' | 'add');
          setError('');
          setSuccess('');
        }}
      />

      {/* Content */}
      <div className="space-y-6">

        {pageTab === 'members' && (
          <>
            {/* Smart Toolbar for Members Tab */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
              {/* Search Input */}
              <div className="relative flex-grow w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher un membre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-2 text-sm rounded-md border border-gray-300 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)] w-full"
                  aria-label="Rechercher un membre de l'équipe"
                />
              </div>

              {/* Compact Stats Strip */}
              <div className="flex items-center gap-4 text-sm font-medium text-gray-600 w-full md:w-auto justify-between md:justify-start">
                <div className="flex items-center gap-1">
                  <UserIcon className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <span>Gérants: <span className="font-bold text-gray-800">{managersCount}</span></span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <span>Serveurs: <span className="font-bold text-gray-800">{serversCount}</span></span>
                </div>
                {inactiveCount > 0 && (
                  <Button
                    onClick={() => setShowInactive(!showInactive)}
                    variant="ghost"
                    size="sm"
                    className={`flex items-center gap-2 text-gray-600 hover:bg-gray-100 ${showInactive ? 'bg-gray-100 text-brand-dark' : ''}`}
                    title={showInactive ? "Masquer les inactifs" : "Inclure les inactifs"}
                    aria-label={showInactive ? "Masquer les membres inactifs" : "Afficher les membres inactifs"}
                  >
                    {showInactive ? <Eye size={16} className="text-brand-dark" /> : <EyeOff size={16} className="text-gray-400" />}
                    <span className="text-xs font-medium">
                      {showInactive ? 'Masquer inactifs' : `Inactifs (${inactiveCount})`}
                    </span>
                  </Button>
                )}
              </div>

              {/* Add Member Button - Moved to Smart Toolbar */}
              <div className="w-full md:w-auto mt-4 md:mt-0">
                <Button
                  onClick={() => setPageTab('add')}
                  className="w-full md:w-auto flex items-center justify-center gap-2 shadow-md shadow-brand-subtle transition-all active:scale-95"
                >
                  <UserPlus size={16} />
                  <span className="font-medium">Ajouter</span>
                </Button>
              </div>
            </div>

            {/* Members List - GRID VIEW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-guide="team-list">
              <AnimatePresence mode="popLayout">
                {displayedMembers.map((member, index) => {
                  const user = member.user;
                  const initials = user?.name
                    ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
                    : '??';

                  const isRecentLogin = user?.lastLoginAt && (new Date().getTime() - new Date(user.lastLoginAt).getTime() < 24 * 60 * 60 * 1000); // 24h

                  return (
                    <motion.div
                      key={member.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -20 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className={`group relative bg-white rounded-3xl p-6 border-2 transition-all hover:-translate-y-1 hover:shadow-xl ${!member.isActive
                        ? 'border-gray-100 bg-gray-50/50 opacity-75'
                        : 'border-gray-100 hover:border-brand-subtle shadow-sm'
                        }`}
                    >
                      {/* Status Dot */}
                      <div className="absolute top-6 left-6 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${member.isActive ? (isRecentLogin ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-300') : 'bg-red-400'}`}></span>
                        <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                          {!member.isActive ? 'Inactif' : (isRecentLogin ? 'Actif récemment' : 'Hors ligne')}
                        </span>
                      </div>

                      {/* Actions Menu (Top Right) */}
                      <div className="absolute top-5 right-5">
                        {member.isActive && member.role !== 'promoteur' && member.role !== 'super_admin' &&
                          ((member.role === 'gerant' && hasPermission('canCreateManagers')) ||
                            (member.role === 'serveur' && hasPermission('canCreateServers'))) && (
                            <button
                              onClick={() => member.user && handleRemoveMember(member.id, member.user.name)}
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="Retirer de l'équipe"
                              aria-label={`Retirer ${member.user?.name || 'ce membre'} de l'équipe`}
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                      </div>

                      {/* Avatar Section */}
                      <div className="mt-8 mb-6 flex flex-col items-center">
                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black mb-4 shadow-lg rotate-3 transition-transform group-hover:rotate-0 ${member.role === 'promoteur' ? 'bg-purple-100 text-purple-600' :
                          member.role === 'gerant' ? 'bg-brand-subtle text-brand-dark' :
                            'bg-blue-100 text-blue-600'
                          }`}
                          aria-hidden="true"
                        >
                          {initials}
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 leading-tight text-center px-2">{user?.name || 'Inconnu'}</h2>
                        <p className="text-sm font-medium text-gray-400 mb-2">@{user?.username || 'unknown'}</p>

                        {/* Role Badge */}
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${member.role === 'promoteur' ? 'bg-purple-100 text-purple-700' :
                          member.role === 'gerant' ? 'bg-brand-subtle text-brand-dark' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                          {getRoleLabel(member.role)}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="space-y-3 pt-6 border-t border-dashed border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                            <Phone size={14} className="text-gray-400" />
                          </div>
                          <span className="text-xs font-semibold text-gray-600">{user?.phone || 'Non renseigné'}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                            <Mail size={14} className="text-gray-400" />
                          </div>
                          <span className="text-xs font-semibold text-gray-600 truncate max-w-[180px]" title={user?.email}>
                            {user?.email || 'Pas d\'email'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                            <Clock size={14} className="text-gray-400" aria-hidden="true" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Dernière connexion</span>
                            <span className="text-xs font-bold text-gray-700">
                              {user?.lastLoginAt
                                ? new Date(user.lastLoginAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                : 'Jamais'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* ✨ NOUVEAU: Mappings de serveurs (Mode Simplifié) */}
        {pageTab === 'mappings' && FEATURES.ENABLE_SWITCHING_MODE && (
          <div className="bg-white rounded-xl shadow-sm border border-brand-subtle overflow-hidden" data-guide="team-mappings">
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
          </div>
        )}

        {/* ✨ NOUVEAU: Flux d'ajout de membre (Mode Focus) */}
        {pageTab === 'add' && (
          <motion.div
            key="add-member-flow"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* 📘 ONBOARDING / HELP PANEL */}
            <div className="bg-[var(--brand-bg-subtle)] border border-brand-subtle rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-amber-100/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-brand-subtle p-2 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-brand-dark" />
                  </div>
                  <p className="font-bold text-[var(--brand-text)]">Processus de recrutement</p>
                </div>
                {isInfoExpanded ? (
                  <ChevronDown className="w-5 h-5 text-brand-primary" />
                ) : (
                  <ChevronUp className="w-5 h-5 text-brand-primary" />
                )}
              </button>
              <AnimatePresence>
                {isInfoExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-5 pb-5 pt-1 border-t border-brand-subtle">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <span className="bg-brand-subtle text-brand-dark w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                          <p className="text-sm text-[var(--brand-text)]">Choisissez si vous créez un nouveau compte ou si vous réutilisez un membre existant.</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="bg-brand-subtle text-brand-dark w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                          <p className="text-sm text-[var(--brand-text)]">Attribuez le rôle (Gérant ou Serveur) selon les besoins du bar.</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="bg-brand-subtle text-brand-dark w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                          <p className="text-sm text-[var(--brand-text)]">Partagez les identifiants générés en toute sécurité avec le nouveau membre.</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Form */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
                  {/* Step 1: Mode Selection */}
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-800">1. Quel type d'ajout ?</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        onClick={() => setActiveTab('new')}
                        className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 text-center ${activeTab === 'new'
                          ? 'bg-brand-subtle border-brand-primary shadow-lg shadow-brand-subtle'
                          : 'bg-white border-gray-100 hover:border-brand-subtle'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeTab === 'new' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                          <UserIcon size={24} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">Nouveau Compte</p>
                          <p className="text-xs text-gray-500 mt-1">Créer des identifiants de zéro pour un nouvel employé</p>
                        </div>
                      </button>

                      <button
                        onClick={() => setActiveTab('existing')}
                        className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 text-center ${activeTab === 'existing'
                          ? 'bg-brand-subtle border-brand-primary shadow-lg shadow-brand-subtle'
                          : 'bg-white border-gray-100 hover:border-brand-subtle'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeTab === 'existing' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                          <UserPlus size={24} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">Membre Existant</p>
                          <p className="text-xs text-gray-500 mt-1">Importer un membre de votre équipe d'un autre bar</p>
                        </div>
                      </button>
                    </div>

                    <div className="h-px bg-gray-100 my-2" />

                    <div className="space-y-6">
                      <h3 className="text-lg font-bold text-gray-800">2. Détails & Rôle</h3>

                      {/* Common: Role Selection */}
                      <div className="space-y-3">
                        <Label className="font-bold text-gray-700">Rôle à attribuer</Label>
                        <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
                          {hasPermission('canCreateManagers') && (
                            <button
                              onClick={() => setSelectedRole('gerant')}
                              className={`flex-1 py-3 px-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${selectedRole === 'gerant'
                                ? 'btn-brand shadow-lg shadow-brand-subtle'
                                : 'text-gray-500 hover:bg-gray-100'}`}
                            >
                              Gérant
                            </button>
                          )}
                          {hasPermission('canCreateServers') && (
                            <button
                              onClick={() => setSelectedRole('serveur')}
                              className={`flex-1 py-3 px-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${selectedRole === 'serveur'
                                ? 'btn-brand shadow-lg shadow-brand-subtle'
                                : 'text-gray-500 hover:bg-gray-100'}`}
                            >
                              Serveur
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Form Content */}
                      <AnimatePresence mode="wait">
                        {activeTab === 'new' ? (
                          <motion.form
                            key="new-form"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                            onSubmit={handleAddUser}
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <Label htmlFor="username" className="font-bold text-gray-700">Identifiant de connexion *</Label>
                                <Input
                                  id="username"
                                  type="text"
                                  value={username}
                                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                                  placeholder="exemple: jean.dupont"
                                  className="h-12 bg-gray-50 border-gray-200 focus:bg-white"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="password" className="font-bold text-gray-700">Mot de passe temporaire *</Label>
                                <Input
                                  id="password"
                                  type="text"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  placeholder="Min. 8 caractères"
                                  className="h-12 bg-gray-50 border-gray-200 focus:bg-white"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="name" className="font-bold text-gray-700">Nom & Prénom *</Label>
                                <Input
                                  id="name"
                                  type="text"
                                  value={name}
                                  onChange={(e) => setName(e.target.value)}
                                  placeholder="Sandra KOFFI"
                                  className="h-12 bg-gray-50 border-gray-200 focus:bg-white text-lg font-medium"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="phone" className="font-bold text-gray-700">Téléphone *</Label>
                                <Input
                                  id="phone"
                                  type="tel"
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  placeholder="+229 00 00 00 00"
                                  className="h-12 bg-gray-50 border-gray-200 focus:bg-white"
                                />
                              </div>
                            </div>

                            <div className="pt-2">
                              <Button
                                type="submit"
                                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-subtle"
                              >
                                Créer le compte
                              </Button>
                            </div>
                          </motion.form>
                        ) : (
                          <motion.form
                            key="existing-form"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                            onSubmit={handleAddExistingUser}
                          >
                            <div className="space-y-2">
                              <Label className="font-bold text-gray-700">Importer de mon équipe (Autre Bar)</Label>
                              {loadingCandidates ? (
                                <div className="h-12 animate-pulse bg-gray-100 rounded-xl" />
                              ) : (
                                <Select
                                  value={selectedCandidateId}
                                  onChange={(e) => {
                                    setSelectedCandidateId(e.target.value);
                                    if (e.target.value) setExistingEmail('');
                                  }}
                                  placeholder="-- Sélectionnez un employé --"
                                  options={candidates.map(c => ({
                                    value: c.id,
                                    label: `${c.name} (${c.role} chez ${c.sourceBarName})`
                                  }))}
                                  className="h-12 border-gray-200 focus:border-[var(--brand-primary)]"
                                />
                              )}
                            </div>

                            <div className="flex items-center gap-4 my-2">
                              <div className="h-px bg-gray-100 flex-1" />
                              <span className="text-xs font-black text-gray-300 uppercase tracking-widest">OU</span>
                              <div className="h-px bg-gray-100 flex-1" />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="existing-email" className="font-bold text-gray-700">Rechercher par Email / Identifiant</Label>
                              <Input
                                id="existing-email"
                                type="text"
                                placeholder="exemple@mail.com ou login.membre"
                                value={existingEmail}
                                onChange={(e) => {
                                  setExistingEmail(e.target.value.trim());
                                  if (e.target.value) setSelectedCandidateId('');
                                }}
                                className="h-12 bg-gray-50 border-gray-200 focus:bg-white"
                              />
                            </div>

                            <div className="pt-2">
                              <Button
                                type="submit"
                                disabled={!selectedCandidateId && !existingEmail}
                                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-subtle"
                              >
                                Ajouter à l'équipe
                              </Button>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Internal Status Messages */}
                <AnimatePresence>
                  {(error || success) && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-4">
                      {error && <Alert show={!!error} variant="destructive" className="rounded-2xl shadow-lg border-red-200">{error}</Alert>}
                      {success && <Alert show={!!success} variant="success" className="rounded-2xl shadow-lg border-green-200 whitespace-pre-line">{success}</Alert>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right Column: Profile Preview Ticket */}
              <div className="lg:col-span-1">
                <div className="bg-[#FFF9E5] rounded-3xl p-6 border-2 border-dashed border-brand-primary/30 relative overflow-hidden h-full flex flex-col min-h-[400px]">
                  {/* Cutouts */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-50 rounded-full" />
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-50 rounded-full" />

                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 border border-brand-primary">
                      <UserIcon size={32} className="text-brand-primary" />
                    </div>
                    <h4 className="font-black text-brand-dark opacity-80 uppercase tracking-widest text-sm">Aperçu Profil</h4>
                  </div>

                  <div className="space-y-5 flex-1">
                    <div className="bg-white/50 p-4 rounded-2xl">
                      <p className="text-[10px] font-black text-brand-primary uppercase mb-1">Nom Complet</p>
                      <p className="font-black text-brand-dark text-lg leading-tight">{name || (selectedCandidateId ? candidates.find(c => c.id === selectedCandidateId)?.name : 'Nouveau Membre')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/50 p-4 rounded-2xl">
                        <p className="text-[10px] font-black text-brand-primary uppercase mb-1">Rôle</p>
                        <p className="font-black text-brand-dark uppercase text-xs">{selectedRole}</p>
                      </div>
                      <div className="bg-white/50 p-4 rounded-2xl">
                        <p className="text-[10px] font-black text-brand-primary uppercase mb-1">Identifiant</p>
                        <p className="font-black text-brand-dark text-xs truncate">{username || (existingEmail ? existingEmail.split('@')[0] : '---')}</p>
                      </div>
                    </div>

                    <div className="bg-[var(--brand-primary-dark)] text-white p-5 rounded-2xl shadow-xl text-center transition-colors duration-300">
                      <p className="text-[10px] font-black uppercase opacity-60 mb-2 tracking-widest leading-none">Accès Bar</p>
                      <p className="font-black text-base text-white">{currentBar.name}</p>
                    </div>

                    <div className="px-2 text-center pt-4">
                      <div className="flex items-center justify-center gap-2 text-brand-dark opacity-60 text-xs font-medium italic">
                        <Info size={14} />
                        <span>L'employé pourra se connecter dès validation</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <button
                      onClick={() => setPageTab('members')}
                      className="w-full py-3 text-brand-dark opacity-50 font-black text-xs uppercase hover:opacity-100 transition-all font-black text-xs uppercase hover:opacity-100 transition-all"
                    >
                      Abandonner
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </div >
  );
}
