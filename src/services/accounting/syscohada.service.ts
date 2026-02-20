import { AccountingTransaction, CapitalContribution, TransactionType, ExpenseCategory } from '../../types';
import {
    AccountingEntry,
    BarAccountingConfig,
} from './syscohada.types';
import { format } from 'date-fns';
// xlsx est importé dynamiquement dans exportJournalExcel pour éviter de l'inclure dans le bundle principal

export class SyscohadaTranslator {
    /**
     * Génère un numéro de pièce métier (Ex: VTE-2602-005)
     */
    private static generatePieceIdentifier(date: Date, type: TransactionType, index: number): string {
        const monthYear = format(date, 'MMyy'); // Ex: 0226
        const yymmdd = format(date, 'yyMMdd');
        const num = String(index + 1).padStart(3, '0'); // 001, 002...

        switch (type) {
            case 'sale': return `Z-${yymmdd}-${num}`; // Z de Caisse (Aggregation)
            case 'expense': return `ACH-${monthYear}-${num}`;
            case 'salary': return `SAL-${monthYear}-${num}`;
            case 'supply': return `APP-${monthYear}-${num}`;
            case 'initial_balance': return `BAL-${monthYear}-${num}`;
            case 'return': return `RET-${monthYear}-${num}`;
            case 'consignment': return `CSG-${monthYear}-${num}`;
            default: return `OD-${monthYear}-${num}`;
        }
    }

    private static getTreasuryAccount(paymentMethod?: string): string {
        switch (paymentMethod) {
            case 'mobile_money': return '5212';
            case 'card': return '5211';
            case 'credit': return '411'; // Clients (vente à crédit, encaissement différé)
            case 'ticket': return '5711'; // Bon/ticket traité comme espèces (pré-payé par tiers)
            case 'cash':
            default: return '5711';
        }
    }

    private static getExpenseAccount(category?: string | ExpenseCategory, configMappings: Record<string, string> = {}): string {
        if (category && configMappings[category]) return configMappings[category];

        switch (category) {
            case 'supply': return '6011';
            case 'water':
            case 'electricity': return '6051';
            case 'maintenance': return '624';
            case 'investment': return '2183'; // Immobilisation
            default: return '628'; // Frais Divers
        }
    }

