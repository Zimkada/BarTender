/**
 * animatedCounter.test.tsx
 *
 * ⭐ Audit UI/UX, lot 2 (10/10/2026) : « Ventes jour » recomptait toute la
 * journée depuis 0 à chaque vente, sans séparateur de milliers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

import { AnimatedCounter } from '../../components/AnimatedCounter';

// Normalise les espaces insécables d'Intl (U+202F, U+00A0) pour comparer.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/[  ]/g, ' ');
const digits = (s: string) => Number(s.replace(/[^\d]/g, ''));

describe('AnimatedCounter', () => {
  beforeEach(() => { reducedMotion.value = false; });

  it('affiche la valeur formatée dès le montage, sans recompter depuis 0', () => {
    const { container } = render(<AnimatedCounter value={2380} suffix=" FCFA" />);
    expect(text(container)).toBe('2 380 FCFA');
  });

  it('défile depuis l’ANCIENNE valeur, jamais depuis 0, et finit sur la nouvelle', async () => {
    const { container, rerender } = render(<AnimatedCounter value={2380} duration={0.2} />);
    const span = container.querySelector('span') as HTMLElement;

    // Toutes les valeurs affichées pendant le défilement.
    const seen: number[] = [];
    const observer = new MutationObserver(() => seen.push(digits(text(span))));
    observer.observe(span, { childList: true, characterData: true, subtree: true });

    rerender(<AnimatedCounter value={2980} duration={0.2} />);
    await waitFor(() => expect(text(container)).toBe('2 980'));
    observer.disconnect();

    expect(seen.length).toBeGreaterThan(0);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(2380);
  });

  it('« réduire les animations » : saut direct à la nouvelle valeur', () => {
    reducedMotion.value = true;
    const { container, rerender } = render(<AnimatedCounter value={100} />);
    rerender(<AnimatedCounter value={600} />);
    expect(text(container)).toBe('600');
  });

  it('applique une mise en forme fournie (ex. formatPrice)', () => {
    const { container } = render(<AnimatedCounter value={1500} format={(n) => `${n} F`} />);
    expect(text(container)).toBe('1500 F');
  });
});
