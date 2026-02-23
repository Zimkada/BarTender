import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';

/**
 * Hook centralisant la logique décidant si l'utilisateur courant
 * possède les droits requis pour forcer le mode de travail hors-ligne.
 *
 * Règles Métier :
 * Le mode hors-ligne est activé si et seulement si :
 *   - L'application est en 'Mode Simplifié' OU
 *   - L'utilisateur actuel a le rôle de Gérant (gerant, promoteur, super_admin)
 *
 * ⚡ Optimisation : Résultat memoïsé pour éviter les recalculs inutiles
 * dans les dépendances useEffect/useCallback
 */
export const useCanWorkOffline = () => {
    const { currentSession } = useAuth();
    const { isSimplifiedMode } = useBarContext();

    // ✅ Memoized to ensure reference stability for downstream dependencies
    return useMemo(() => {
        const role = currentSession?.role;
        const isManagerRole = ['gerant', 'promoteur', 'super_admin'].includes(role || '');

        // Centralised business logic:
        // Manager/Admin can always work offline.
        // Simplified mode implies this device is a central kiosk (usually managed by an admin/manager),
        // but typically we require Manager status OR simplified mode to bypass strict server checks.
        return isManagerRole || isSimplifiedMode;
    }, [currentSession?.role, isSimplifiedMode]);
};
