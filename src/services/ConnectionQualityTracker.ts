/**
 * Collecteur en mémoire des signaux de dégradation réseau, entre deux
 * heartbeats. Ne persiste rien (pas d'IndexedDB) : c'est un compteur "depuis
 * le dernier relevé", remis à zéro à chaque lecture — pas un historique.
 *
 * Objectif : distinguer un bar réellement "en ligne" (heartbeat récent) d'un
 * bar dont l'appareil répond mais dont les opérations réelles (ventes) rament
 * ou échouent en boucle — le scénario "l'app ne marche pas" côté utilisateur
 * qui reste invisible avec un simple statut de présence.
 *
 * Deux producteurs :
 * - SalesService.createSale : incrémente saleTimeouts à chaque tentative
 *   transitoire ratée (timeout/network) sur le RPC de vente.
 * - NetworkManager : incrémente networkDrops à chaque transition vers
 *   'unstable' ou 'offline'.
 *
 * Un seul consommateur : useHeartbeat, qui lit puis reset à chaque envoi.
 */
class ConnectionQualityTrackerService {
    private saleTimeouts = 0;
    private networkDrops = 0;

    recordSaleTimeout(): void {
        this.saleTimeouts++;
    }

    recordNetworkDrop(): void {
        this.networkDrops++;
    }

    /** Lit les compteurs sans les modifier. */
    peek(): { saleTimeouts: number; networkDrops: number } {
        return { saleTimeouts: this.saleTimeouts, networkDrops: this.networkDrops };
    }

    /**
     * Retire du compteur exactement la quantité confirmée transmise (pas un
     * reset absolu à zéro). À appeler avec le snapshot retourné par peek() au
     * même cycle, une fois le heartbeat confirmé envoyé.
     *
     * Pourquoi pas un simple reset(0) : entre le peek() (avant l'appel réseau
     * du RPC) et la confirmation de succès, un nouvel événement peut survenir
     * ailleurs dans l'app (ex: une vente échoue pendant que le heartbeat est
     * en vol). Un reset absolu effacerait cet événement sans qu'il ait jamais
     * été transmis. La soustraction le préserve pour le prochain heartbeat.
     */
    acknowledge(sent: { saleTimeouts: number; networkDrops: number }): void {
        this.saleTimeouts = Math.max(0, this.saleTimeouts - sent.saleTimeouts);
        this.networkDrops = Math.max(0, this.networkDrops - sent.networkDrops);
    }
}

export const connectionQualityTracker = new ConnectionQualityTrackerService();
