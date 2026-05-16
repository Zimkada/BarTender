import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, UserPlus, User as UserIcon, Trash2, GitBranch, Phone, Clock, Mail, Search, Eye, EyeOff, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from "../context/AuthContext";
import { useBarContext } from '../context/BarContext';
import { barMembersKeys } from '../hooks/queries/useBarMembers';
import { UserRole } from '../types';
import { AuthService } from '../services/supabase/auth.service';
import { useViewport } from '../hooks/useViewport';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Label } from '../components/ui/Label';
import { Alert } from '../components/ui/Alert';
import { ConfirmModal } from '../components/ui/Modal';
import { RoleSwitcher } from '../components/ui/RoleSwitcher';
import { ToastContainer } from '../components/ui/Toast';
import { ServerMappingsManager } from '../components/ServerMappingsManager';
import { useToast } from '../hooks/useToast';
import { useRobustOperation } from '../hooks/useRobustOperation';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { BarsService } from '../services/supabase/bars.service';
import { getErrorMessage } from '../utils/errorHandler';
import { FEATURES } from '../config/features';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { OnboardingBreadcrumb } from '../components/onboarding/ui/OnboardingBreadcrumb';
import { usePlan } from '../hooks/usePlan';

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
  const { currentBar, barMembers, refreshBars, removeBarMember, refreshMembers } = useBarContext();
  const { isMobile } = useViewport();
  const queryClient = useQueryClient();
  const { toasts, removeToast, loading, success, error, warning } = useToast();
  // Ref toujours à jour : évite la closure périmée sur robustOp.timeoutWarning
  // (robustOp est capturé au début du handler, l'état interne n'est pas encore re-rendu après await)
  const lastOpTimedOutRef = useRef(false);
  const robustOp = useRobustOperation({
    timeoutMs: 5000,
    maxRetries: 2,
    onTimeout: () => { lastOpTimedOutRef.current = true; },
    // P1: réconciliation UI si le backend réussit après expiration du timeout
    // (ex: changement de rôle ou suppression commitée côté serveur mais UI en état d'erreur)
    onLateSuccess: () => {
      if (currentBar) {
        refreshMembers(currentBar.id, true);
        queryClient.invalidateQueries({ queryKey: barMembersKeys.list(currentBar.id) });
      }
    },
  });

  // 🛡️ Plan: vérification limite membres
  const { canAddMember, memberLimitMessage, plan } = usePlan();

  // Guide ID for team management
  const teamGuideId = 'manage-team';

  // States...
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('serveur');
  const [showInactive, setShowInactive] = useState(false);
  const [formError, setError] = useState('');
  const [formSuccess, setSuccess] = useState('');

  // Confirmation & Notification States
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: 'removeUser' | 'changeRole' | null;
    targetMember: typeof barMembers[number] | null;
    newRole?: UserRole;
    isLoading: boolean;
  }>({
    open: false,
    title: '',
    description: '',
    action: null,
    targetMember: null,
    newRole: undefined,
    isLoading: false,
  });

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
  // isMounted guard: prevents state update on unmounted component
  React.useEffect(() => {
    if (pageTab !== 'add' || activeTab !== 'existing' || !currentBar) return;

    let isMounted = true;
    setLoadingCandidates(true);

    BarsService.getStaffCandidates(currentBar.id)
      .then(data => { if (isMounted) setCandidates(data); })
      .catch(err => { if (isMounted) console.error('Error loading candidates:', getErrorMessage(err)); })
      .finally(() => { if (isMounted) setLoadingCandidates(false); });

    return () => { isMounted = false; };
  }, [pageTab, activeTab, currentBar?.id]);

  const handleAddExistingUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 🛡️ Plan: vérification limite membres
    if (!canAddMember) {
      setError(memberLimitMessage || 'Limite de membres atteinte pour ce plan.');
      return;
    }

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
        selectedRole as 'gerant' | 'serveur',
        currentSession?.userId || '' // ✅ Pass current user ID for audit
      );

      if (result.success) {
        setSuccess(result.message || 'Membre ajouté avec succès !');
        await refreshBars();
        queryClient.invalidateQueries({ queryKey: barMembersKeys.list(currentBar!.id) });
        setTimeout(() => {
          setPageTab('members');
          setSuccess('');
          setExistingEmail('');
          setSelectedCandidateId('');
        }, 2000);
      } else {
        setError(result.error || "Erreur lors de l'ajout");
      }
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  const handleRemoveMember = (member: typeof barMembers[number]) => {
    if (!currentBar || !currentSession) return;
    setError('');
    setSuccess('');
    setConfirmModal({
      open: true,
      title: `Retirer ${member.user?.name}`,
      description: `Êtes-vous sûr de vouloir retirer ${member.user?.name} de l'équipe ? Cette action ne peut pas être annulée.`,
      action: 'removeUser',
      targetMember: member,
      isLoading: false,
    });
  };

  const handleConfirmRemoveMember = async () => {
    if (!currentBar || !currentSession || !confirmModal.targetMember) return;

    lastOpTimedOutRef.current = false;
    setConfirmModal(prev => ({ ...prev, isLoading: true }));
    const toastId = loading('Suppression du membre en cours...');

    try {
      const result = await robustOp.executeAsync(() =>
        removeBarMember(confirmModal.targetMember!.id)
      );

      if (!result?.success) {
        if (lastOpTimedOutRef.current) {
          warning('Connexion lente. Veuillez vérifier votre connexion.', 5000);
        } else {
          error(result?.error || 'Erreur lors de la suppression');
        }
        setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }));
        removeToast(toastId);
        return;
      }

      removeToast(toastId);
      success(`${confirmModal.targetMember.user?.name} a été retiré de l'équipe`);
      await refreshBars();
      queryClient.invalidateQueries({ queryKey: barMembersKeys.list(currentBar.id) });
      setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }));
      robustOp.reset();
    } catch (err) {
      removeToast(toastId);
      error(getErrorMessage(err));
      setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }));
    }
  };

  const handleChangeRole = (member: typeof barMembers[number], newRole: 'gerant' | 'serveur') => {
    if (!currentBar || !currentSession || member.role === newRole) return;

    const roleLabel = getRoleLabel(newRole);
    setError('');
    setSuccess('');
    setConfirmModal({
      open: true,
      title: `Changer le rôle`,
      description: `Êtes-vous sûr de vouloir changer le rôle de ${member.user?.name} en ${roleLabel} ?`,
      action: 'changeRole',
      targetMember: member,
      newRole: newRole as UserRole,
      isLoading: false,
    });
  };

  const handleConfirmChangeRole = async () => {
    if (!currentBar || !currentSession || !confirmModal.targetMember || !confirmModal.newRole) return;

    lastOpTimedOutRef.current = false;
    setConfirmModal(prev => ({ ...prev, isLoading: true }));
    const roleLabel = getRoleLabel(confirmModal.newRole);
    const toastId = loading(`Changement du rôle en ${roleLabel}...`);

    try {
      const result = await robustOp.executeAsync(() =>
        BarsService.addMember(
          currentBar.id,
          confirmModal.targetMember!.userId,
          confirmModal.newRole!,
          currentSession.userId
        )
      );

      if (!result?.success) {
        if (lastOpTimedOutRef.current) {
          warning('Connexion lente. Réessayez?', 5000);
        } else {
          error(result?.error || 'Erreur lors du changement de rôle');
        }
        setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }));
        removeToast(toastId);
        return;
      }

      removeToast(toastId);
      success(`Le rôle de ${confirmModal.targetMember.user?.name} a été mis à jour en ${roleLabel}`);
      await refreshMembers(currentBar.id, true);
      queryClient.invalidateQueries({ queryKey: barMembersKeys.list(currentBar.id) });
      setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }));
      robustOp.reset();
    } catch (err) {
      removeToast(toastId);
      error(getErrorMessage(err));
      setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }));
    }
  };

  if (!currentBar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Sélectionnez un bar pour gérer l'équipe</p>
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

    // 🛡️ Plan: vérification limite membres
    if (!canAddMember) {
      setError(memberLimitMessage || 'Limite de membres atteinte pour ce plan.');
      return;
    }

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
      await refreshMembers(currentBar.id);

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

    } catch (error) {
      console.error('Error creating user:', error);
      const errMsg = getErrorMessage(error);
      let errorMessage = 'Erreur lors de la création de l\'utilisateur';

      if (errMsg.includes('duplicate') || errMsg.includes('already exists')) {
        errorMessage = '❌ Ce nom d\'utilisateur ou cet email existe déjà.';
      } else if (errMsg.includes('Invalid login credentials')) {
        errorMessage = '❌ Identifiants invalides. Veuillez réessayer.';
      } else if (errMsg.includes('Email not confirmed')) {
        errorMessage = '❌ L\'email n\'a pas été confirmé. Contactez l\'administrateur.';
      } else if (errMsg.includes('permission')) {
        errorMessage = '❌ Vous n\'avez pas les permissions nécessaires.';
      } else if (errMsg) {
        errorMessage = `❌ ${errMsg}`;
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

        {/* Global Status Messages - Visible across all tabs */}
        <AnimatePresence>
          {(formError || formSuccess) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="px-1"
            >
              {formError && (
                <Alert
                  show={!!formError}
                  variant="destructive"
                  className="rounded-2xl shadow-md border-red-100 mb-2"
                >
                  {formError}
                </Alert>
              )}
              {formSuccess && (
                <Alert
                  show={!!formSuccess}
                  variant="success"
                  className="rounded-2xl shadow-md border-green-100 whitespace-pre-line mb-2"
                >
                  {formSuccess}
                </Alert>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {pageTab === 'members' && (
          <>
            {/* Smart Toolbar for Members Tab */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-card rounded-xl shadow-sm border border-border">
              {/* Search Input */}
              <div className="relative flex-grow w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  type="text"
                  placeholder="Rechercher un membre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-2 text-body-sm rounded-xl border border-border focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)] w-full"
                  aria-label="Rechercher un membre de l'équipe"
                />
              </div>

              {/* Compact Stats Strip */}
              <div className="flex items-center gap-4 text-caption text-muted-foreground w-full md:w-auto justify-between md:justify-start">
                <div className="flex items-center gap-1.5">
                  <UserIcon className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <span>Gérants : <span className="font-semibold text-foreground/80 tabular-nums">{managersCount}</span></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <span>Serveurs : <span className="font-semibold text-foreground/80 tabular-nums">{serversCount}</span></span>
                </div>
                {inactiveCount > 0 && (
                  <Button
                    onClick={() => setShowInactive(!showInactive)}
                    variant="ghost"
                    size="sm"
                    className={`flex items-center gap-2 text-muted-foreground hover:bg-muted ${showInactive ? 'bg-muted text-brand-primary' : ''}`}
                    title={showInactive ? "Masquer les inactifs" : "Inclure les inactifs"}
                    aria-label={showInactive ? "Masquer les membres inactifs" : "Afficher les membres inactifs"}
                  >
                    {showInactive ? <Eye size={15} className="text-brand-primary" /> : <EyeOff size={15} className="text-muted-foreground" />}
                    <span className="text-caption font-medium">
                      {showInactive ? 'Masquer inactifs' : `Inactifs (${inactiveCount})`}
                    </span>
                  </Button>
                )}
              </div>

              {/* Add Member Button */}
              <div className="w-full md:w-auto">
                <Button
                  onClick={() => setPageTab('add')}
                  className="w-full md:w-auto flex items-center justify-center gap-2"
                >
                  <UserPlus size={15} />
                  <span>Ajouter</span>
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
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.03 }}
                      className={`group relative bg-card rounded-2xl p-5 border transition-all hover:shadow-md ${!member.isActive
                        ? 'border-border bg-muted/50 opacity-70'
                        : 'border-border shadow-sm'
                        }`}
                    >
                      {/* Status Dot */}
                      <div className="absolute top-5 left-5 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${member.isActive ? (isRecentLogin ? 'bg-green-500' : 'bg-muted-foreground/40') : 'bg-red-400'}`}></span>
                        <span className="text-micro text-muted-foreground">
                          {!member.isActive ? 'Inactif' : (isRecentLogin ? 'Actif récemment' : 'Hors ligne')}
                        </span>
                      </div>

                      {/* Actions Menu (Top Right) */}
                      <div className="absolute top-4 right-4">
                        {member.isActive && member.role !== 'promoteur' && member.role !== 'super_admin' &&
                          ((member.role === 'gerant' && hasPermission('canCreateManagers')) ||
                            (member.role === 'serveur' && hasPermission('canCreateServers'))) && (
                            <button
                              onClick={() => handleRemoveMember(member)}
                              className="p-2 text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all"
                              title="Retirer de l'équipe"
                              aria-label={`Retirer ${member.user?.name || 'ce membre'} de l'équipe`}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                      </div>

                      {/* Avatar Section */}
                      <div className="mt-7 mb-5 flex flex-col items-center">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-h3 font-semibold mb-3 ${member.role === 'promoteur' ? 'bg-brand-subtle text-brand-primary' :
                          member.role === 'gerant' ? 'bg-brand-subtle text-brand-dark' :
                            'bg-muted text-muted-foreground'
                          }`}
                          aria-hidden="true"
                        >
                          {initials}
                        </div>
                        <h2 className="text-body font-semibold text-foreground leading-tight text-center px-2">{user?.name || 'Inconnu'}</h2>
                        <p className="text-caption text-muted-foreground mb-2">@{user?.username || 'unknown'}</p>

                        {/* Role Badge + interactive role switch */}
                        {member.isActive && member.role !== 'promoteur' && member.role !== 'super_admin' && hasPermission('canCreateManagers') ? (
                          <RoleSwitcher
                            value={member.role as UserRole}
                            onChange={(newRole) => handleChangeRole(member, newRole as 'gerant' | 'serveur')}
                            disabled={confirmModal.isLoading}
                            isLoading={confirmModal.isLoading && confirmModal.targetMember?.id === member.id}
                            availableRoles={['serveur', 'gerant']}
                            showLabel={false}
                          />
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-micro font-semibold ${member.role === 'promoteur' ? 'bg-brand-subtle text-brand-primary' :
                            member.role === 'gerant' ? 'bg-brand-subtle text-brand-dark' :
                              'bg-muted text-foreground/70'
                            }`}>
                            {getRoleLabel(member.role)}
                          </span>
                        )}
                      </div>

                      {/* Details Grid */}
                      <div className="space-y-2.5 pt-4 border-t border-dashed border-border">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Phone size={13} className="text-muted-foreground" />
                          </div>
                          <span className="text-caption text-foreground/70">{user?.phone || 'Non renseigné'}</span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Mail size={13} className="text-muted-foreground" />
                          </div>
                          <span className="text-caption text-foreground/70 truncate max-w-[180px]" title={user?.email}>
                            {user?.email || 'Pas d\'email'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Clock size={13} className="text-muted-foreground" aria-hidden="true" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-micro text-muted-foreground">Dernière connexion</span>
                            <span className="text-caption font-medium text-foreground/80">
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
          <div className="bg-card rounded-xl shadow-sm border border-brand-subtle overflow-hidden" data-guide="team-mappings">
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
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
                    <AlertTriangle className="w-4 h-4 text-brand-primary" />
                  </div>
                  <p className="text-body-sm font-semibold text-foreground">Processus de recrutement</p>
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
                          <span className="bg-brand-subtle text-brand-primary w-6 h-6 rounded-full flex items-center justify-center text-micro font-semibold shrink-0 mt-0.5">1</span>
                          <p className="text-body-sm text-foreground/70">Choisissez si vous créez un nouveau compte ou si vous réutilisez un membre existant.</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="bg-brand-subtle text-brand-primary w-6 h-6 rounded-full flex items-center justify-center text-micro font-semibold shrink-0 mt-0.5">2</span>
                          <p className="text-body-sm text-foreground/70">Attribuez le rôle (Gérant ou Serveur) selon les besoins du bar.</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="bg-brand-subtle text-brand-primary w-6 h-6 rounded-full flex items-center justify-center text-micro font-semibold shrink-0 mt-0.5">3</span>
                          <p className="text-body-sm text-foreground/70">Partagez les identifiants générés en toute sécurité avec le nouveau membre.</p>
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
                <div className="bg-card rounded-3xl p-6 md:p-8 border border-border shadow-sm">
                  {/* Step 1: Mode Selection */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-h3 text-foreground">1. Type d'ajout</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => setActiveTab('new')}
                        className={`p-5 rounded-xl border transition-all flex flex-col items-center gap-2.5 text-center ${activeTab === 'new'
                          ? 'bg-brand-subtle border-brand-primary shadow-sm'
                          : 'bg-card border-border hover:border-brand-subtle'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeTab === 'new' ? 'bg-brand-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                          <UserIcon size={20} />
                        </div>
                        <div>
                          <p className="text-body-sm font-semibold text-foreground">Nouveau compte</p>
                          <p className="text-caption text-muted-foreground mt-0.5">Créer des identifiants pour un nouvel employé</p>
                        </div>
                      </button>

                      <button
                        onClick={() => setActiveTab('existing')}
                        className={`p-5 rounded-xl border transition-all flex flex-col items-center gap-2.5 text-center ${activeTab === 'existing'
                          ? 'bg-brand-subtle border-brand-primary shadow-sm'
                          : 'bg-card border-border hover:border-brand-subtle'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeTab === 'existing' ? 'bg-brand-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                          <UserPlus size={20} />
                        </div>
                        <div>
                          <p className="text-body-sm font-semibold text-foreground">Membre existant</p>
                          <p className="text-caption text-muted-foreground mt-0.5">Importer un membre d'un autre bar</p>
                        </div>
                      </button>
                    </div>

                    <div className="h-px bg-muted" />

                    <div className="space-y-5">
                      <h3 className="text-h3 text-foreground">2. Détails & rôle</h3>

                      {/* Role segmented control */}
                      <div className="space-y-2">
                        <Label className="text-caption font-medium text-muted-foreground">Rôle à attribuer</Label>
                        <div className="flex bg-muted p-0.5 rounded-full border border-border" role="radiogroup" aria-label="Rôle">
                          {hasPermission('canCreateManagers') && (
                            <button
                              role="radio"
                              aria-checked={selectedRole === 'gerant'}
                              onClick={() => setSelectedRole('gerant')}
                              className={`flex-1 py-2 px-4 rounded-full text-body-sm font-medium transition-all ${selectedRole === 'gerant'
                                ? 'bg-card text-brand-primary shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground/80'}`}
                            >
                              Gérant
                            </button>
                          )}
                          {hasPermission('canCreateServers') && (
                            <button
                              role="radio"
                              aria-checked={selectedRole === 'serveur'}
                              onClick={() => setSelectedRole('serveur')}
                              className={`flex-1 py-2 px-4 rounded-full text-body-sm font-medium transition-all ${selectedRole === 'serveur'
                                ? 'bg-card text-brand-primary shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground/80'}`}
                            >
                              Serveur
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 🛡️ Alerte limite plan */}
                      {!canAddMember && (
                        <Alert variant="warning" className="mb-4">
                          {memberLimitMessage} — Plan actuel : <strong>{plan.label}</strong>
                        </Alert>
                      )}

                      {/* Form Content */}
                      <AnimatePresence mode="wait">
                        {activeTab === 'new' ? (
                          <motion.form
                            key="new-form"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-5"
                            onSubmit={handleAddUser}
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label htmlFor="username" className="text-caption font-medium text-muted-foreground">Identifiant de connexion *</Label>
                                <Input
                                  id="username"
                                  type="text"
                                  value={username}
                                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                                  placeholder="exemple: sandra.koffi"
                                  className="h-11 bg-muted border-border focus:bg-card"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-caption font-medium text-muted-foreground">Mot de passe temporaire *</Label>
                                <Input
                                  id="password"
                                  type="text"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  placeholder="Min. 8 caractères"
                                  className="h-11 bg-muted border-border focus:bg-card"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-caption font-medium text-muted-foreground">Nom & prénom *</Label>
                                <Input
                                  id="name"
                                  type="text"
                                  value={name}
                                  onChange={(e) => setName(e.target.value)}
                                  placeholder="Sandra KOFFI"
                                  className="h-11 bg-muted border-border focus:bg-card"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="phone" className="text-caption font-medium text-muted-foreground">Téléphone *</Label>
                                <Input
                                  id="phone"
                                  type="tel"
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  placeholder="+229 00 00 00 00"
                                  className="h-11 bg-muted border-border focus:bg-card"
                                />
                              </div>
                            </div>

                            <div className="pt-1">
                              <Button
                                type="submit"
                                className="w-full h-11 rounded-xl font-semibold"
                              >
                                Créer le compte
                              </Button>
                            </div>
                          </motion.form>
                        ) : (
                          <motion.form
                            key="existing-form"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-5"
                            onSubmit={handleAddExistingUser}
                          >
                            <div className="space-y-1.5">
                              <Label className="text-caption font-medium text-muted-foreground">Importer depuis un autre bar</Label>
                              {loadingCandidates ? (
                                <div className="h-11 animate-pulse bg-muted rounded-xl" />
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
                                  className="h-11 border-border focus:border-[var(--brand-primary)]"
                                />
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="h-px bg-muted flex-1" />
                              <span className="text-caption text-muted-foreground">ou</span>
                              <div className="h-px bg-muted flex-1" />
                            </div>

                            <div className="space-y-1.5">
                              <Label htmlFor="existing-email" className="text-caption font-medium text-muted-foreground">Rechercher par email / identifiant</Label>
                              <Input
                                id="existing-email"
                                type="text"
                                placeholder="exemple@mail.com ou login.membre"
                                value={existingEmail}
                                onChange={(e) => {
                                  setExistingEmail(e.target.value.trim());
                                  if (e.target.value) setSelectedCandidateId('');
                                }}
                                className="h-11 bg-muted border-border focus:bg-card"
                              />
                            </div>

                            <div className="pt-1">
                              <Button
                                type="submit"
                                disabled={!selectedCandidateId && !existingEmail}
                                className="w-full h-11 rounded-xl font-semibold"
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

                {/* Preview is self-contained */}
              </div>

              {/* Right Column: Profile Preview */}
              <div className="lg:col-span-1">
                <div className="bg-brand-subtle/50 rounded-2xl p-5 border border-dashed border-brand-primary/25 relative overflow-hidden h-full flex flex-col min-h-[360px]">
                  {/* Cutouts */}
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-7 h-7 bg-muted rounded-full" />
                  <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-7 h-7 bg-muted rounded-full" />

                  <div className="text-center mb-5">
                    <div className="w-12 h-12 bg-card rounded-xl shadow-sm flex items-center justify-center mx-auto mb-3 border border-brand-primary/20">
                      <UserIcon size={22} className="text-brand-primary" />
                    </div>
                    <p className="text-micro text-brand-primary font-semibold">Aperçu profil</p>
                  </div>

                  <div className="space-y-3 flex-1">
                    <div className="bg-card/60 p-3 rounded-xl">
                      <p className="text-micro text-brand-primary mb-1">Nom complet</p>
                      <p className="text-body-sm font-semibold text-foreground leading-tight">{name || (selectedCandidateId ? candidates.find(c => c.id === selectedCandidateId)?.name : 'Nouveau membre')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-card/60 p-3 rounded-xl">
                        <p className="text-micro text-brand-primary mb-1">Rôle</p>
                        <p className="text-caption font-semibold text-foreground/80">{selectedRole === 'gerant' ? 'Gérant' : 'Serveur'}</p>
                      </div>
                      <div className="bg-card/60 p-3 rounded-xl">
                        <p className="text-micro text-brand-primary mb-1">Identifiant</p>
                        <p className="text-caption font-medium text-foreground/80 truncate">{username || (existingEmail ? existingEmail.split('@')[0] : '---')}</p>
                      </div>
                    </div>

                    <div className="bg-brand-primary text-white p-4 rounded-xl text-center">
                      <p className="text-micro opacity-70 mb-1">Accès bar</p>
                      <p className="text-body-sm font-semibold">{currentBar.name}</p>
                    </div>

                    <div className="text-center pt-2">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                        <Info size={13} />
                        <span className="text-caption">Connexion possible dès validation</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <button
                      onClick={() => setPageTab('members')}
                      className="w-full py-2.5 text-caption text-muted-foreground hover:text-foreground/70 font-medium transition-colors"
                    >
                      Abandonner
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Success Alert */}
        {formSuccess && (
          <Alert variant="success" show={!!formSuccess} title="Succès">
            {formSuccess}
          </Alert>
        )}

        {/* Error Alert */}
        {formError && (
          <Alert variant="destructive" show={!!formError} title="Erreur">
            {formError}
          </Alert>
        )}

        {/* Confirmation Modal */}
        <ConfirmModal
          open={confirmModal.open}
          onClose={() => setConfirmModal(prev => ({ ...prev, open: false, isLoading: false }))}
          onConfirm={
            confirmModal.action === 'removeUser'
              ? handleConfirmRemoveMember
              : handleConfirmChangeRole
          }
          title={confirmModal.title}
          description={confirmModal.description}
          confirmText={confirmModal.action === 'removeUser' ? 'Retirer' : 'Changer'}
          cancelText="Annuler"
          variant={confirmModal.action === 'removeUser' ? 'danger' : 'default'}
          isLoading={confirmModal.isLoading}
        />

        {/* Toast Notifications */}
        <ToastContainer
          toasts={toasts.map(t => ({
            ...t,
          }))}
          onRemove={removeToast}
          position="top-right"
        />
      </div>
    </div >
  );
}
