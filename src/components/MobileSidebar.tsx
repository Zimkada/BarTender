import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Home,
  Zap,
  BarChart3,
  Calendar,
  Package,
  Users,
  Settings,
  LogOut,
  X,
  DollarSign,
  RotateCcw,
  Archive,
  ShieldCheck,
  Bell,
  FileText,
  Building2,
  UserCog,
  User,
  Globe,
  Gift,
  CreditCard,
  ChevronDown,
  ShoppingCart,
  Boxes,
  Wallet,
  ChefHat,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan';
import type { FeatureKey } from '../config/plans';
import type { UserRole } from '../types';
import { IconButton } from './ui/IconButton';
import { networkManager } from '../services/NetworkManager';
import { useNotifications } from './Notifications';
import { ConfirmationModal } from './common/ConfirmationModal';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentMenu?: string;
  onShowQuickSale: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /**
   * ⭐ Aligné sur `UserRole` : un rôle absent d'un tableau `roles` ne voit pas
   * l'entrée. Motif « liste blanche » — sûr par construction à l'ajout d'un rôle.
   * Le cuisinier ne voit donc AUCUNE entrée tant qu'on ne l'y ajoute pas.
   */
  roles: UserRole[];
  action?: () => void;
  path?: string;
  /** Feature du plan requise pour afficher cet item */
  feature?: FeatureKey;
  /**
   * ⭐ Entrée du module restauration : masquée si le bar n'a pas la cuisine
   * activée (§3). Sur un bar pur, l'entrée n'existe pas — pas un item grisé,
   * pas un item vide : « un bar pur ne doit pas être PRESQUE inchangé, il doit
   * être STRICTEMENT identique ».
   */
  requiresRestaurant?: boolean;
}

/** Groupe de menus repliable. Tous se comportent pareil : icône, libellé, chevron. */
interface MenuGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

/** Clé de persistance des groupes ouverts (même registre que selectedBarId). */
const OPEN_GROUPS_STORAGE_KEY = 'bartender_sidebar_open_groups';

/**
 * Groupe ouvert au tout premier usage : ses écrans sont les plus utilisés, ils ne
 * doivent pas coûter un clic de plus. Il reste repliable comme les autres — un
 * chevron qui ne se replierait jamais serait un contrôle menteur.
 */
const DEFAULT_OPEN_GROUP_ID = 'sale';

