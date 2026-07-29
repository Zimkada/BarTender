/**
 * Verification du rendu des indicateurs reseau sur petit ecran (360px).
 * Complete le controle visuel : le Header complet n'est pas atteignable sans
 * session authentifiee, donc on monte les composants reseau isolement et on
 * verifie le contenu textuel effectivement rendu a chaque etat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkBadge } from '../../components/NetworkBadge';

type Conn = { effectiveType?: string; rtt?: number; downlink?: number };

/**
 * ⚠️ `navigator.onLine` est une propriete PROPRE et non-configurable de
 * l'instance dans ce jsdom : ni defineProperty ni un getter sur le prototype
 * ne le pilotent. L'etat "hors ligne" n'est donc pas simulable ici — il est
 * couvert par les tests d'integration offline (offline-resilience) et par le
 * controle visuel en navigateur. On verifie ici ce qui est simulable : la
 * classification de la qualite reseau (3G/2G/4G) et l'absence d'API.
 */
function setConnection(conn: Conn | undefined) {
    if (conn === undefined) {
        // Simule iOS/Safari/Firefox : API Network Information absente
        Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
        return;
    }
    Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { ...conn, saveData: false, addEventListener() {}, removeEventListener() {} },
    });
}

describe('NetworkBadge — rendu petit ecran (360px)', () => {
    beforeEach(() => { vi.restoreAllMocks(); setConnection(undefined); });

    it('signale la 3G comme reseau lent, libelle non masque sous 420px', () => {
        setConnection({ effectiveType: '3g', rtt: 250, downlink: 1.5 });
        render(<NetworkBadge />);
        const label = screen.getByText('Réseau lent');
        // Le correctif : plus de `hidden min-[420px]:inline` sur le libelle
        expect(label.className).not.toContain('hidden');
    });

    it('signale la 2G comme reseau lent', () => {
        setConnection({ effectiveType: '2g', rtt: 800, downlink: 0.3 });
        render(<NetworkBadge />);
        expect(screen.getByText('Réseau lent')).toBeDefined();
    });

    it('signale un RTT eleve (>300ms) meme si effectiveType annonce 4g', () => {
        setConnection({ effectiveType: '4g', rtt: 450, downlink: 2 });
        render(<NetworkBadge />);
        expect(screen.getByText('Réseau lent')).toBeDefined();
    });

    it('reste muet en 4G correcte (pas de bruit visuel inutile)', () => {
        setConnection({ effectiveType: '4g', rtt: 50, downlink: 10 });
        const { container } = render(<NetworkBadge />);
        expect(container.firstChild).toBeNull();
    });

    /**
     * Limite connue et assumee : sans l'API Network Information (iOS/Safari,
     * Firefox), la lenteur n'est pas detectable — OfflineBanner prend le relais
     * car il s'appuie sur networkManager (connectivite reelle mesuree).
     */
    it('reste muet si l API Network Information est absente (iOS/Safari)', () => {
        setConnection(undefined);
        const { container } = render(<NetworkBadge />);
        expect(container.firstChild).toBeNull();
    });
});
