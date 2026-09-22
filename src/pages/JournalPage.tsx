// src/pages/JournalPage.tsx
// Journal d'activite du bar - Phase 2, chantier co-promoteur.
//
// Deplace hors de /accounting (voir docs/roadmaps/PLAN_CO_PROMOTEUR_PHASE2.md) :
// le journal n'est pas une donnee financiere, c'est un audit d'activite. Le
// melanger aux onglets Revenus/Depenses laissait croire qu'il en faisait
// partie.

import { History } from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { SimplePageHeader } from '../components/common/PageHeader/patterns/SimplePageHeader';
import { BarActivityJournal } from '../components/accounting/BarActivityJournal';

/**
 * JournalPage - Page de menu (nav principale), Route: /journal
 * Protegee par canViewAccounting (routes/index.tsx) : vrai pour super_admin,
 * promoteur, co_promoteur - exactement les roles admis par le garde SQL du
 * RPC get_bar_audit_logs. Aucun bouton actif ne peut donc mener a un refus
 * serveur (le defaut corrige 4 fois en Phase 1 du chantier co-promoteur).
 */
export default function JournalPage() {
  const { currentBar } = useBarContext();

  if (!currentBar) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-body-sm text-muted-foreground">
          Sélectionnez un bar pour consulter son journal d'activité.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <SimplePageHeader
        title="Journal"
        subtitle={`Activité de ${currentBar.name}`}
        icon={<History size={24} />}
      />

      <div className="bg-card rounded-2xl shadow-sm border border-brand-subtle p-4 md:p-6 mt-4">
        <BarActivityJournal />
      </div>
    </div>
  );
}