export function MobileSidebar({
  isOpen,
  onClose,
  currentMenu,
  onShowQuickSale,
}: MobileSidebarProps) {
  const { currentSession, logout } = useAuth();
  const { hasFeature } = usePlan();
  // ⭐ §3 — conditionne l'entrée Cuisine. Sur un bar pur, elle n'existe pas.
  const { hasRestaurant } = useBarContext();
  const navigate = useNavigate();
  const { showNotification } = useNotifications();
  const prefersReducedMotion = useReducedMotion();

  // 🛡️ Monitor network status
  const [isOffline, setIsOffline] = React.useState(!networkManager.isOnline());
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  // Ouverture libre : l'utilisateur ouvre et ferme ce qu'il veut, chaque groupe
  // est indépendant. Au tout premier usage, seul 'sale' est ouvert.
  const [openGroupIds, setOpenGroupIds] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
      // '' = l'utilisateur a explicitement tout replié, à distinguer de l'absence de clé.
      if (stored === null) return [DEFAULT_OPEN_GROUP_ID];
      return stored ? stored.split(',') : [];
    } catch {
      return [DEFAULT_OPEN_GROUP_ID]; // localStorage indisponible : simple perte de confort
    }
  });

  const persistOpenGroups = React.useCallback((ids: string[]) => {
    try {
      // '' plutôt que removeItem : un repli total explicite doit survivre au
      // rechargement, sinon 'sale' se rouvrirait comme au premier usage.
      localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, ids.join(','));
    } catch {
      /* non bloquant */
    }
  }, []);

  const toggleGroup = React.useCallback((id: string) => {
    setOpenGroupIds(prev => {
      const next = prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id];
      persistOpenGroups(next);
      return next;
    });
  }, [persistOpenGroups]);

  /** Ouvre un groupe sans toucher aux autres (auto-ouverture du groupe actif). */
  const openGroup = React.useCallback((id: string) => {
    setOpenGroupIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistOpenGroups(next);
      return next;
    });
  }, [persistOpenGroups]);

  React.useEffect(() => {
    return networkManager.subscribe(() => {
      setIsOffline(!networkManager.isOnline());
    });
  }, []);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    onClose();
  };

  const menuItems: MenuItem[] = [
    // Super Admin menus
    { id: 'adminDashboard', label: 'Dashboard Admin', icon: <ShieldCheck size={20} />, roles: ['super_admin'], path: '/admin' },
    { id: 'globalCatalog', label: 'Catalogue Global', icon: <Globe size={20} />, roles: ['super_admin'], path: '/admin/catalog' },
    { id: 'barsManagement', label: 'Gestion des Bars', icon: <Building2 size={20} />, roles: ['super_admin'], path: '/admin/bars' },
    { id: 'usersManagement', label: 'Gestion des Utilisateurs', icon: <UserCog size={20} />, roles: ['super_admin'], path: '/admin/users' },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={20} />, roles: ['super_admin'], path: '/admin/notifications' },
    { id: 'auditLogs', label: 'Audit Logs', icon: <FileText size={20} />, roles: ['super_admin'], path: '/admin/audit-logs' },

    // Regular menus
    { id: 'home', label: 'Accueil', icon: <Home size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/' },
    { id: 'quickSale', label: 'Vente rapide', icon: <Zap size={20} />, roles: ['promoteur', 'gerant', 'serveur'], action: onShowQuickSale },
    { id: 'dailyDashboard', label: 'Tableau de bord', icon: <Calendar size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/dashboard' },
    { id: 'history', label: 'Historique', icon: <BarChart3 size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/sales' },
    { id: 'inventory', label: 'Inventaire', icon: <Package size={20} />, roles: ['promoteur', 'gerant'], path: '/inventory' },
    // ⭐ UNE SEULE entrée cuisine, après Inventaire — même registre mental (§9).
    // Elle mène à une page à onglets, comme Inventaire : pas quatre entrées.
    // ⚠️ Le SERVEUR en est absent volontairement : « il ne gère pas la cuisine,
    // il vend des plats — lui ajouter un menu serait une erreur » (§9).
    { id: 'kitchen', label: 'Cuisine', icon: <ChefHat size={20} />, roles: ['promoteur', 'gerant', 'cuisinier'], path: '/kitchen/ingredients', requiresRestaurant: true },
    // { id: 'stockAlerts', label: 'Prévisions et IA', icon: <TrendingUp size={20} />, roles: ['promoteur', 'gerant'], path: '/forecasting' },
    { id: 'returns', label: 'Retours', icon: <RotateCcw size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/returns' },
    { id: 'consignments', label: 'Consignations', icon: <Archive size={20} />, roles: ['promoteur', 'gerant', 'serveur'], path: '/consignments' },
    { id: 'teamManagement', label: 'Mon équipe', icon: <UserCog size={20} />, roles: ['promoteur', 'gerant'], path: '/team' },
    { id: 'promotions', label: 'Promotions', icon: <Gift size={20} />, roles: ['promoteur', 'gerant'], path: '/promotions', feature: 'promotions' },
    { id: 'settings', label: 'Paramètres', icon: <Settings size={20} />, roles: ['promoteur', 'gerant'], path: '/settings' },
    { id: 'profile', label: 'Mon Profil', icon: <User size={20} />, roles: ['super_admin', 'promoteur', 'gerant', 'serveur'], path: '/profil' },
    { id: 'subscription', label: 'Abonnement', icon: <CreditCard size={20} />, roles: ['promoteur', 'gerant'], path: '/subscription' },
    { id: 'accounting', label: 'Comptabilité', icon: <DollarSign size={20} />, roles: ['promoteur'], path: '/accounting', feature: 'accounting' }
  ];

  const isVisible = (item: MenuItem) =>
    !!currentSession && item.roles.includes(currentSession.role)
    && (!item.feature || hasFeature(item.feature))
    // ⭐ §3 — sur un bar pur, l'entrée cuisine n'apparaît pas du tout.
    //    `hasRestaurant` exige déjà le mode complet (§13.4).
    && (!item.requiresRestaurant || hasRestaurant);

  const visibleMenus = menuItems.filter(isVisible);
  const byId = (id: string) => menuItems.find(m => m.id === id);

  /**
   * Regroupement (promoteur/gérant uniquement). Le serveur garde une liste plate :
   * avec ~6 entrées, des tiroirs seraient de la complexité gratuite.
   */
  const isGrouped = currentSession?.role === 'promoteur' || currentSession?.role === 'gerant';

  /**
   * Construit un groupe à partir des items réellement visibles pour le rôle/plan.
   * Un groupe peut légitimement n'avoir qu'un item selon les permissions (ex: le
   * gérant n'a pas canViewAccounting, donc Finances = Abonnement seul). Il garde
   * malgré tout son entête : une entrée isolée entre deux groupes casserait la
   * régularité de la liste, et le libellé du groupe porte le contexte.
   */
  const buildGroup = (id: string, label: string, icon: React.ReactNode, itemIds: string[]): MenuGroup | null => {
    const items = itemIds.map(byId).filter((m): m is MenuItem => !!m && isVisible(m));
    return items.length > 0 ? { id, label, icon, items } : null;
  };

  const menuGroups: MenuGroup[] = isGrouped
    ? ([
        // ShoppingCart et non Zap : Zap identifie déjà « Vente rapide » dans ce groupe.
        buildGroup(DEFAULT_OPEN_GROUP_ID, 'Vente', <ShoppingCart size={18} />, ['home', 'quickSale', 'dailyDashboard', 'history']),
        // Icones d entete distinctes de celles des items qu ils contiennent :
        // Boxes vs Package (Inventaire), Wallet vs DollarSign (Comptabilite).
        // ⚠️ 'kitchen' listé ICI, sinon l'entrée serait invisible pour promoteur
        //    et gérant : les groupes énumèrent leurs items explicitement.
        //    Placée après 'inventory' — même registre mental (§9). Le filtre
        //    isVisible la retire d'office sur un bar pur.
        buildGroup('stock', 'Produits et stock', <Boxes size={18} />, ['returns', 'consignments', 'inventory', 'kitchen']),
        buildGroup('management', 'Finances', <Wallet size={18} />, ['accounting', 'subscription']),
        buildGroup('people', 'Personnel', <Users size={18} />, ['profile', 'teamManagement']),
        buildGroup('config', 'Configuration', <Settings size={18} />, ['promotions', 'settings']),
      ].filter((g): g is MenuGroup => g !== null))
    : [];

  // Le groupe contenant l'écran courant s'ouvre de lui-même : sans ça, l'utilisateur
  // ne voit plus où il se trouve.
  const activeGroupId = menuGroups.find(
    g => g.items.some(item => item.id === currentMenu)
  )?.id;

  // ⭐ Uniquement à la transition fermée → ouverte : l'auto-ouverture ne doit jamais
  // rouvrir un groupe que l'utilisateur vient de replier à la main.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current && activeGroupId) {
      openGroup(activeGroupId);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, activeGroupId, openGroup]);

  const renderMenuItem = (item: MenuItem) => {
    const isDisabled = item.id === 'quickSale' && isOffline;

    return (
      <motion.button
        key={item.id}
        onClick={() => {
          if (isDisabled) {
            showNotification('error', "Vente rapide indisponible hors connexion. Utilisez l'onglet Accueil (Panier).");
            return;
          }
          if (item.path) {
            navigate(item.path);
          } else if (item.action) {
            item.action();
          }
          onClose();
        }}
        whileHover={isDisabled || prefersReducedMotion ? undefined : 'hover'}
        whileTap={isDisabled || prefersReducedMotion ? undefined : 'tap'}
        variants={{
          hover: { scale: 1.02, x: 4 },
          tap: { scale: 0.98 },
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${currentMenu === item.id
          ? currentSession?.role === 'super_admin'
            ? 'bg-purple-600 text-white shadow-md'
            : 'bg-brand-primary text-white shadow-md'
          : isDisabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
            : 'bg-card/60 text-foreground/80 hover:bg-card hover:shadow-sm'
          }`}
      >
        <motion.span
          variants={{ hover: { scale: 1.15, rotate: -8 } }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className={currentMenu === item.id ? 'text-white' : (isDisabled ? 'text-muted-foreground/60' : (currentSession?.role === 'super_admin' ? 'text-purple-600' : 'text-brand-primary'))}
        >
          {item.icon}
        </motion.span>
        <span className="font-medium">{item.label}</span>
      </motion.button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110]"
          />

          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed top-0 left-0 bottom-0 w-72 shadow-2xl z-[120] flex flex-col ${currentSession?.role === 'super_admin'
              ? 'bg-gradient-to-br from-purple-50 to-indigo-50'
              : 'bg-brand-subtle'
              }`}
          >
            <div className={`flex items-center justify-between p-4 border-b ${currentSession?.role === 'super_admin'
              ? 'border-purple-200 bg-gradient-to-r from-purple-600 to-indigo-600'
              : 'border-brand-subtle bg-brand-gradient'
              }`}>
              <div className="flex items-center gap-2">
                {currentSession?.role === 'super_admin' && (
                  <img src="/icons/icon-48x48.png" alt="BarTender" className="w-6 h-6 flex-shrink-0 rounded" />
                )}
                <h2 className="text-white font-bold text-lg">
                  {currentSession?.role === 'super_admin' ? 'BarTender Pro Administration' : 'Menu'}
                </h2>
              </div>
              <IconButton onClick={onClose} className="text-white hover:bg-card/20 p-2 rounded-lg transition-colors" aria-label="Fermer le menu">
                <X size={24} />
              </IconButton>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {isGrouped
                ? menuGroups.map((group) => {
                  const isGroupOpen = openGroupIds.includes(group.id);
                  const hasActiveItem = group.items.some(item => item.id === currentMenu);

                  return (
                    <div key={group.id} className="mb-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={isGroupOpen}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${hasActiveItem && !isGroupOpen
                          ? 'bg-card text-foreground font-semibold'
                          : 'text-foreground/80 hover:bg-card/70'
                          }`}
                      >
                        <span className={currentSession?.role === 'super_admin' ? 'text-purple-600' : 'text-brand-primary'}>
                          {group.icon}
                        </span>
                        <span className="font-medium flex-1 text-left">{group.label}</span>
                        <motion.span
                          animate={{ rotate: isGroupOpen ? 180 : 0 }}
                          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
                          className="text-foreground/50"
                        >
                          <ChevronDown size={18} />
                        </motion.span>
                      </button>

                      {isGroupOpen && (
                        <div className="mt-1 ml-3 pl-2 border-l border-brand-subtle">
                          {group.items.map(renderMenuItem)}
                        </div>
                      )}
                    </div>
                  );
                })
                : visibleMenus.map(renderMenuItem)}
            </div>

            <div className={`p-4 border-t space-y-2 ${currentSession?.role === 'super_admin' ? 'border-purple-200' : 'border-brand-subtle'}`}>
              <motion.button
                onClick={handleLogout}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors shadow-md"
              >
                <LogOut size={20} />
                <span>Déconnexion</span>
              </motion.button>
            </div>
          </motion.div>

          <ConfirmationModal
            isOpen={showLogoutConfirm}
            onClose={() => setShowLogoutConfirm(false)}
            onConfirm={confirmLogout}
            title="Déconnexion"
            message="Voulez-vous vraiment vous déconnecter ?"
            confirmLabel="Déconnexion"
            cancelLabel="Annuler"
            isDestructive={true}
          />
        </>
      )}
    </AnimatePresence>
  );
}
