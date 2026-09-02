import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Package,
  Zap,
  RotateCcw,
  LayoutDashboard,
  ChefHat
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import type { UserRole } from '../types';
import { useViewport } from '../hooks/useViewport';
import { networkManager } from '../services/NetworkManager';
import { useNotifications } from './Notifications';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path?: string;
  onClick?: () => void;
  color: string;
  /**
   * ⚠️ Aligné sur `UserRole` : l'union figée précédente ignorait `cuisinier`,
   * et le filtre passant par un cast `as readonly string[]`, le compilateur ne
   * signalait rien — un cuisinier obtenait une barre VIDE (un bandeau de 64 px
   * sans aucun bouton).
   */
  roles: UserRole[];
  /**
   * ⭐ Entrée du module restauration : masquée si le bar n'a pas la cuisine
   * activée (§3).
   */
  requiresRestaurant?: boolean;
}

interface MobileNavigationProps {
  onShowQuickSale: () => void;
}

export function MobileNavigation({ onShowQuickSale }: MobileNavigationProps) {
  const { currentSession } = useAuth();
  // ⭐ §3 — conditionne l'entrée cuisine du cuisinier.
  const { hasRestaurant } = useBarContext();
  const { isMobile } = useViewport();
  const navigate = useNavigate();
  const { showNotification } = useNotifications();

  // 🛡️ Monitor network status
  const [isOffline, setIsOffline] = React.useState(!networkManager.isOnline());

  React.useEffect(() => {
    return networkManager.subscribe(() => {
      setIsOffline(!networkManager.isOnline());
    });
  }, []);

  if (!isMobile) {
    return null;
  }

  const allNavItems: NavItem[] = [
    {
      icon: <Zap size={24} />,
      label: 'Vente',
      onClick: () => {
        if (isOffline) {
          showNotification('error', "Vente rapide indisponible hors connexion. Utilisez l'onglet Panier.");
          return;
        }
        onShowQuickSale();
      },
      color: isOffline ? 'text-muted-foreground opacity-40' : 'text-brand-primary',
      roles: ['promoteur', 'co_promoteur', 'gerant', 'serveur']
    },
    {
      icon: <LayoutDashboard size={24} />,
      // ... rest of the items ...
      label: 'Dashboard',
      path: '/dashboard',
      color: 'text-blue-600',
      roles: ['promoteur', 'co_promoteur', 'gerant', 'serveur']
    },
    {
      icon: <BarChart3 size={24} />,
      label: 'Historique',
      path: '/sales',
      color: 'text-purple-600',
      roles: ['promoteur', 'co_promoteur', 'gerant', 'serveur']
    },
    {
      icon: <Package size={24} />,
      label: 'Inventaire',
      path: '/inventory',
      color: 'text-green-600',
      roles: ['promoteur', 'co_promoteur', 'gerant']
    },
    /* {
      icon: <TrendingUp size={24} />,
      label: 'Prévisions et IA',
      path: '/forecasting',
      color: 'text-indigo-600',
      roles: ['promoteur', 'co_promoteur', 'gerant']
    }, */
    {
      icon: <RotateCcw size={24} />,
      label: 'Retours',
      path: '/returns',
      color: 'text-red-600',
      roles: ['promoteur', 'co_promoteur', 'gerant', 'serveur']
    },
    {
      // ⭐ CUISINIER UNIQUEMENT (§9) : « Autres rôles : ne rien ajouter,
      //    plafond atteint. La Cuisine reste au menu latéral. »
      //    Sans cette entrée, le cuisinier voyait une barre VIDE — un bandeau
      //    de 64 px sans aucun bouton.
      // ⚠️ §9 prévoit 3 items pour lui (Commandes / Recettes / Ingrédients) ;
      //    les deux premiers arrivent en phases 2 et 3.
      icon: <ChefHat size={24} />,
      label: 'Ingrédients',
      path: '/kitchen/ingredients',
      color: 'text-amber-600',
      roles: ['cuisinier'],
      requiresRestaurant: true
    }
    // ❌ Retiré : « Import/Export » → /settings. La barre ne rend que 5 entrées et
    // le promoteur en avait 6 : cet item était tronqué, donc invisible pour lui et
    // affiché pour le gérant seul. Les Paramètres restent au menu latéral.
  ];

  const navItems = allNavItems.filter(item =>
    currentSession?.role
      ? item.roles.includes(currentSession.role)
        // ⭐ §3 — sur un bar pur, l'entrée cuisine n'apparaît pas.
        && (!item.requiresRestaurant || hasRestaurant)
      : false
  );

  // ⭐ Garde-fou : la barre ne tient que 5 entrées. Le slice ne doit JAMAIS avoir
  // à tronquer — si un rôle dépasse, l'item surnuméraire disparaîtrait sans aucun
  // signal (c'était le cas d'Import/Export pour le promoteur). Toute nouvelle
  // entrée doit donc être arbitrée ici, pas ajoutée à la liste.
  const MAX_VISIBLE_ITEMS = 5;
  if (import.meta.env.DEV && navItems.length > MAX_VISIBLE_ITEMS) {
    console.warn(
      `[MobileNavigation] ${navItems.length} entrées pour le rôle "${currentSession?.role}" ` +
      `alors que la barre en affiche ${MAX_VISIBLE_ITEMS} : "${navItems[MAX_VISIBLE_ITEMS].label}" est masquée.`
    );
  }
  const displayedItems = navItems.slice(0, MAX_VISIBLE_ITEMS);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-40 pb-safe">
      <div className="flex justify-around items-center h-16">
        {displayedItems.map((item, index) => (
          <button
            key={index}
            onClick={item.path ? () => navigate(item.path!) : item.onClick}
            className="flex-1 flex flex-col items-center justify-center gap-1 h-full active:bg-brand-primary/5 transition-colors"
            aria-label={item.label}
            {...(index === 0 ? { 'data-guide': 'quick-sale-btn' } : {})}
          >
            <span className={item.color}>
              {item.icon}
            </span>
            <span className="text-xs font-medium text-foreground/80">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
