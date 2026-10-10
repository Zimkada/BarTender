/**
 * saleSuccessOverlay.test.tsx
 *
 * ⭐ Moment « vente validée » (audit UI/UX, lot 2, 10/10/2026).
 * Le libellé ne doit JAMAIS en dire plus que ce qui s'est passé :
 * un serveur en mode complet n'encaisse pas (vente `pending`), une vente
 * mise sur un bon n'est pas réglée.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SaleSuccessOverlay } from '../../components/cart/SaleSuccessOverlay';
import { buildSaleSuccess, type SaleSuccessContext } from '../../components/cart/saleSuccess';

vi.mock('../../hooks/useBeninCurrency', () => ({
  useCurrencyFormatter: () => ({ formatPrice: (n: number) => `${n} FCFA` }),
}));

const base: SaleSuccessContext = {
  canValidate: true,
  hasDrinks: true,
  hasKitchen: false,
  hasTicket: false,
  ticketNumber: undefined,
  isOffline: false,
  amount: 1700,
};

describe('buildSaleSuccess - libellés', () => {
  it('gérant / promoteur : « Vente encaissée », sans mention superflue', () => {
    expect(buildSaleSuccess(base)).toEqual({ title: 'Vente encaissée', details: [], amount: 1700 });
  });

  it("⛔ serveur en mode complet : jamais « encaissée », la vente attend le gérant", () => {
    const r = buildSaleSuccess({ ...base, canValidate: false });
    expect(r.title).toBe('Vente envoyée');
    expect(r.title).not.toMatch(/encaiss/i);
    expect(r.details).toContain('En attente de validation du gérant');
  });

  it("⛔ vente sur un bon : « Ajouté au bon #N », jamais « encaissée »", () => {
    const r = buildSaleSuccess({ ...base, hasTicket: true, ticketNumber: 12 });
    expect(r.title).toBe('Ajouté au bon #12');
    expect(r.details).toContain('Réglé à la clôture du bon');
  });

  it('bon sans numéro connu : « Ajouté au bon » seul', () => {
    expect(buildSaleSuccess({ ...base, hasTicket: true }).title).toBe('Ajouté au bon');
  });

  it('serveur qui ajoute à un bon : les deux réserves apparaissent', () => {
    const r = buildSaleSuccess({ ...base, canValidate: false, hasTicket: true, ticketNumber: 3 });
    expect(r.title).toBe('Ajouté au bon #3');
    expect(r.details).toEqual(['Réglé à la clôture du bon', 'En attente de validation du gérant']);
  });

  it('plats seuls : « Commande envoyée en cuisine » (rien n’est encore vendu)', () => {
    const r = buildSaleSuccess({ ...base, hasDrinks: false, hasKitchen: true });
    expect(r.title).toBe('Commande envoyée en cuisine');
    expect(r.details).toEqual([]);
  });

  it('boissons + plats : vente des boissons, plats signalés', () => {
    const r = buildSaleSuccess({ ...base, hasKitchen: true });
    expect(r.title).toBe('Vente encaissée');
    expect(r.details).toContain('Plats envoyés en cuisine');
  });

  it('hors ligne : la vente est dite en attente du réseau', () => {
    expect(buildSaleSuccess({ ...base, isOffline: true }).details)
      .toContain('Hors ligne : envoyée au retour du réseau');
  });
});

describe('SaleSuccessOverlay - comportement', () => {
  afterEach(() => vi.useRealTimers());

  it('affiche titre, montant et détails', () => {
    render(
      <SaleSuccessOverlay
        success={{ title: 'Vente envoyée', details: ['En attente de validation du gérant'], amount: 1700 }}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText('Vente envoyée')).toBeTruthy();
    expect(screen.getByText('1700 FCFA')).toBeTruthy();
    expect(screen.getByText('En attente de validation du gérant')).toBeTruthy();
  });

  it('se ferme seul après 1,2 s, même si le parent re-rend entre-temps', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const success = { title: 'Vente encaissée', details: [], amount: 500 };
    const { rerender } = render(<SaleSuccessOverlay success={success} onDone={onDone} />);

    // ⚠️ Nouvelle fonction à chaque rendu, comme une fléchée inline du parent :
    // le minuteur ne doit PAS repartir de zéro.
    act(() => { vi.advanceTimersByTime(800); });
    rerender(<SaleSuccessOverlay success={success} onDone={() => onDone()} />);
    act(() => { vi.advanceTimersByTime(500); });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('se ferme au tap, sans attendre', () => {
    const onDone = vi.fn();
    render(<SaleSuccessOverlay success={{ title: 'Vente encaissée', details: [] }} onDone={onDone} />);
    fireEvent.click(screen.getByRole('status'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('ne rend rien sans succès', () => {
    render(<SaleSuccessOverlay success={null} onDone={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
