import { z } from 'zod';

// Types stricts pour la comptabilité SYSCOHADA

export type SyscohadaAccountType = 'actif' | 'passif' | 'charge' | 'produit' | 'immobilisation';

export interface SyscohadaAccount {
    code: string;           // ex: '7011'
    name: string;           // ex: 'Ventes de boissons'
    type: SyscohadaAccountType;
}

export type JournalCode =
    | 'VTE'  // Ventes (et retours de ventes)
    | 'ACH'  // Achats / Dépenses / Approvisionnements
    | 'BQ'   // Banque (opérations bancaires futures)
    | 'OD'   // Opérations Diverses (soldes initiaux, capital)
    | 'SAL'; // Salaires

export interface AccountingEntry {
    date: Date;             // Date de l'opération
    journal: JournalCode;   // Code du journal (ex: 'VTE' pour ventes, 'BQ' pour banque)
    piece: string;          // Numéro de pièce justificative (ex: 'VTE-2602-001')
    accountCode: string;    // Le fameux numéro de compte (ex: '7011')
    description: string;    // Libellé de l'opération
    debit: number;          // Montant si c'est un débit (0 si crédit)
    credit: number;         // Montant si c'est un crédit (0 si débit)
}

// Zod schema for runtime validation of the JSONB config
export const BarAccountingConfigSchema = z.object({
    tvaActive: z.boolean().default(false),
    tvaRate: z.number().min(0).max(100).default(18),
    customCategoryMappings: z.record(z.string(), z.string()).default({}),
});

// Type inferred from Zod schema
export type BarAccountingConfig = z.infer<typeof BarAccountingConfigSchema>;

// Plan comptable SYSCOHADA par défaut (minimal pour un Bar)
export const DEFAULT_SYSCOHADA_PLAN: Record<string, SyscohadaAccount> = {
    // CLASSE 1 : Capitaux
    '101': { code: '101', name: 'Capital Social', type: 'passif' },
    '161': { code: '161', name: 'Emprunts et dettes', type: 'passif' },

    // CLASSE 2 : Immobilisations
    '2183': { code: '2183', name: 'Matériel de bureau et informatique', type: 'immobilisation' },

    // CLASSE 4 : Tiers
    '411': { code: '411', name: 'Clients', type: 'actif' },
    '443': { code: '443', name: 'TVA facturée (à reverser)', type: 'passif' },
    '445': { code: '445', name: 'TVA récupérable', type: 'actif' },

    // CLASSE 5 : Trésorerie
    '5711': { code: '5711', name: 'Caisse Principale (Espèces)', type: 'actif' },
    '5211': { code: '5211', name: 'Banque Locale', type: 'actif' },
    '5212': { code: '5212', name: 'Mobile Money', type: 'actif' },

    // CLASSE 6 : Charges
    '6011': { code: '6011', name: 'Achats de Boissons', type: 'charge' },
    '6051': { code: '6051', name: 'Eau et Électricité', type: 'charge' },
    '624': { code: '624', name: 'Entretien et Réparations', type: 'charge' },
    '628': { code: '628', name: 'Frais Divers', type: 'charge' },
    '661': { code: '661', name: 'Rémunération du personnel', type: 'charge' },

    // CLASSE 7 : Produits
    '7011': { code: '7011', name: 'Ventes de Boissons', type: 'produit' },
    '706': { code: '706', name: 'Services (Locations, Droits d\'entrée)', type: 'produit' }
};
