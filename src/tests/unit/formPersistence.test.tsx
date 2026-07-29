/**
 * Régression : les formulaires ne doivent JAMAIS perdre la saisie en cours
 * quand les données React Query sous-jacentes sont rafraîchies (refetch
 * périodique, patch Realtime après une vente, invalidation au retour réseau).
 *
 * Historique du bug : les utilisateurs signalaient des champs remis à zéro
 * avant confirmation (ajustement de stock, approvisionnement, édition produit).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Product, Category } from '../../types';

// --- Mocks des dépendances externes aux composants testés ---
vi.mock('../../hooks/useBeninCurrency', () => ({
    useCurrencyFormatter: () => ({ formatPrice: (n: number) => `${n} FCFA` }),
}));

const mockLastSupplies: { current: Record<string, unknown> | undefined } = { current: {} };
vi.mock('../../context/BarContext', () => ({
    useBarContext: () => ({ currentBar: { id: 'bar-1' } }),
}));
vi.mock('../../hooks/queries/useStockQueries', () => ({
    useLastSuppliesMap: () => ({ data: mockLastSupplies.current }),
}));

import { StockAdjustmentModal } from '../../components/StockAdjustmentModal';
import { SupplyModal } from '../../components/SupplyModal';
import { ProductModal } from '../../components/ProductModal';

vi.mock('../../services/supabase/products.service', () => ({
    ProductsService: { getGlobalProducts: vi.fn().mockResolvedValue([]) },
}));

// ImageUpload (rendu par ProductModal) consomme le contexte Notifications
vi.mock('../../hooks/useFeedback', () => ({
    useFeedback: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }),
}));

const categories: Category[] = [
    { id: 'cat-1', name: 'Bières', color: '#f59e0b' } as Category,
];

const makeProduct = (stock: number): Product => ({
    id: 'prod-1',
    barId: 'bar-1',
    name: 'Béninoise',
    volume: '65cl',
    price: 1000,
    stock,
    categoryId: 'cat-1',
    alertThreshold: 10,
    createdAt: new Date('2026-01-01'), // recréé à chaque fetch → casse le structural sharing
} as Product);

describe('Persistance de la saisie — ajustement de stock', () => {
    it('conserve la quantité saisie quand le produit est rafraîchi (même stock)', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <StockAdjustmentModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                product={makeProduct(50)}
                categories={categories}
            />
        );

        const input = screen.getByPlaceholderText('Ex: -50 ou +25') as HTMLInputElement;
        await user.type(input, '-12');
        expect(input.value).toBe('-12');

        rerender(
            <StockAdjustmentModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                product={makeProduct(50)}
                categories={categories}
            />
        );

        expect(input.value).toBe('-12');
    });

    it('conserve la saisie quand le stock change réellement (vente concurrente)', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <StockAdjustmentModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                product={makeProduct(50)}
                categories={categories}
            />
        );

        const input = screen.getByPlaceholderText('Ex: -50 ou +25') as HTMLInputElement;
        await user.type(input, '-12');

        rerender(
            <StockAdjustmentModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                product={makeProduct(47)}
                categories={categories}
            />
        );

        expect(input.value).toBe('-12');
    });
});

describe('Persistance de la saisie — approvisionnement', () => {
    beforeEach(() => {
        mockLastSupplies.current = {
            'prod-1': { lotSize: 24, lotPrice: 12000, supplier: 'SOBEBRA' },
        };
    });

    it('ne réécrase pas le fournisseur saisi quand lastSupplies est rafraîchi', async () => {
        const user = userEvent.setup();

        const { rerender } = render(
            <SupplyModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} products={[makeProduct(50)]} />
        );

        const supplierInput = screen.getByPlaceholderText('SOBEBRA') as HTMLInputElement;
        await user.clear(supplierInput);
        await user.type(supplierInput, 'Brasserie Locale');
        expect(supplierInput.value).toBe('Brasserie Locale');

        // Refetch de lastSupplies : NOUVELLE référence d'objet, même contenu
        mockLastSupplies.current = {
            'prod-1': { lotSize: 24, lotPrice: 12000, supplier: 'SOBEBRA' },
        };
        rerender(
            <SupplyModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} products={[makeProduct(47)]} />
        );

        expect(supplierInput.value).toBe('Brasserie Locale');
    });

    /**
     * ⭐ Cas réel du bug : le formulaire d'appro est ouvert AVANT que
     * `lastSupplies` ne soit chargé (requête encore en vol). La réponse
     * arrive pendant que l'utilisateur saisit → l'effet de pré-remplissage
     * se déclenchait alors et écrasait les champs déjà remplis.
     */
    it('ne réécrase pas la saisie quand lastSupplies arrive APRÈS l’ouverture', async () => {
        const user = userEvent.setup();
        mockLastSupplies.current = undefined; // pas encore chargé

        const { rerender } = render(
            <SupplyModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} products={[makeProduct(50)]} />
        );

        const supplierInput = screen.getByPlaceholderText('SOBEBRA') as HTMLInputElement;
        const priceInput = screen.getByPlaceholderText('12000') as HTMLInputElement;
        await user.type(supplierInput, 'Brasserie Locale');
        await user.type(priceInput, '9000');

        // La requête lastSupplies se résout maintenant
        mockLastSupplies.current = {
            'prod-1': { lotSize: 24, lotPrice: 12000, supplier: 'SOBEBRA' },
        };
        rerender(
            <SupplyModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} products={[makeProduct(50)]} />
        );

        expect(supplierInput.value).toBe('Brasserie Locale');
        expect(priceInput.value).toBe('9000');
    });

    it('conserve la quantité saisie lors d’un refetch produits', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <SupplyModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} products={[makeProduct(50)]} />
        );

        const qtyInput = screen.getByPlaceholderText('48') as HTMLInputElement;
        await user.type(qtyInput, '96');
        expect(qtyInput.value).toBe('96');

        rerender(
            <SupplyModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} products={[makeProduct(47)]} />
        );

        expect(qtyInput.value).toBe('96');
    });
});

describe('Persistance de la saisie — édition produit', () => {
    /**
     * ⭐ Cas réel du bug : en édition, l'ancienne condition
     * `justOpened || (isOpen && product)` rechargeait le formulaire à CHAQUE
     * re-render — une vente (donc un patch Realtime du stock) suffisait à
     * écraser le prix en cours de modification.
     */
    it('ne réécrase pas le prix saisi quand le stock du produit change', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <ProductModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                categories={categories}
                product={makeProduct(50)}
            />
        );

        const priceInput = screen.getByDisplayValue('1000') as HTMLInputElement;
        await user.clear(priceInput);
        await user.type(priceInput, '1200');
        expect(priceInput.value).toBe('1200');

        // Une vente part : Realtime patche le stock 50 → 47
        rerender(
            <ProductModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                categories={categories}
                product={makeProduct(47)}
            />
        );

        expect(priceInput.value).toBe('1200');
    });
});
