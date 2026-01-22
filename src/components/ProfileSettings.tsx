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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/supabase/auth.service';
import { supabase } from '../lib/supabase';
import type { User as UserType } from '../types';
import { Input } from './ui/Input';
import { TabbedPageHeader } from './common/PageHeader/patterns/TabbedPageHeader';
import { useViewport } from '../hooks/useViewport';

export function ProfileSettings() {
  const { currentSession, changePassword, refreshSession } = useAuth();
  const { isMobile } = useViewport();
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

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
              createdAt: new Date(data.created_at),
              isActive: data.is_active ?? true,
              firstLogin: data.first_login ?? false,
              lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
              role: data.role
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
    } catch (error: any) {
      setErrorMessage(error.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleChangePassword = async () => {
    if (!currentUser) return;
    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword.length < 4) {
      setErrorMessage('Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    try {
      await changePassword(newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Mot de passe modifié avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Erreur lors du changement');
    }
  };

  const roleColors = currentSession?.role === 'super_admin'
    ? { primary: 'from-indigo-600 to-purple-600', secondary: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    : { primary: 'from-amber-500 to-orange-600', secondary: 'bg-amber-50 text-amber-700 border-amber-200' };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className={`animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 ${currentSession?.role === 'super_admin' ? 'border-indigo-600' : 'border-amber-600'}`}></div>
      <p className="text-gray-500 font-medium animate-pulse">Chargement de votre profil...</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TabbedPageHeader
        title={isMobile ? "Profil" : "Mon Profil Utilisateur"}
        subtitle="Gérez vos informations et votre sécurité"
        icon={<UserIcon className={`w-6 h-6 ${currentSession?.role === 'super_admin' ? 'text-indigo-600' : 'text-amber-600'}`} />}
        tabs={[
          { id: 'info', label: 'Informations', icon: UserIcon },
          { id: 'password', label: 'Sécurité', icon: Lock },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'info' | 'password')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
        {/* Left Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-3xl p-6 md:p-10 border border-gray-100 shadow-sm"
            >
              {successMessage && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3 text-green-800 animate-in fade-in slide-in-from-top-2">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-bold">{successMessage}</p>
                </div>
              )}

              {errorMessage && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-bold">{errorMessage}</p>
                </div>
              )}

              {activeTab === 'info' ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nom Complet</label>
                      <Input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Jean Dupont"
                        className="h-12 text-lg font-bold bg-gray-50 border-gray-100 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Email</label>
                      <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="jean@bartender.app"
                        leftIcon={<Mail className="w-4 h-4 text-gray-400" />}
                        className="h-12 bg-gray-50 border-gray-100 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Téléphone</label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="01 02 03 04 05"
                        leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
                        className="h-12 bg-gray-50 border-gray-100 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={handleSaveInfo}
                      disabled={loading}
                      className={`w-full h-14 bg-gradient-to-r ${roleColors.primary} text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-gray-200 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3`}
                    >
                      <Save size={20} />
                      Sauvegarder les modifications
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Mot de passe actuel</label>
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      rightIcon={
                        <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="text-gray-400">
                          {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      }
                      className="h-12 bg-gray-50 border-gray-100 focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nouveau mot de passe</label>
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        rightIcon={
                          <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="text-gray-400">
                            {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        }
                        className="h-12 bg-gray-50 border-gray-100 focus:bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Confirmer</label>
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        rightIcon={
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-gray-400">
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        }
                        className="h-12 bg-gray-50 border-gray-100 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 border-dashed">
                    <p className="text-xs text-blue-900 font-bold mb-3 flex items-center gap-2">
                      <Shield size={14} className="text-blue-500" />
                      Conseils sécurité
                    </p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-blue-700 font-bold uppercase tracking-wide opacity-80">
                      <li className="flex items-center gap-2">✓ Min. 8 caractères</li>
                      <li className="flex items-center gap-2">✓ Majuscules & Minuscules</li>
                      <li className="flex items-center gap-2">✓ Chiffres & Signes</li>
                      <li className="flex items-center gap-2">✓ Différent du précédent</li>
                    </ul>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={handleChangePassword}
                      disabled={!newPassword || newPassword !== confirmPassword}
                      className={`w-full h-14 bg-gradient-to-r ${roleColors.primary} text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3`}
                    >
                      <Lock size={20} />
                      Mettre à jour le mot de passe
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Column: User ID Card Ticket */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden border border-slate-700 shadow-2xl flex flex-col min-h-[500px]">
            {/* Cutouts for Ticket Effect */}
            <div className="absolute top-1/2 -left-6 w-12 h-12 bg-gray-50 rounded-full -translate-y-1/2" />
            <div className="absolute top-1/2 -right-6 w-12 h-12 bg-gray-50 rounded-full -translate-y-1/2" />

            {/* Avatar Section */}
            <div className="text-center mb-10 relative z-10">
              <div className={`w-28 h-28 mx-auto rounded-3xl bg-gradient-to-br ${roleColors.primary} p-1 mb-6 rotate-3 shadow-2xl transition-transform hover:rotate-0`}>
                <div className="w-full h-full bg-slate-800 rounded-[1.4rem] flex items-center justify-center border border-white/10 group overflow-hidden shadow-inner">
                  <span className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-t from-white to-white/50 group-hover:scale-110 transition-transform">
                    {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                  </span>
                </div>
              </div>
              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${roleColors.secondary} text-[10px] font-black uppercase tracking-[0.2em] shadow-lg border border-slate-700/50`}>
                <Shield size={12} />
                {currentSession?.role?.replace('_', ' ')}
              </div>
            </div>

            {/* Stats / Details */}
            <div className="space-y-6 flex-1 relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identifiant Système</p>
                <p className="text-lg font-black font-mono text-white/90">@{currentUser?.username}</p>
              </div>

              <div className="h-px bg-white/10 border-t border-dashed border-white/20 my-6" />

              <div className="grid grid-cols-1 gap-5">
                <div className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors border border-white/10">
                    <Calendar size={18} className="text-slate-400 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Membre depuis</p>
                    <p className="text-sm font-bold text-white/80">{currentUser?.createdAt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors border border-white/10">
                    <Zap size={18} className="text-slate-400 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Dernier accès</p>
                    <p className="text-sm font-bold text-white/80">
                      {currentUser?.lastLoginAt ? new Date(currentUser.lastLoginAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Maintenant'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Branding / Info */}
            <div className="mt-10 pt-6 border-t border-white/10 text-center relative z-10">
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.3em]">BarTender Digital ID</p>
              <div className="flex justify-center gap-1 mt-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className={`h-1 rounded-full ${i % 3 === 0 ? 'w-4 bg-amber-500' : 'w-2 bg-slate-700'}`} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

