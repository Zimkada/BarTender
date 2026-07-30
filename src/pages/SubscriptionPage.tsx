import { CreditCard } from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { SimplePageHeader } from '../components/common/PageHeader/patterns/SimplePageHeader';
import { MySubscriptionSection } from '../components/settings/MySubscriptionSection';

/**
 * SubscriptionPage - Abonnement du bar courant (promoteur/gérant)
 * Route: /subscription
 *
 * Extrait de l'onglet "Fonctionnement" de SettingsPage : le paiement de
 * l'abonnement n'est pas un réglage, il a sa propre entrée de menu.
 */
export default function SubscriptionPage() {
    const { currentBar } = useBarContext();

    if (!currentBar) return null;

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6">
            <SimplePageHeader
                title="Abonnement"
                subtitle="Statut et paiement de votre abonnement."
                icon={<CreditCard size={24} />}
            />

            <MySubscriptionSection barId={currentBar.id} barName={currentBar.name} />
        </div>
    );
}

SubscriptionPage.displayName = 'SubscriptionPage';