    /**
     * Convertit une liste de transactions brutes en lignes comptables SYSCOHADA
     */
    public static translateTransactions(
        transactions: AccountingTransaction[],
        config?: Partial<BarAccountingConfig>
    ): AccountingEntry[] {
        const entries: AccountingEntry[] = [];
        const tvaActive = config?.tvaActive ?? false;
        const tvaRate = config?.tvaRate ?? 18; // 18% par défaut UEMOA/CEMAC
        const mappings = config?.customCategoryMappings ?? {};

        let indexCount = 0;

        // 1. Agrégation des ventes pour le Z de caisse
        const saleAggr = new Map<string, { date: Date, amount: number, paymentMethod?: string }>();

        transactions.forEach((tx) => {
            if (tx.type === 'sale') {
                // businessDate est prioritaire sur date pour les bars nocturnes
                // (une vente à 2h du matin samedi appartient fiscalement au vendredi)
                const fiscalDate = tx.businessDate ?? tx.date;
                const k = `${format(new Date(fiscalDate), 'yyyy-MM-dd')}_${tx.paymentMethod || 'cash'}`;
                if (!saleAggr.has(k)) {
                    saleAggr.set(k, { date: new Date(fiscalDate), amount: 0, paymentMethod: tx.paymentMethod });
                }
                saleAggr.get(k)!.amount += Math.abs(tx.amount);
            }
        });

        saleAggr.forEach((aggrData) => {
            if (aggrData.amount === 0) return;
            const piece = this.generatePieceIdentifier(aggrData.date, 'sale', indexCount++);
            const treasuryAccount = this.getTreasuryAccount(aggrData.paymentMethod);

            // A. Débit Compte de ralliement financier
            entries.push({
                date: aggrData.date,
                journal: 'VTE',
                piece,
                accountCode: treasuryAccount,
                description: `Z de Caisse - Ventes (${aggrData.paymentMethod || 'cash'})`,
                debit: aggrData.amount,
                credit: 0
            });

            // B. Crédit Ventes
            if (tvaActive) {
                // BUG 4 FIX: Convention comptable - Arrondir TVA
                const tvaAmount = Math.round((aggrData.amount * tvaRate) / (100 + tvaRate));
                const htAmount = aggrData.amount - tvaAmount;

                entries.push({
                    date: aggrData.date,
                    journal: 'VTE',
                    piece,
                    accountCode: '7011',
                    description: `Ventes HT`,
                    debit: 0,
                    credit: htAmount
                });
                entries.push({
                    date: aggrData.date,
                    journal: 'VTE',
                    piece,
                    accountCode: '443',
                    description: `TVA facturée (${tvaRate}%)`,
                    debit: 0,
                    credit: tvaAmount
                });
            } else {
                entries.push({
                    date: aggrData.date,
                    journal: 'VTE',
                    piece,
                    accountCode: '7011',
                    description: `Ventes TTC`,
                    debit: 0,
                    credit: aggrData.amount
                });
            }
        });

        // 2. Traitement des autres opérations (Dépenses, Salaires, Retours, Apports, etc.)
        transactions.filter(t => t.type !== 'sale').forEach((tx) => {
            const piece = this.generatePieceIdentifier(new Date(tx.date), tx.type, indexCount++);
            const treasuryAccount = this.getTreasuryAccount(tx.paymentMethod);
            const amt = Math.abs(tx.amount);

            switch (tx.type) {
                case 'expense':
                case 'supply': {
                    const chargeAccount = this.getExpenseAccount(tx.category, mappings);
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'ACH',
                        piece,
                        accountCode: chargeAccount,
                        description: tx.description,
                        debit: amt,
                        credit: 0
                    });
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'ACH',
                        piece,
                        accountCode: treasuryAccount,
                        description: `Paiement: ${tx.description}`,
                        debit: 0,
                        credit: amt
                    });
                    break;
                }

