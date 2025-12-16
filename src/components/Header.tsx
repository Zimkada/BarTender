import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // NEW: Import useNavigate and Link
import {
  Settings,
  Users,
  UserCog,
  LogOut,
  Crown,
  Menu,
  ShieldCheck, // Pour Super Admin
  Bell, // Pour notifications admin
  User, // Pour profil utilisateur
  Globe, // Pour catalogue global
  PlusCircle, // Added for "Add Product" button (ProductModal)
  ShoppingCart, // Added for "Quick Sale" button
  Package, // ✅ FIX: Added for "Supply" button
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRevenueStats } from '../hooks/useRevenueStats';
import { useAuth } from "../context/AuthContext";
import { useActingAs } from '../context/ActingAsContext';
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { BarSelector } from './BarSelector';
import { SyncStatusBadge } from './SyncStatusBadge'; // ✅ Badge sync unifié (remplace OfflineIndicator, NetworkIndicator, SyncButton)
import { useViewport } from '../hooks/useViewport';
import { ProfileSettings } from './ProfileSettings';
import { Button } from './ui/Button';

// Composant pour l'animation lettre par lettre du nom du bar
const AnimatedBarName: React.FC<{ text: string }> = ({ text }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Déclenche l'animation après le montage du composant
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="inline-flex">
      {text.split('').map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          initial={{ opacity: 0, y: -20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{
            duration: 0.4,
            delay: index * 0.08, // 80ms entre chaque lettre (plus lent et élégant)
            ease: "easeOut"
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
};

import { Bar } from '../types'; // NEW: Import Bar type

interface HeaderProps {
  // Modal triggers
  onShowQuickSale: () => void;
  onShowProductModal: () => void;
  onShowCategoryModal: () => void;
  // onShowUserManagement removed
  onShowSupplyModal: () => void;
  onShowBarStatsModal: (bar: Bar) => void; // MODIFIED: now takes a bar object

  // Other persistent callbacks
  onToggleMobileSidebar?: () => void;
  onShowCreateBar?: () => void; // Kept for BarSelector
  unreadNotificationsCount?: number;

  // Note: All onShowX props for pages will be removed as navigation will use React Router directly
  // This will require modifying the Header's internal navigation elements to use <Link> or useNavigate()
}

export function Header({
  onShowQuickSale,
  onShowProductModal,
  onShowCategoryModal,
  // onShowUserManagement removed
  onShowSupplyModal,
  onShowBarStatsModal,
  onToggleMobileSidebar = () => { },
  onShowCreateBar,
  // onSwitchToServer, // REMOVED
  unreadNotificationsCount = 0,
}: HeaderProps) {
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession, logout } = useAuth();
  const { isActingAs, stopActingAs } = useActingAs();
  const { currentBar } = useBarContext();
  const { isMobile } = useViewport();
  const navigate = useNavigate(); // NEW: Initialize useNavigate

  const [showProfileSettings, setShowProfileSettings] = useState(false);

  // Check if super_admin is currently in impersonation mode
  const isAdminInImpersonation = currentSession?.role === 'super_admin' && isActingAs();

  const handleReturnToAdmin = () => {
    stopActingAs();
    navigate('/admin');
  };

  // ✨ HYBRID DRY REVENUE
  const { netRevenue: todayTotal } = useRevenueStats();

  const getRoleIcon = () => {
    switch (currentSession?.role) {
      case 'super_admin': return <ShieldCheck size={16} className="text-purple-600" />;
      case 'promoteur': return <Crown size={16} className="text-purple-600" />;
      case 'gerant': return <Settings size={16} className="text-amber-600" />;
      case 'serveur': return <Users size={16} className="text-amber-600" />;
      default: return null;
    }
  };

  const getRoleLabel = () => {
    switch (currentSession?.role) {
      case 'super_admin': return 'Super Admin';
      case 'promoteur': return 'Promoteur';
      case 'gerant': return 'Gérant';
      case 'serveur': return 'Serveur';
      default: return '';
    }
  };

  // ==================== VERSION MOBILE (99% utilisateurs Bénin) ====================
  if (isMobile) {
    // Disposition différente pour super_admin vs autres rôles
    const isAdminView = currentSession?.role === 'super_admin';

    return (
      <header className="bg-gradient-to-r from-amber-500 to-amber-500 shadow-lg sticky top-0 z-50">
        <div className="px-3 py-2">
          {/* Layout ADMIN: Indicateurs (LEFT) + Titre (CENTER) + Hamburger (RIGHT) */}
          {isAdminView ? (
            <div className="flex items-center justify-between gap-2 mb-2 w-full">
              {/* Indicateurs + Actions (compacts) - LEFT side */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* ✅ Nouveau badge sync unifié (remplace OfflineIndicator + NetworkIndicator + SyncButton) */}
                <SyncStatusBadge compact position="header" />
                {/* Bouton retour à l'admin - visible seulement si en impersonation */}
                {isAdminInImpersonation && (
                  <Button
                    onClick={handleReturnToAdmin}
                    variant="ghost"
                    size="icon"
                    className="p-1.5 bg-purple-600/90 rounded-lg text-white active:scale-95 transition-transform"
                    title="Retour à l'Admin"
                    aria-label="Retour à l'Admin"
                  >
                    <ShieldCheck size={16} />
                  </Button>
                )}
            </div>

            {/* Logo + Nom bar - CENTER/RIGHT */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-center">
              <h1 className="text-sm font-bold text-white truncate">
                🍺 <AnimatedBarName text={currentSession?.role === 'super_admin' ? 'BarTender Pro' : (currentBar?.name || 'BarTender')} />
              </h1>
            </div>

            {/* Bouton Menu Hamburger - FAR RIGHT side */}
            <Button
              onClick={onToggleMobileSidebar}
              variant="ghost"
              size="icon"
              className="p-2 bg-gray-900/90 rounded-lg text-white active:scale-95 transition-all shadow-lg border-2 border-white/40 flex-shrink-0"
              aria-label="Menu"
            >
              <Menu size={22} className="stroke-[2.5]" />
            </Button>
          </div>
          ) : (
            // Layout NON-ADMIN: Hamburger (LEFT) + Titre (CENTER) + Actions (RIGHT)
            <div className="flex items-center justify-between gap-2 mb-2 w-full">
              {/* Bouton Menu Hamburger - LEFT side */}
              <Button
                onClick={onToggleMobileSidebar}
                variant="ghost"
                size="icon"
                className="p-2 bg-gray-900/90 rounded-lg text-white active:scale-95 transition-all shadow-lg border-2 border-white/40 flex-shrink-0"
                aria-label="Menu"
              >
                <Menu size={22} className="stroke-[2.5]" />
              </Button>

              {/* Logo + Nom bar - CENTER */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-center">
                <h1 className="text-sm font-bold text-white truncate">
                  🍺 <AnimatedBarName text={currentBar?.name || 'BarTender'} />
                </h1>
              </div>

              {/* Indicateurs + Actions (compacts) - RIGHT side */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* ✅ Nouveau badge sync unifié */}
                <SyncStatusBadge compact position="header" />
                {/* NEW: Add buttons for common modals from header (QuickSale only on mobile) */}
                {(currentSession?.role !== 'super_admin' || isAdminInImpersonation) && (
                  <>
                    <Button
                      onClick={onShowQuickSale}
                      variant="ghost"
                      size="icon"
                      className="p-1.5 bg-orange-500/90 rounded-lg text-white active:scale-95 transition-transform"
                      aria-label="Vente Rapide"
                      title="Vente Rapide"
                    >
                      <ShoppingCart size={16} />
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => setShowProfileSettings(true)}
                  variant="ghost"
                  size="icon"
                  className="p-1.5 bg-indigo-600/90 rounded-lg text-white active:scale-95 transition-transform"
                  aria-label="Mon Profil"
                >
                  <User size={16} />
                </Button>
                <Button
                  onClick={logout}
                  variant="ghost"
                  size="icon"
                  className="p-1.5 bg-red-500/80 rounded-lg text-white active:scale-95 transition-transform"
                  aria-label="Déconnexion"
                >
                  <LogOut size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* Ligne 2: Ventes du jour (info principale) - Masqué pour super admin sauf en impersonation */}
          {(currentSession?.role !== 'super_admin' || isAdminInImpersonation) && (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-white/80 text-xs font-medium">Ventes du jour</p>
                  <p className="text-white text-lg font-bold tracking-tight">
                    {formatPrice(todayTotal)}
                  </p>
                </div>

                {/* Badge rôle */}
                <div className="flex items-center gap-1 bg-white/20 rounded-full px-3 py-1">
                  {getRoleIcon()}
                  <span className="text-white text-xs font-medium">{getRoleLabel()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Badge rôle pour super admin (standalone) - sauf en impersonation */}
          {currentSession?.role === 'super_admin' && !isAdminInImpersonation && (
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
                {getRoleIcon()}
                <span className="text-white text-sm font-bold">{getRoleLabel()}</span>
              </div>
            </div>
          )}

          {/* Ligne 3: Nom utilisateur (si espace) */}
          {currentSession?.userName && (
            <p className="text-white/90 text-xs mt-1 text-center font-medium">
              {currentSession.userName}
            </p>
          )}
        </div>


        {/* ProfileSettings Modal */}
        <ProfileSettings
          isOpen={showProfileSettings}
          onClose={() => setShowProfileSettings(false)}
        />
      </header>
    );
  }

  // ==================== VERSION DESKTOP (1% promoteurs avec PC) ====================
  return (
    <header className="bg-gradient-to-r from-amber-500 to-amber-500 shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Gauche: Hamburger + Logo + Indicateurs + Bar selector */}
          <div className="flex items-center gap-4">
            {/* Bouton Menu Hamburger */}
            <Button
              onClick={onToggleMobileSidebar}
              variant="ghost"
              size="icon"
              className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30 transition-colors"
              aria-label="Menu"
            >
              <Menu size={24} />
            </Button>

            <h1 className="text-2xl font-bold text-white">
              🍺 <AnimatedBarName text={currentSession?.role === 'super_admin' ? 'BarTender Pro' : (currentBar?.name || 'BarTender')} />
            </h1>

            {/* ✅ Nouveau badge sync unifié (remplace OfflineIndicator + NetworkIndicator + SyncButton) */}
            <SyncStatusBadge position="header" />

            {/* Sélecteur de bar pour promoteur */}
            {currentSession?.role === 'promoteur' && (
              <BarSelector onCreateNew={onShowCreateBar} />
            )}

            {/* NEW: Desktop buttons for common modals */}
            {currentSession?.role !== 'super_admin' && (
              <>
                <Button
                  onClick={onShowProductModal}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-blue-500/90 rounded-lg text-white hover:bg-blue-600/90 transition-colors"
                  aria-label="Ajouter Produit"
                  title="Ajouter Produit"
                >
                  <PlusCircle size={20} />
                </Button>
                <Button
                  onClick={onShowQuickSale}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-orange-500/90 rounded-lg text-white hover:bg-orange-600/90 transition-colors"
                  aria-label="Vente Rapide"
                  title="Vente Rapide"
                >
                  <ShoppingCart size={20} />
                </Button>
              </>
            )}
          </div>

          {/* Droite: Stats + User + Déconnexion */}
          <div className="flex items-center gap-6">
            {/* Ventes du jour - Masqué pour super admin sauf en impersonation */}
            {(currentSession?.role !== 'super_admin' || isAdminInImpersonation) && (
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                <p className="text-white/80 text-sm">Ventes du jour</p>
                <p className="text-white text-2xl font-bold">{formatPrice(todayTotal)}</p>
              </div>
            )}

            {/* User info */}
            <div className="text-right">
              <p className="text-white font-medium">{currentSession?.userName}</p>
              <p className="text-white/80 text-sm flex items-center justify-end gap-1">
                {getRoleIcon()}
                {getRoleLabel()}
              </p>
            </div>

            {/* Admin Actions (super_admin uniquement - sauf en impersonation) */}
            {currentSession?.role === 'super_admin' && !isAdminInImpersonation && (
              <>
                <Button
                  onClick={() => navigate('/admin/catalog')}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-blue-600/90 rounded-lg text-white hover:bg-blue-700/90 transition-colors"
                  title="Catalogue Global"
                >
                  <Globe size={20} />
                </Button>
                <Button
                  onClick={() => navigate('/admin/notifications')}
                  variant="ghost"
                  size="icon"
                  className="relative p-2 bg-purple-600/90 rounded-lg text-white hover:bg-purple-700/90 transition-colors"
                  title="Notifications Admin"
                >
                  <Bell size={20} />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </span>
                  )}
                </Button>
                {/* NEW: Admin Modals */}
                <Button
                  onClick={() => navigate('/team')}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-pink-600/90 rounded-lg text-white hover:bg-pink-700/90 transition-colors"
                  title="Gestion Utilisateurs"
                >
                  <Users size={20} />
                </Button>
                <Button
                  onClick={onShowSupplyModal}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-cyan-600/90 rounded-lg text-white hover:bg-cyan-700/90 transition-colors"
                  title="Gestion des Approv."
                >
                  <Package size={20} />
                </Button>
                <Button
                  onClick={() => navigate('/admin')}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-purple-600/90 rounded-lg text-white hover:bg-purple-700/90 transition-colors"
                  title="Admin Dashboard"
                >
                  <ShieldCheck size={20} />
                </Button>
              </>
            )}

            {/* Mon Profil */}
            <Button
              onClick={() => setShowProfileSettings(true)}
              variant="ghost"
              size="icon"
              className="p-2 bg-indigo-600/90 rounded-lg text-white hover:bg-indigo-700/90 transition-colors"
              title="Mon Profil"
            >
              <User size={20} />
            </Button>

            {/* Déconnexion */}
            <button
              onClick={logout}
              className="p-2 bg-red-500/80 rounded-lg text-white hover:bg-red-600/80 transition-colors"
              title="Déconnexion"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>


      {/* ProfileSettings Modal */}
      <ProfileSettings
        isOpen={showProfileSettings}
        onClose={() => setShowProfileSettings(false)}
      />
    </header>
  );
}
