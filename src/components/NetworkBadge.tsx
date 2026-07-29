/**
 * NetworkBadge - Badge compact d'indicateur réseau pour le header
 *
 * Affiche un badge discret dans le header au lieu d'un banner pleine largeur
 */

import { WifiOff, Activity } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function NetworkBadge() {
  const { isOnline, isSlowConnection, effectiveType } = useNetworkStatus();

  // Online + connexion normale = pas d'affichage
  if (isOnline && !isSlowConnection) {
    return null;
  }

  // Badge offline (prioritaire)
  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-red-500/90 rounded-md text-white text-xs font-medium"
        title="Mode hors ligne - Certaines fonctionnalités sont limitées"
      >
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
        {/* Libellé masqué sur petit écran (icône + couleur suffisent) — le title reste. */}
        <span className="hidden min-[420px]:inline">Hors ligne</span>
      </div>
    );
  }

  // Badge connexion lente
  if (isSlowConnection) {
    // effectiveType n'est pas toujours renseigné (API réseau partielle sur iOS/Safari,
    // ou lenteur détectée via rtt/downlink seuls) → libellé fixe "Connexion lente"
    // plutôt que "Connexion {type}" qui afficherait "Connexion " vide. Le type précis,
    // s'il existe, va dans le title uniquement.
    const typeSuffix = effectiveType ? ` (${effectiveType.toUpperCase()})` : '';
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/90 rounded-md text-white text-xs font-medium"
        title={`Connexion lente${typeSuffix} - Chargement optimisé`}
      >
        <Activity className="w-3.5 h-3.5 flex-shrink-0" />
        {/* Libellé masqué sur petit écran (icône + couleur suffisent) — le title reste. */}
        <span className="hidden min-[420px]:inline">Connexion lente</span>
      </div>
    );
  }

  return null;
}
