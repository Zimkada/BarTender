import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExpensesService } from '../../services/supabase/expenses.service';
import { auditLogger } from '../../services/AuditLogger';

// Input shape for createExpense mutation (camelCase from domain)
interface CreateExpenseInput {
    barId: string;
    category: string;
    customCategoryId?: string;
    amount: number;
    description?: string;
    createdBy: string;
    date?: Date;
}
import { expenseKeys } from '../queries/useExpensesQueries';
import { analyticsKeys } from '../queries/useAnalyticsQueries';

export const useExpensesMutations = (barId: string) => {
    const queryClient = useQueryClient();

    const createExpense = useMutation({
        // ⚠️ PAS de retry automatique : createExpense n'a pas d'idempotency_key côté serveur.
        // Un retry sur réponse perdue créerait une double dépense en comptabilité.
        // Réactiver quand l'idempotence backend sera en place (Layer 4C).
        retry: false,
        mutationFn: async (data: CreateExpenseInput) => {
            // Mapping App -> DB
            const expenseData = {
                bar_id: data.barId,
                category: data.category,
                custom_category_id: data.customCategoryId,
                amount: data.amount,
                description: data.description,
                created_by: data.createdBy,
                expense_date: data.date ? data.date.toISOString() : new Date().toISOString(),
            };
            return ExpensesService.createExpense(expenseData);
        },
        onSuccess: (created, variables) => {
            // expenses_summary est une vue normale (migration 070) — pas de refresh DB nécessaire
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Dépense enregistrée');
            });

            // ⭐ Chantier B2 - journalise la sortie d'argent pour que le promoteur
            // la voie dans get_bar_audit_logs. auditLogger.log() avale ses propres
            // erreurs : un journal indisponible ne fera jamais echouer la depense.
            auditLogger.log({
                event: 'EXPENSE_CREATED',
                severity: 'info',
                barId: variables.barId,
                description: `Dépense de ${variables.amount} FCFA (${variables.category})`,
                metadata: {
                    amount: variables.amount,
                    category: variables.category,
                    custom_category_id: variables.customCategoryId,
                    description: variables.description,
                },
                // ⚠️ relatedEntityType conditionne a la presence de l'id : les
                // deux colonnes vont de pair en base, un type sans id ne
                // rattache rien et rend la ligne plus confuse qu'utile.
                relatedEntityId: created?.id,
                relatedEntityType: created?.id ? 'expense' : undefined,
            });

            queryClient.invalidateQueries({ queryKey: expenseKeys.list(barId) });
            if (barId) { queryClient.invalidateQueries({ predicate: analyticsKeys.barPredicate(barId) }); }
        },
    });

    const deleteExpense = useMutation({
        mutationFn: ExpensesService.deleteExpense,
        // ⚠️ Le montant est resolu AVANT l'appel : onSuccess s'execute apres la
        //    suppression, et l'invalidation qui suit vide le cache. Sans ce
        //    releve prealable, le journal ne pourrait dire QUE "une depense a
        //    ete supprimee" - sans montant, l'entree n'a aucune valeur pour le
        //    promoteur, qui ne saura pas si on lui a efface 500 ou 500 000 FCFA.
        //
        //    ExpensesService.deleteExpense ne recoit que l'id : changer sa
        //    signature toucherait tous ses appelants pour un besoin de
        //    journalisation. Le cache est deja charge par l'ecran qui declenche
        //    la suppression, donc ce releve ne coute aucune requete.
        //
        //    ⚠️ LIMITE ASSUMEE : le releve echoue si la depense n'est dans
        //    aucune entree de cache (refetch en vol, ou suppression declenchee
        //    depuis une plage de dates qui ne la contient pas). Le log part
        //    alors sans montant plutot que de couter une requete
        //    supplementaire a chaque suppression. Le cas est rendu explicite
        //    dans la description ET dans metadata.amount_unavailable, pour
        //    qu'une entree sans montant ne soit pas lue comme un montant nul.
        onMutate: (expenseId: string) => {
            // La cle de cache inclut `options` ([...list(barId), options]), donc
            // plusieurs entrees coexistent selon la plage de dates affichee :
            // getQueryData(list(barId)) seul ne trouverait rien.
            const entries = queryClient.getQueriesData<Array<{ id: string; amount: number; category?: string }>>(
                { queryKey: expenseKeys.list(barId) }
            );
            for (const [, data] of entries) {
                const found = data?.find((e) => e.id === expenseId);
                if (found) {
                    return { amount: found.amount, category: found.category };
                }
            }
            return { amount: undefined, category: undefined };
        },
        onSuccess: (_result, expenseId, context) => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Dépense supprimée');
            });

            // ⭐ Chantier B2 - severity 'warning' : la suppression d'une depense
            // est irreversible et modifie la comptabilite du bar.
            //
            // ⚠️ Garde sur barId : AppProvider le derive en `currentBar?.id || ''`
            // (AppProvider.tsx:70). Une chaine vide devient `undefined` dans
            // AuditLogger, donc `bar_id` NULL en base, donc une ligne INVISIBLE
            // pour get_bar_audit_logs dont le WHERE bar_id est obligatoire.
            // Mieux vaut ne pas journaliser que d'ecrire une ligne que personne
            // ne pourra jamais relire. createExpense n'a pas ce probleme : il
            // utilise variables.barId, fourni par l'appelant.
            if (barId) {
                auditLogger.log({
                    event: 'EXPENSE_DELETED',
                    severity: 'warning',
                    barId,
                    description: context?.amount !== undefined
                        ? `Dépense de ${context.amount} FCFA supprimée`
                        : 'Dépense supprimée (montant non disponible)',
                    metadata: {
                        amount: context?.amount,
                        category: context?.category,
                        // Distingue "montant inconnu" de "montant nul" pour
                        // qui relira cette entree.
                        amount_unavailable: context?.amount === undefined,
                    },
                    relatedEntityId: expenseId,
                    relatedEntityType: 'expense',
                });
            }

            queryClient.invalidateQueries({ queryKey: expenseKeys.list(barId) });
            if (barId) { queryClient.invalidateQueries({ predicate: analyticsKeys.barPredicate(barId) }); }
        },
    });


    const createCustomCategory = useMutation({
        mutationFn: async (data: { name: string; icon?: string; createdBy: string }) => {
            const categoryData = {
                bar_id: barId,
                name: data.name,
                icon: data.icon,
                is_active: true,
                created_by: data.createdBy,
            };
            return ExpensesService.createCustomCategory(categoryData);
        },
        onSuccess: () => {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Catégorie créée');
            });
            queryClient.invalidateQueries({ queryKey: expenseKeys.categories(barId) });
        },
    });

    return {
        createExpense,
        deleteExpense,
        createCustomCategory,
    };
};
