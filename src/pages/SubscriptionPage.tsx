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
        <div className="max-w-4xl mx-auto space-y-6 pb-32 px-4">
            <SimplePageHeader
                title="Abonnement"
                subtitle="Statut et paiement de votre abonnement."
                icon={<CreditCard size={24} />}
            />

            {/* Conteneur bg-card + text-foreground : la section heritait du contexte
                de couleur de SettingsPage. Isolee, elle doit le porter elle-meme,
                sinon son texte reste sombre sur fond sombre en theme dark. */}
            <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-4 sm:p-6">
                <MySubscriptionSection barId={currentBar.id} barName={currentBar.name} />
            </div>
        </div>
    );
}

SubscriptionPage.displayName = 'SubscriptionPage';
