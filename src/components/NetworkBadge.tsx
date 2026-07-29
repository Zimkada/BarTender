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
        title="Pas de connexion internet - ce n'est pas l'application"
      >
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
        {/* ⭐ Libellé TOUJOURS visible, y compris sous 420px : sur mobile il n'y a pas
            de survol, donc une pastille rouge sans texte n'explique rien. Le promoteur
            doit pouvoir attribuer la panne à sa connexion, pas à l'application. */}
        <span>Hors ligne</span>
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
        title={`Connexion lente${typeSuffix} - l'application attend le réseau`}
      >
        <Activity className="w-3.5 h-3.5 flex-shrink-0" />
        {/* Libellé court pour tenir à 360px sans pousser les autres icônes. */}
        <span>Réseau lent</span>
      </div>
    );
  }

  return null;
}
