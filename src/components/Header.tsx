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
import { NetworkBadge } from './NetworkBadge'; // ✅ Badge réseau compact pour le header
import { RefreshButton } from './RefreshButton'; // ✅ Bouton rafraîchissement manuel
import { useViewport } from '../hooks/useViewport';
import { ProfileSettings } from './ProfileSettings';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import AnimatedBarName from './AnimatedBarName';
import { AnimatedCounter } from './AnimatedCounter';

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
                <RefreshButton />
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
              <img
                src="/icons/icon-48x48.png"
                alt="BarTender"
                className="w-5 h-5 flex-shrink-0 rounded"
              />
              <h1 className="text-sm font-bold text-white truncate">
                <AnimatedBarName text={currentSession?.role === 'super_admin' ? 'BarTender Pro' : (currentBar?.name || 'BarTender')} />
              </h1>
            </div>

            {/* Bouton Menu Hamburger - FAR RIGHT side */}
            <Button
              onClick={onToggleMobileSidebar}
              variant="ghost"
              size="icon"
              className="p-2 bg-white rounded-lg text-purple-600 active:scale-95 transition-all shadow-lg border-2 border-white/40 flex-shrink-0"
              aria-label="Menu"
            >
              <Menu size={22} className="stroke-[2.5]" />
            </Button>
          </div>
          ) : (
            // Layout NON-ADMIN Mobile: 3 lignes
            <>
              {/* Ligne 1: Hamburger + Badges + Actions */}
              <div className="flex items-center justify-between gap-2 mb-2 w-full">
                {/* Bouton Menu Hamburger - LEFT */}
                <Button
                  onClick={onToggleMobileSidebar}
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-amber-200 rounded-lg text-amber-600 active:scale-95 transition-all shadow-lg border-2 border-amber-200/40 flex-shrink-0"
                  aria-label="Menu"
                >
                  <Menu size={22} className="stroke-[2.5]" />
                </Button>

                {/* Badges + Actions - RIGHT */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <SyncStatusBadge compact position="header" />
                  <RefreshButton />
                  <NetworkBadge />

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

              {/* Ligne 2: Nom du bar + Ventes du jour (même enveloppe) */}
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2 mb-2">
                <div className="flex items-center justify-between gap-2">
                  {/* Nom du bar ou sélecteur - LEFT */}
                  {currentSession?.role === 'promoteur' ? (
                    <BarSelector onCreateNew={onShowCreateBar} />
                  ) : (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <img
                        src="/icons/icon-48x48.png"
                        alt="BarTender"
                        className="w-5 h-5 flex-shrink-0 rounded"
                      />
                      <span className="text-sm font-medium text-white truncate">
                        <AnimatedBarName text={currentBar?.name || 'BarTender'} />
                      </span>
                    </div>
                  )}

                  {/* Ventes du jour - RIGHT (seulement pour non super admin) */}
                  {(currentSession?.role !== 'super_admin' || isAdminInImpersonation) && (
                    <div className="flex flex-col items-center flex-shrink-0">
                      <p className="text-white/80 text-xs font-medium">Ventes jour</p>
                      <AnimatedCounter
                        value={todayTotal}
                        className="text-white text-sm font-medium"
                        suffix=" FCFA"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Ligne 3: Rôle + Nom utilisateur (centré) */}
              <div className="flex items-center justify-center gap-2 mb-1 w-full">
                <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
                  {getRoleIcon()}
                  <span className="text-white text-xs font-medium">{getRoleLabel()}</span>
                </div>
                {currentSession?.userName && (
                  <span className="text-white/90 text-xs font-medium">
                    {currentSession.userName}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

      </header>
    );
  }

  // ==================== VERSION DESKTOP (1% promoteurs avec PC) ====================
  return (
    <header className="bg-gradient-to-r from-amber-500 to-amber-500 shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Gauche: Hamburger + Logo + Indicateurs + Bar selector */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Bouton Menu Hamburger */}
            <Button
              onClick={onToggleMobileSidebar}
              variant="ghost"
              size="icon"
              className="p-2 bg-amber-200/50 rounded-lg text-white hover:bg-amber-200/60 transition-colors"
              aria-label="Menu"
            >
              <Menu size={24} />
            </Button>

            {/* Titre / Sélecteur de bar unifié */}
            {currentSession?.role === 'promoteur' ? (
              <BarSelector onCreateNew={onShowCreateBar} />
            ) : (
              <div className="flex items-center gap-2">
                <img
                  src="/icons/icon-48x48.png"
                  alt="BarTender"
                  className="w-6 h-6 md:w-8 md:h-8 flex-shrink-0 rounded"
                />
                <h1 className="text-lg md:text-2xl font-bold text-white">
                  <AnimatedBarName text={currentSession?.role === 'super_admin' ? 'BarTender Pro' : (currentBar?.name || 'BarTender')} />
                </h1>
              </div>
            )}

            {/* ✅ Nouveau badge sync unifié (remplace OfflineIndicator + NetworkIndicator + SyncButton) */}
            <SyncStatusBadge position="header" />
            <RefreshButton />

            {/* ✅ Badge réseau compact (offline/connexion lente) */}
            <NetworkBadge />

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
                  className="hidden md:flex p-2 bg-orange-500/90 rounded-lg text-white hover:bg-orange-600/90 transition-colors"
                  aria-label="Vente Rapide"
                  title="Vente Rapide"
                >
                  <ShoppingCart size={20} />
                </Button>
              </>
            )}
          </div>

          {/* Droite: Stats + User + Déconnexion */}
          <div className="flex items-center gap-2 md:gap-6">
            {/* Ventes du jour - Masqué pour super admin sauf en impersonation */}
            {(currentSession?.role !== 'super_admin' || isAdminInImpersonation) && (
              <div className="hidden sm:block bg-white/20 backdrop-blur-sm rounded-lg px-3 md:px-4 py-2 flex flex-col items-center">
                <p className="text-white/80 text-xs md:text-sm">Ventes du jour</p>
                <AnimatedCounter
                  value={todayTotal}
                  className="text-white text-lg md:text-2xl font-bold"
                  suffix=" FCFA"
                />
              </div>
            )}

            {/* User info */}
            <div className="hidden md:block text-right">
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



            {/* Déconnexion */}
            <IconButton
              onClick={logout}
              className="p-2 bg-red-500/80 rounded-lg text-white hover:bg-red-600/80 transition-colors"
              aria-label="Déconnexion"
            >
              <LogOut size={20} />
            </IconButton>
          </div>
        </div>
      </div>


    </header>
  );
}
