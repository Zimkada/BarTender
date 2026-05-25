// components/ProfileSettings.tsx - Paramètres utilisateur (mot de passe, infos personnelles)
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  CheckCircle,
  Phone,
  Mail,
  Shield,
  Calendar,
  Zap,
  GraduationCap,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useColorMode } from '../context/ColorModeContext';
import { AuthService } from '../services/supabase/auth.service';
import { supabase } from '../lib/supabase';
import type { User as UserType } from '../types';
import { Input } from './ui/Input';
import { TabbedPageHeader } from './common/PageHeader/patterns/TabbedPageHeader';
import { useViewport } from '../hooks/useViewport';
import { TrainingTab } from './TrainingTab';
import { getRoleTheme } from '../theme/themeHelpers';
import { getErrorMessage } from '../utils/errorHandler';

export function ProfileSettings() {
  const { currentSession, changePassword, refreshSession } = useAuth();
  const { colorMode, setColorMode } = useColorMode();
  const { isMobile } = useViewport();
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'training'>('info');

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

  // Fetch user data
  useEffect(() => {
    if (currentSession?.userId) {
      setLoading(true);
      supabase
        .from('users')
        .select('*')
        .eq('id', currentSession.userId)
        .single()
        .then(({ data, error }) => {
          if (data) {
            const user: UserType = {
              id: data.id,
              username: data.username || '',
              name: data.name || '',
              phone: data.phone || '',
              email: data.email || '',
              createdAt: data.created_at ? new Date(data.created_at) : new Date(),
              isActive: data.is_active ?? true,
              firstLogin: data.first_login ?? false,
              lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
              role: (data as any).role || 'serveur',
              hasCompletedOnboarding: data.has_completed_onboarding ?? false,
              onboardingCompletedAt: data.onboarding_completed_at ? new Date(data.onboarding_completed_at) : undefined,
              trainingVersionCompleted: data.training_version_completed ?? 0,
            };
            setCurrentUser(user);
            setName(user.name);
            setEmail(user.email || '');
            setPhone(user.phone);
          } else if (error) {
            setErrorMessage('Impossible de charger le profil utilisateur');
          }
          setLoading(false);
        });
    }
  }, [currentSession?.userId]);

  const handleSaveInfo = async () => {
    if (!currentUser) return;
    setErrorMessage('');
    setSuccessMessage('');

    if (!name.trim()) {
      setErrorMessage('Le nom est requis');
      return;
    }

    try {
      await AuthService.updateProfile(currentUser.id, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
      });

      setCurrentUser(prev => prev ? {
        ...prev,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
      } : null);

      await refreshSession();
      setSuccessMessage('Informations mises à jour avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Erreur lors de la mise à jour');
    }
  };

  const handleChangePassword = async () => {
    if (!currentUser) return;
    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword.length < 8) {
      setErrorMessage('Le mot de passe doit contenir au moins 8 caractères (standard de sécurité)');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    if (!currentPassword) {
      setErrorMessage('Veuillez saisir votre mot de passe actuel');
      return;
    }

    try {
      setLoading(true);
      await changePassword(newPassword, currentPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Mot de passe modifié avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Erreur lors du changement');
    } finally {
      setLoading(false);
    }
  };

  const theme = getRoleTheme(currentSession?.role);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      <p className="text-body-sm text-muted-foreground">Chargement de votre profil...</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TabbedPageHeader
        title={isMobile ? "Profil" : "Mon Profil Utilisateur"}
        subtitle="Gérez vos informations et votre sécurité"
        icon={<UserIcon />}
        tabs={[
          { id: 'info', label: 'Informations', icon: UserIcon },
          { id: 'password', label: 'Sécurité', icon: Lock },
          { id: 'training', label: 'Formation', icon: GraduationCap },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'info' | 'password' | 'training')}
        guideId="my-profile"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
        {/* Left Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm"
            >
              {successMessage && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-800">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-body-sm font-medium">{successMessage}</p>
                </div>
              )}

              {errorMessage && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-body-sm font-medium">{errorMessage}</p>
                </div>
              )}

              {activeTab === 'info' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-caption font-medium text-muted-foreground ml-0.5">Nom complet</label>
                      <Input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Sandra KOFFI"
                        className="h-11 bg-muted border-border focus:bg-card transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-caption font-medium text-muted-foreground ml-0.5">Email</label>
                      <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="sandra.koffi@bartender.app"
                        leftIcon={<Mail className="w-4 h-4 text-muted-foreground" />}
                        disabled={true}
                        className="h-11 bg-muted border-border cursor-not-allowed opacity-60"
                      />
                      <p className="text-caption text-muted-foreground ml-0.5">
                        Contactez un administrateur pour modifier votre email.
                      </p>
                    </div>
                    <div className="space-y-1.5 col-span-1 md:col-span-2">
                      <label className="text-caption font-medium text-muted-foreground ml-0.5">Téléphone</label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="01 02 03 04 05"
                        leftIcon={<Phone className="w-4 h-4 text-muted-foreground" />}
                        className="h-11 bg-muted border-border focus:bg-card transition-colors"
                      />
                    </div>
                  </div>

                  {/* Apparence — choix du mode d'affichage (préférence locale, par device) */}
                  <div className="space-y-2 pt-4 border-t border-border">
                    <div>
                      <p className="text-body-sm font-semibold text-foreground">Apparence</p>
                      <p className="text-caption text-muted-foreground">Choix du mode d'affichage, enregistré sur cet appareil.</p>
                    </div>
                    <div
                      className="grid grid-cols-3 gap-2 bg-muted p-1 rounded-xl border border-border"
                      role="radiogroup"
                      aria-label="Mode d'affichage"
                    >
                      {([
                        { value: 'system', label: 'Système', icon: Monitor },
                        { value: 'light', label: 'Clair', icon: Sun },
                        { value: 'dark', label: 'Sombre', icon: Moon },
                      ] as const).map(({ value, label, icon: Icon }) => {
                        const active = colorMode === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setColorMode(value)}
                            className={`flex items-center justify-center gap-1.5 h-9 rounded-lg text-caption font-medium transition-colors ${
                              active
                                ? 'bg-card text-brand-primary shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground/80'
                            }`}
                          >
                            <Icon size={14} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleSaveInfo}
                      disabled={loading}
                      className="btn-brand w-full h-12 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Save size={18} />
                      Sauvegarder les modifications
                    </button>
                  </div>
                </div>
              ) : activeTab === 'password' ? (
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-caption font-medium text-muted-foreground ml-0.5">Mot de passe actuel</label>
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      rightIcon={
                        <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="text-muted-foreground hover:text-foreground/70 transition-colors">
                          {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      }
                      className="h-11 bg-muted border-border focus:bg-card"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-caption font-medium text-muted-foreground ml-0.5">Nouveau mot de passe</label>
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        rightIcon={
                          <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="text-muted-foreground hover:text-foreground/70 transition-colors">
                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                        className="h-11 bg-muted border-border focus:bg-card"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-caption font-medium text-muted-foreground ml-0.5">Confirmer le mot de passe</label>
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        rightIcon={
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-muted-foreground hover:text-foreground/70 transition-colors">
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                        className="h-11 bg-muted border-border focus:bg-card"
                      />
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-xl border border-border">
                    <p className="text-caption font-semibold text-foreground/80 mb-2.5 flex items-center gap-1.5">
                      <Shield size={13} className="text-brand-primary" />
                      Conseils de sécurité
                    </p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-caption text-muted-foreground">
                      <li className="flex items-center gap-1.5"><span className="text-brand-primary">✓</span> Min. 8 caractères</li>
                      <li className="flex items-center gap-1.5"><span className="text-brand-primary">✓</span> Majuscules & minuscules</li>
                      <li className="flex items-center gap-1.5"><span className="text-brand-primary">✓</span> Chiffres & symboles</li>
                      <li className="flex items-center gap-1.5"><span className="text-brand-primary">✓</span> Différent du précédent</li>
                    </ul>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleChangePassword}
                      disabled={!newPassword || newPassword !== confirmPassword}
                      className="btn-brand w-full h-12 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Lock size={18} />
                      Mettre à jour le mot de passe
                    </button>
                  </div>
                </div>
              ) : (
                <TrainingTab />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Column: User ID Card */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white relative overflow-hidden border border-slate-700/50 shadow-xl flex flex-col min-h-[460px]">
            {/* Ticket cutouts */}
            <div className="absolute top-1/2 -left-5 w-10 h-10 bg-muted rounded-full -translate-y-1/2" />
            <div className="absolute top-1/2 -right-5 w-10 h-10 bg-muted rounded-full -translate-y-1/2" />

            {/* Avatar */}
            <div className="text-center mb-8 relative z-10">
              <div className={`w-24 h-24 mx-auto rounded-2xl ${theme.avatar} p-0.5 mb-4 shadow-xl`}>
                <div className="w-full h-full bg-slate-800 rounded-[14px] flex items-center justify-center border border-white/10">
                  <span className="text-4xl font-bold text-white/90">
                    {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                  </span>
                </div>
              </div>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${theme.badge} text-micro font-semibold border border-slate-700/50`}>
                <Shield size={11} />
                {currentSession?.role?.replace('_', ' ')}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-5 flex-1 relative z-10">
              <div className="space-y-0.5">
                <p className="text-micro text-slate-500">Identifiant système</p>
                <p className="text-body-sm font-semibold font-mono text-white/90">@{currentUser?.username}</p>
              </div>

              <div className="border-t border-dashed border-white/15" />

              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-card/5 flex items-center justify-center border border-white/10 flex-shrink-0">
                    <Calendar size={16} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-micro text-slate-500">Membre depuis</p>
                    <p className="text-body-sm font-medium text-white/80">{currentUser?.createdAt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-card/5 flex items-center justify-center border border-white/10 flex-shrink-0">
                    <Zap size={16} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-micro text-slate-500">Dernier accès</p>
                    <p className="text-body-sm font-medium text-white/80">
                      {currentUser?.lastLoginAt ? new Date(currentUser.lastLoginAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Maintenant'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0 ${currentUser?.hasCompletedOnboarding ? 'bg-emerald-500/15 border-emerald-500/25' : 'bg-card/5 border-white/10'}`}>
                    <GraduationCap size={16} className={currentUser?.hasCompletedOnboarding ? 'text-emerald-400' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className="text-micro text-slate-500">Formation</p>
                    <p className={`text-body-sm font-medium ${currentUser?.hasCompletedOnboarding ? 'text-emerald-400' : 'text-white/60'}`}>
                      {currentUser?.hasCompletedOnboarding ? (
                        <>
                          Certifié
                          {currentUser?.onboardingCompletedAt && (
                            <span className="text-caption text-slate-500 ml-1.5">
                              v{currentUser?.trainingVersionCompleted || 1}
                            </span>
                          )}
                        </>
                      ) : (
                        'En attente'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom branding */}
            <div className="mt-6 pt-5 border-t border-white/10 text-center relative z-10">
              <p className="text-micro text-slate-600">BarTender Digital ID</p>
              <div className="flex justify-center gap-1 mt-2.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className={`h-1 rounded-full ${i % 3 === 0 ? 'w-4 bg-brand-primary' : 'w-2 bg-slate-700'}`} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

