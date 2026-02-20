/**
 * Tests unitaires — SyscohadaTranslator
 *
 * Certifie la conformité SYSCOHADA Révisé :
 *   - Invariant Débit = Crédit pour tous les types de transactions
 *   - Codes de comptes corrects (Classe 1 à 7)
 *   - Agrégation Z de Caisse (date fiscale + mode de paiement)
 *   - Calcul TVA correct (fraction sur TTC)
 *   - Traitement de chaque TransactionType
 */

import { describe, it, expect } from 'vitest';
import { SyscohadaTranslator } from './syscohada.service';
import type { AccountingTransaction, CapitalContribution } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const d = (str: string) => new Date(str);

function makeSale(overrides: Partial<AccountingTransaction> = {}): AccountingTransaction {
    return {
        id: 'sale-1',
        barId: 'bar-1',
        type: 'sale',
        amount: 10000,
        paymentMethod: 'cash',
        date: d('2026-02-15T10:00:00'),
        description: 'Vente',
        createdBy: 'user-1',
        createdAt: d('2026-02-15T10:00:00'),
        ...overrides,
    };
}

function totalDebit(entries: ReturnType<typeof SyscohadaTranslator.translateTransactions>) {
    return entries.reduce((sum, e) => sum + e.debit, 0);
}