                case 'salary': {
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'SAL',
                        piece,
                        accountCode: '661',
                        description: tx.description,
                        debit: amt,
                        credit: 0
                    });
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'SAL',
                        piece,
                        accountCode: treasuryAccount,
                        description: `Paiement Salaire`,
                        debit: 0,
                        credit: amt
                    });
                    break;
                }

                case 'return': {
                    // Contre-passation de vente
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'VTE',
                        piece,
                        accountCode: '7011',
                        description: `Annulation: ${tx.description}`,
                        debit: amt, // Débit du compte produit
                        credit: 0
                    });
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'VTE',
                        piece,
                        accountCode: treasuryAccount,
                        description: `Remboursement Client`,
                        debit: 0,
                        credit: amt
                    });
                    break;
                }

                case 'initial_balance': {
                    // tx.amount (valeur originale signée) détermine le sens :
                    // Positif → ouverture avec trésorerie (Crédit 101 Capital)
                    // Négatif → ouverture avec dette (Crédit 161 Emprunts)
                    const accountCap = tx.amount >= 0 ? '101' : '161';
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'OD',
                        piece,
                        accountCode: treasuryAccount,
                        description: tx.description,
                        debit: amt,
                        credit: 0
                    });
                    entries.push({
                        date: new Date(tx.date),
                        journal: 'OD',
                        piece,
                        accountCode: accountCap,
                        description: tx.description,
                        debit: 0,
                        credit: amt
                    });
                    break;
                }

                case 'consignment': {
                    // INTENTIONNELLEMENT VIDE — Aucune écriture comptable.
                    //
                    // MODÈLE MÉTIER :
                    // La consignation est un suivi de stock physique UNIQUEMENT.
                    // - Le client ne paie RIEN de plus : l'argent (ex: 500 F) a déjà été
                    //   comptabilisé lors de la vente d'origine (type: 'sale').
                    // - Les changements de statut (active → claimed, expired, forfeited)
                    //   ne génèrent AUCUN mouvement financier.
                    // - L'expiration du délai change le statut en 'expired' mais NE remet PAS
                    //   automatiquement le produit en stock vendable.
                    // - C'est le gérant qui décide MANUELLEMENT de récupérer le produit
                    //   et de le remettre en vente. Seulement à ce moment-là, une
                    //   NOUVELLE transaction 'sale' sera créée.
                    // → Zéro mouvement de trésorerie, zéro écriture SYSCOHADA.
                    break;
                }
            }
        });

        return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    /**
     * Traduit les apports en capital en lignes comptables SYSCOHADA.
     * Méthode séparée car CapitalContribution n'est pas un AccountingTransaction.
     *
     * Mapping source → compte SYSCOHADA :
     *   owner / partner / investor / other → 101 (Capital Social)
     *   loan                               → 161 (Emprunts et dettes)
     */
    public static translateCapitalContributions(
        contributions: CapitalContribution[]
    ): AccountingEntry[] {
        const entries: AccountingEntry[] = [];

        contributions.forEach((contrib, index) => {
            const piece = `CAP-${format(new Date(contrib.date), 'MMyy')}-${String(index + 1).padStart(3, '0')}`;
            const capitalAccount = contrib.source === 'loan' ? '161' : '101';
            const amt = Math.abs(contrib.amount); // amount est TOUJOURS positif selon le type

            // A. L'argent entre en trésorerie (Débit 5711 par défaut — cash/virement)
            entries.push({
                date: new Date(contrib.date),
                journal: 'OD',
                piece,
                accountCode: '5711',
                description: contrib.description,
                debit: amt,
                credit: 0
            });

            // B. Contrepartie en Capitaux (Crédit 101 ou 161)
            entries.push({
                date: new Date(contrib.date),
                journal: 'OD',
                piece,
                accountCode: capitalAccount,
                description: contrib.description,
                debit: 0,
                credit: amt
            });
        });

        return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    /**
     * Exporte les lignes comptables générées en fichier Excel SYSCOHADA prêt pour l'audit.
     * Async pour charger xlsx à la demande (lazy load, ~1MB évité au démarrage).
     */
    public static async exportJournalExcel(
        entries: AccountingEntry[],
        barInfo: { name: string, rccm?: string, ifu?: string, dateStr: string }
    ): Promise<void> {
        const XLSX = await import('xlsx');
        const worksheetData: Array<Array<string | number>> = [];

        // 1. En-tête professionnel du cabinet
        worksheetData.push(['LIVRE JOURNAL DES OPERATIONS - NORMES SYSCOHADA REVISE']);
        worksheetData.push([`Raison Sociale : ${barInfo.name}`]);
        if (barInfo.rccm) worksheetData.push([`RCCM : ${barInfo.rccm}`]);
        if (barInfo.ifu) worksheetData.push([`IFU / NINEA : ${barInfo.ifu}`]);
        worksheetData.push([`Période : ${barInfo.dateStr}`]);
        worksheetData.push([]); // Ligne vide

        // 2. Colonnes
        const headers = ['Date', 'Journal', 'N° Pièce', 'Compte', 'Intitulé Opération', 'Débit', 'Crédit'];
        worksheetData.push(headers);

        // 3. Lignes de données
        let totalDebit = 0;
        let totalCredit = 0;

        entries.forEach(entry => {
            worksheetData.push([
                format(entry.date, 'dd/MM/yyyy'),
                entry.journal,
                entry.piece,
                entry.accountCode,
                entry.description,
                entry.debit > 0 ? entry.debit : '',
                entry.credit > 0 ? entry.credit : ''
            ]);
            totalDebit += entry.debit;
            totalCredit += entry.credit;
        });

        // 4. Ligne de totaux
        worksheetData.push([]);
        worksheetData.push(['', '', '', '', 'TOTAUX', totalDebit, totalCredit]);

        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        // Style simple (largeur de colonnes)
        ws['!cols'] = [
            { wch: 12 }, // Date
            { wch: 8 },  // Journal
            { wch: 15 }, // Piece
            { wch: 8 },  // Compte
            { wch: 40 }, // Intitulé
            { wch: 15 }, // Débit
            { wch: 15 }  // Crédit
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Livre_Journal');

        // 5. Téléchargement
        const filename = `Journal_Comptable_${barInfo.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
        XLSX.writeFile(wb, filename);
    }
}
