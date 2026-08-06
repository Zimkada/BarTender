/**
 * BatchAlertBanner
 * Alerte de lot épuisé, en tête de l'écran Service — §16.8, phase 3B.
 *
 * ⭐⭐ INFORMER PENDANT QU'IL RESTE DU TEMPS.
 * `accept_kitchen_item` refuse déjà de démarrer un plat sans lot, mais il est
 * RÉACTIF : le cuisinier découvre le problème devant une table qui attend.
 * Ce bandeau signale la rupture dès qu'elle survient.
 *
 * ⚠️ EN TÊTE DE L'ÉCRAN SERVICE, pas dans une page à part. Le cuisinier ne va
 * pas chercher une alerte : elle doit être là où il regarde déjà.
 *
 * ⛔ AUCUNE REQUÊTE PROPRE — `useBatchAlerts` croise des données déjà en
 * cache pour cet écran (§3).
 */

import { AlertTriangle, ChefHat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useBatchAlerts } from '../../hooks/pivots/useBatchAlerts';
import { cn } from '../../lib/utils';

interface Props {
  barId: string | undefined;
}

export function BatchAlertBanner({ barId }: Props) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { alerts, hasAlerts } = useBatchAlerts(barId);

  /**
   * ⚠️ Le SERVEUR voit l'alerte mais pas le bouton : produire un lot consomme
   * du stock, ce n'est pas son métier (même règle que la page Production).
   * ⭐ Il la voit quand même — c'est lui qui prévient le client que le plat
   * prendra plus de temps.
   */
  const canProduce = hasPermission('canManageIngredientStock');

  if (!hasAlerts) return null;

  return (
    <div className="mt-3 space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.baseDishId}
          className={cn(
            'rounded-xl border p-3',
            alert.isEmpty
              ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
          )}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className={cn(
                'mt-0.5 flex-shrink-0',
                alert.isEmpty
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            />
            <div className="min-w-0 flex-1">
              {/* ⭐ Le titre dit CE QUI MANQUE, pas « attention ». */}
              <p
                className={cn(
                  'text-body-sm font-medium',
                  alert.isEmpty
                    ? 'text-red-900 dark:text-red-200'
                    : 'text-amber-900 dark:text-amber-200'
                )}
              >
                {alert.isEmpty
                  ? `Plus de ${alert.baseDishName}`
                  : `${alert.baseDishName} bientôt épuisé`}
              </p>

              {/* ⚠️ Le CHIFFRE rend l'alerte actionnable : « il manque 3
                  portions » dit quoi faire, « le lot est vide » ne dit rien
                  de l'urgence. */}
              <p className="mt-0.5 text-caption text-muted-foreground">
                {alert.availableQty} portion{alert.availableQty > 1 ? 's' : ''}{' '}
                disponible{alert.availableQty > 1 ? 's' : ''} pour{' '}
                {alert.neededQty} commandée{alert.neededQty > 1 ? 's' : ''}
                {alert.affectedDishNames.length > 0 && (
                  <> · {alert.affectedDishNames.join(', ')}</>
                )}
              </p>

              {/* ⭐ On NOMME l'alternative, comme le refus du serveur : une
                  alerte sans issue ne sert qu'à inquiéter. */}
              <p className="mt-1 text-caption text-muted-foreground">
                Produisez un lot, ou préparez ces plats à la commande.
              </p>
            </div>

            {canProduce && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/kitchen/production')}
                className="flex-shrink-0"
              >
                <ChefHat size={14} className="mr-1.5" />
                Produire
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

BatchAlertBanner.displayName = 'BatchAlertBanner';