function totalCredit(entries: ReturnType<typeof SyscohadaTranslator.translateTransactions>) {
    return entries.reduce((sum, e) => sum + e.credit, 0);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SyscohadaTranslator.translateTransactions', () => {

    // ── Z de Caisse ────────────────────────────────────────────────────────

    describe('sale — Z de Caisse', () => {

        it('génère 1 débit (trésorerie) + 1 crédit (7011) pour une vente cash', () => {
            const entries = SyscohadaTranslator.translateTransactions([makeSale()]);

            expect(entries).toHaveLength(2);

            const debit = entries.find(e => e.debit > 0)!;
            const credit = entries.find(e => e.credit > 0)!;

            expect(debit.accountCode).toBe('5711');
            expect(debit.debit).toBe(10000);
            expect(credit.accountCode).toBe('7011');
            expect(credit.credit).toBe(10000);
            expect(debit.journal).toBe('VTE');
        });

        it('agrège plusieurs ventes du même jour et même mode de paiement en 1 écriture', () => {
            const tx = [
                makeSale({ id: 's1', amount: 5000, date: d('2026-02-15T09:00:00'), createdAt: d('2026-02-15T09:00:00') }),
                makeSale({ id: 's2', amount: 3000, date: d('2026-02-15T14:00:00'), createdAt: d('2026-02-15T14:00:00') }),
                makeSale({ id: 's3', amount: 2000, date: d('2026-02-15T22:00:00'), createdAt: d('2026-02-15T22:00:00') }),
            ];

            const entries = SyscohadaTranslator.translateTransactions(tx);

            // 3 ventes, même jour, même paiement → 1 Z = 2 lignes
            expect(entries).toHaveLength(2);
            expect(entries.find(e => e.debit > 0)!.debit).toBe(10000);
        });

        it('sépare les ventes par mode de paiement (2 modes = 2 × 2 lignes)', () => {
            const tx = [
                makeSale({ id: 's1', amount: 60000, paymentMethod: 'cash' }),
                makeSale({ id: 's2', amount: 40000, paymentMethod: 'mobile_money', date: d('2026-02-15T11:00:00'), createdAt: d('2026-02-15T11:00:00') }),
            ];

            const entries = SyscohadaTranslator.translateTransactions(tx);

            // 2 modes → 4 lignes
            expect(entries).toHaveLength(4);
            expect(entries.find(e => e.accountCode === '5711')?.debit).toBe(60000);
            expect(entries.find(e => e.accountCode === '5212')?.debit).toBe(40000);
        });

        it("utilise businessDate (date fiscale) et non date réelle pour l'agrégation", () => {
            // Vente à 2h du matin samedi (fiscal = vendredi) + vente vendredi soir (fiscal = vendredi)
            const tx = [
                makeSale({
                    id: 's1',
                    amount: 5000,
                    date: d('2026-02-14T02:00:00'),    // samedi 2h
                    businessDate: d('2026-02-13'),       // fiscal vendredi
                    createdAt: d('2026-02-14T02:00:00'),
                }),
                makeSale({
                    id: 's2',
                    amount: 3000,
                    date: d('2026-02-13T21:00:00'),     // vendredi 21h
                    businessDate: d('2026-02-13'),       // fiscal vendredi
                    createdAt: d('2026-02-13T21:00:00'),
                }),
            ];

            const entries = SyscohadaTranslator.translateTransactions(tx);

            // Même date fiscale → agrégées en 1 Z = 2 lignes
            expect(entries).toHaveLength(2);
            expect(entries.find(e => e.debit > 0)!.debit).toBe(8000);
        });

        it('sépare deux ventes sur deux jours fiscaux différents', () => {
            const tx = [
                makeSale({ id: 's1', amount: 5000, businessDate: d('2026-02-13') }),
                makeSale({ id: 's2', amount: 3000, businessDate: d('2026-02-14'), date: d('2026-02-14T10:00:00'), createdAt: d('2026-02-14T10:00:00') }),
            ];

            const entries = SyscohadaTranslator.translateTransactions(tx);

            // 2 jours fiscaux → 2 × (1 débit + 1 crédit) = 4 lignes
            expect(entries).toHaveLength(4);
        });
    });

    // ── TVA ────────────────────────────────────────────────────────────────

    describe('sale — TVA', () => {

        it('ne génère pas de ligne TVA quand tvaActive = false (défaut)', () => {
            const entries = SyscohadaTranslator.translateTransactions([makeSale({ amount: 118000 })]);
            expect(entries.find(e => e.accountCode === '443')).toBeUndefined();
            expect(entries).toHaveLength(2);
        });

        it('divise le TTC en HT (7011) + TVA (443) quand tvaActive = true', () => {
            const entries = SyscohadaTranslator.translateTransactions(
                [makeSale({ amount: 118000 })],
                { tvaActive: true, tvaRate: 18 }
            );

            expect(entries).toHaveLength(3);
            expect(entries.find(e => e.accountCode === '443')?.credit).toBe(18000);
            expect(entries.find(e => e.accountCode === '7011')?.credit).toBe(100000);
            expect(entries.find(e => e.debit > 0)?.debit).toBe(118000);
        });

        it('arrondit la TVA correctement (fraction sur TTC — convention SYSCOHADA)', () => {
            // 100 000 TTC à 18% : TVA = round(100000 × 18 / 118) = round(15254.23) = 15254
            const entries = SyscohadaTranslator.translateTransactions(
                [makeSale({ amount: 100000 })],
                { tvaActive: true, tvaRate: 18 }
            );

            const tva = entries.find(e => e.accountCode === '443')!;
            const ht = entries.find(e => e.accountCode === '7011')!;

            expect(tva.credit).toBe(15254);
            expect(ht.credit).toBe(84746);
            // Invariant TTC : HT + TVA = TTC
            expect(ht.credit + tva.credit).toBe(100000);
        });
    });

    // ── Modes de paiement → comptes de trésorerie ─────────────────────────

    describe('modes de paiement → compte trésorerie', () => {
        it.each([
            ['cash',          '5711'],
            ['ticket',        '5711'],  // bon/ticket = espèces
            ['mobile_money',  '5212'],
            ['card',          '5211'],
            ['credit',        '411'],   // client à crédit (encaissement différé)
        ])('%s → %s', (paymentMethod, expectedAccount) => {
            const entries = SyscohadaTranslator.translateTransactions([
                makeSale({ paymentMethod })
            ]);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe(expectedAccount);
        });

        it('utilise 5711 (cash) par défaut si paymentMethod absent', () => {
            const tx = makeSale();
            delete (tx as Partial<AccountingTransaction>).paymentMethod;
            const entries = SyscohadaTranslator.translateTransactions([tx]);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe('5711');
        });
    });

    // ── Dépenses ──────────────────────────────────────────────────────────

    describe('expense / supply', () => {

        it('génère débit charge + crédit trésorerie, journal ACH', () => {
            const tx: AccountingTransaction = {
                id: 'e1', barId: 'b', type: 'expense', amount: 5000,
                category: 'electricity',
                date: d('2026-02-10'), description: 'Facture électricité',
                createdBy: 'u', createdAt: d('2026-02-10'),
            };

            const entries = SyscohadaTranslator.translateTransactions([tx]);

            expect(entries).toHaveLength(2);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe('6051');
            expect(entries.find(e => e.credit > 0)?.accountCode).toBe('5711');
            expect(entries[0].journal).toBe('ACH');
        });

        it.each([
            ['supply',       '6011'],
            ['water',        '6051'],
            ['electricity',  '6051'],
            ['maintenance',  '624'],
            ['unknown_cat',  '628'],  // fallback Frais Divers
        ])('catégorie %s → compte %s', (category, expectedAccount) => {
            const tx: AccountingTransaction = {
                id: 'e1', barId: 'b', type: 'expense', amount: 1000,
                category, date: d('2026-02-10'), description: 'Test',
                createdBy: 'u', createdAt: d('2026-02-10'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe(expectedAccount);
        });

        it('catégorie investment → compte 2183 (Classe 2, pas Classe 6)', () => {
            const tx: AccountingTransaction = {
                id: 'e1', barId: 'b', type: 'expense', amount: 200000,
                category: 'investment',
                date: d('2026-02-10'), description: 'Achat ordinateur',
                createdBy: 'u', createdAt: d('2026-02-10'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe('2183');
            // Vérification explicite : pas de compte Classe 6
            expect(entries.find(e => e.debit > 0)?.accountCode).not.toMatch(/^6/);
        });

        it('applique le mapping personnalisé (customCategoryMappings) quand configuré', () => {
            const tx: AccountingTransaction = {
                id: 'e1', barId: 'b', type: 'expense', amount: 1000,
                category: 'uuid-cat-loyer',
                date: d('2026-02-10'), description: 'Loyer', createdBy: 'u', createdAt: d('2026-02-10'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx], {
                customCategoryMappings: { 'uuid-cat-loyer': '622' },
            });
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe('622');
        });
    });

    // ── Salaires ──────────────────────────────────────────────────────────

    describe('salary', () => {

        it('génère débit 661 (Rémunération) + crédit trésorerie, journal SAL', () => {
            const tx: AccountingTransaction = {
                id: 'sal1', barId: 'b', type: 'salary', amount: 80000,
                date: d('2026-02-28'), description: 'Salaire Jean',
                createdBy: 'u', createdAt: d('2026-02-28'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);

            expect(entries).toHaveLength(2);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe('661');
            expect(entries.find(e => e.debit > 0)?.debit).toBe(80000);
            expect(entries.find(e => e.credit > 0)?.accountCode).toBe('5711');
            expect(entries[0].journal).toBe('SAL');
        });
    });

    // ── Retours ───────────────────────────────────────────────────────────

    describe('return', () => {

        it('contre-passe la vente : débit 7011 + crédit trésorerie, journal VTE', () => {
            const tx: AccountingTransaction = {
                id: 'r1', barId: 'b', type: 'return', amount: 2000,
                date: d('2026-02-12'), description: 'Retour bouteille cassée',
                createdBy: 'u', createdAt: d('2026-02-12'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);

            expect(entries).toHaveLength(2);
            expect(entries.find(e => e.debit > 0)?.accountCode).toBe('7011');
            expect(entries.find(e => e.credit > 0)?.accountCode).toBe('5711');
            expect(entries[0].journal).toBe('VTE');
        });
    });

    // ── Solde initial ─────────────────────────────────────────────────────

    describe('initial_balance', () => {

        it('montant positif → crédit 101 (Capital Social), journal OD', () => {
            const tx: AccountingTransaction = {
                id: 'ib1', barId: 'b', type: 'initial_balance', amount: 500000,
                date: d('2026-01-01'), description: 'Solde initial',
                createdBy: 'u', createdAt: d('2026-01-01'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);

            expect(entries.find(e => e.credit > 0)?.accountCode).toBe('101');
            expect(entries.find(e => e.debit > 0)?.debit).toBe(500000);
            expect(entries[0].journal).toBe('OD');
        });

        it('montant négatif → crédit 161 (Emprunts), montant absolu en débit', () => {
            const tx: AccountingTransaction = {
                id: 'ib2', barId: 'b', type: 'initial_balance', amount: -200000,
                date: d('2026-01-01'), description: 'Solde initial négatif',
                createdBy: 'u', createdAt: d('2026-01-01'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);

            expect(entries.find(e => e.credit > 0)?.accountCode).toBe('161');
            // Le débit doit être la valeur absolue
            expect(entries.find(e => e.debit > 0)?.debit).toBe(200000);
        });

        it('montant zéro → compte 101, deux écritures générées avec montants nuls', () => {
            // 0 >= 0 → Capital 101 (pas Emprunts 161)
            // Le moteur génère les écritures même avec un montant nul
            const tx: AccountingTransaction = {
                id: 'ib3', barId: 'b', type: 'initial_balance', amount: 0,
                date: d('2026-01-01'), description: 'Solde nul',
                createdBy: 'u', createdAt: d('2026-01-01'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);
            expect(entries).toHaveLength(2);
            // credit = Math.abs(0) = 0, donc on cherche le compte, pas le montant
            expect(entries.find(e => e.accountCode === '101')).toBeDefined();
            expect(entries.find(e => e.accountCode === '101')?.credit).toBe(0);
        });
    });

    // ── Consignation ──────────────────────────────────────────────────────

    describe('consignment', () => {

        it('ne génère ZÉRO écriture comptable (suivi physique uniquement)', () => {
            const tx: AccountingTransaction = {
                id: 'csg1', barId: 'b', type: 'consignment', amount: 500,
                date: d('2026-02-15'), description: 'Consignation bouteille',
                createdBy: 'u', createdAt: d('2026-02-15'),
            };
            const entries = SyscohadaTranslator.translateTransactions([tx]);
            expect(entries).toHaveLength(0);
        });
    });

    // ── Invariant Débit = Crédit ──────────────────────────────────────────

    describe('invariant Débit = Crédit', () => {

        it('totalDebit === totalCredit pour un mix de toutes les transactions', () => {
            const tx: AccountingTransaction[] = [
                makeSale({ id: 's1', amount: 50000, paymentMethod: 'cash' }),
                makeSale({ id: 's2', amount: 30000, paymentMethod: 'mobile_money', date: d('2026-02-01T11:00:00'), createdAt: d('2026-02-01T11:00:00') }),
                { id: 'e1', barId: 'b', type: 'expense',         amount: 10000, category: 'electricity', date: d('2026-02-05'), description: 'Elec',    createdBy: 'u', createdAt: d('2026-02-05') },
                { id: 'e2', barId: 'b', type: 'supply',          amount: 45000, category: 'supply',      date: d('2026-02-06'), description: 'Stock',   createdBy: 'u', createdAt: d('2026-02-06') },
                { id: 'e3', barId: 'b', type: 'salary',          amount: 80000,                          date: d('2026-02-28'), description: 'Salaire', createdBy: 'u', createdAt: d('2026-02-28') },
                { id: 'e4', barId: 'b', type: 'return',          amount: 5000,                           date: d('2026-02-10'), description: 'Retour',  createdBy: 'u', createdAt: d('2026-02-10') },
                { id: 'e5', barId: 'b', type: 'initial_balance', amount: 200000,                         date: d('2026-01-01'), description: 'Init',    createdBy: 'u', createdAt: d('2026-01-01') },
                { id: 'e6', barId: 'b', type: 'consignment',     amount: 500,                            date: d('2026-02-15'), description: 'CSG',     createdBy: 'u', createdAt: d('2026-02-15') },
            ];

            const entries = SyscohadaTranslator.translateTransactions(tx);

            expect(totalDebit(entries)).toBe(totalCredit(entries));
        });

        it('invariant maintenu avec TVA active', () => {
            const tx = [makeSale({ amount: 100000 })];
            const entries = SyscohadaTranslator.translateTransactions(tx, { tvaActive: true, tvaRate: 18 });
            expect(totalDebit(entries)).toBe(totalCredit(entries));
        });
    });

    // ── Tri chronologique ─────────────────────────────────────────────────

    describe('tri des écritures', () => {

        it('les écritures sont triées par date croissante', () => {
            const tx: AccountingTransaction[] = [
                { id: 'e1', barId: 'b', type: 'expense', amount: 1000, date: d('2026-02-20'), description: 'E', createdBy: 'u', createdAt: d('2026-02-20') },
                { id: 'e2', barId: 'b', type: 'salary',  amount: 50000, date: d('2026-02-01'), description: 'S', createdBy: 'u', createdAt: d('2026-02-01') },
                makeSale({ date: d('2026-02-10'), createdAt: d('2026-02-10') }),
            ];

            const entries = SyscohadaTranslator.translateTransactions(tx);

            for (let i = 1; i < entries.length; i++) {
                expect(entries[i].date.getTime()).toBeGreaterThanOrEqual(entries[i - 1].date.getTime());
            }
        });
    });
});

// ─── Capital Contributions ──────────────────────────────────────────────────

describe('SyscohadaTranslator.translateCapitalContributions', () => {

    function makeContrib(overrides: Partial<CapitalContribution> = {}): CapitalContribution {
        return {
            id: 'c1', barId: 'b', amount: 500000,
            date: d('2026-01-15'), description: 'Apport initial',
            source: 'owner', createdBy: 'u', createdAt: d('2026-01-15'),
            ...overrides,
        };
    }

    it('génère débit 5711 + crédit 101 pour un apport propriétaire, journal OD', () => {
        const entries = SyscohadaTranslator.translateCapitalContributions([makeContrib()]);

        expect(entries).toHaveLength(2);
        expect(entries.find(e => e.debit > 0)?.accountCode).toBe('5711');
        expect(entries.find(e => e.credit > 0)?.accountCode).toBe('101');
        expect(entries[0].journal).toBe('OD');
    });

    it.each([
        ['owner',    '101'],
        ['partner',  '101'],
        ['investor', '101'],
        ['other',    '101'],
        ['loan',     '161'],
    ] as const)('source %s → compte %s', (source, expectedCredit) => {
        const entries = SyscohadaTranslator.translateCapitalContributions([makeContrib({ source })]);
        expect(entries.find(e => e.credit > 0)?.accountCode).toBe(expectedCredit);
    });

    it('utilise la valeur absolue du montant', () => {
        // amount est TOUJOURS positif selon le type CapitalContribution — vérification défensive
        const entries = SyscohadaTranslator.translateCapitalContributions([makeContrib({ amount: 300000 })]);
        expect(entries.find(e => e.debit > 0)?.debit).toBe(300000);
        expect(entries.find(e => e.credit > 0)?.credit).toBe(300000);
    });

    it('totalDebit === totalCredit pour plusieurs apports de sources différentes', () => {
        const contribs: CapitalContribution[] = [
            makeContrib({ id: 'c1', amount: 1000000, source: 'owner',   date: d('2026-01-01'), createdAt: d('2026-01-01') }),
            makeContrib({ id: 'c2', amount: 500000,  source: 'partner', date: d('2026-01-15'), createdAt: d('2026-01-15') }),
            makeContrib({ id: 'c3', amount: 200000,  source: 'loan',    date: d('2026-02-01'), createdAt: d('2026-02-01') }),
        ];

        const entries = SyscohadaTranslator.translateCapitalContributions(contribs);
        const td = entries.reduce((s, e) => s + e.debit, 0);
        const tc = entries.reduce((s, e) => s + e.credit, 0);

        expect(td).toBe(tc);
    });

    it('les écritures sont triées chronologiquement', () => {
        const contribs: CapitalContribution[] = [
            makeContrib({ id: 'c2', amount: 300000, date: d('2026-02-01'), createdAt: d('2026-02-01') }),
            makeContrib({ id: 'c1', amount: 500000, date: d('2026-01-01'), createdAt: d('2026-01-01') }),
        ];

        const entries = SyscohadaTranslator.translateCapitalContributions(contribs);

        for (let i = 1; i < entries.length; i++) {
            expect(entries[i].date.getTime()).toBeGreaterThanOrEqual(entries[i - 1].date.getTime());
        }
    });
});
