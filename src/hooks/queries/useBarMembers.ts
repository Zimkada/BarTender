import { useQuery } from '@tanstack/react-query';
import { AuthService } from '../../services/supabase/auth.service';
import { AppUser, BarMember, UserRole } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';

export const barMembersKeys = {
    all: ['barMembers'] as const,
    list: (barId: string) => [...barMembersKeys.all, 'list', barId] as const,
};

import { useSmartSync } from '../useSmartSync';

export const useBarMembers = (barId: string | undefined, options?: { refetchInterval?: number | false }) => {
    const isEnabled = !!barId;

    // 🔒 SECURITÉ & UX: SmartSync pour bar_members
    // Permet la révocation instantanée des accès et l'ajout immédiat des nouveaux membres
    const smartSync = useSmartSync({
        table: 'bar_members',
        event: '*', // 🚀 Écoute TOUS les changements (INSERT, UPDATE, DELETE)
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        refetchInterval: 60000,
        queryKeysToInvalidate: [barMembersKeys.list(barId || '')]
    });

    return useQuery({
        queryKey: barMembersKeys.list(barId || ''),
        queryFn: async (): Promise<(BarMember & { user: AppUser })[]> => {
            if (!barId) return [];

            // Appel à la fonction qui récupère les membres du bar via RPC
            const dbMembers = await AuthService.getBarMembers(barId);

            // Mapper le résultat du RPC vers le type attendu par le frontend
            return dbMembers.map(m => ({
                // Propriétés de BarMember
                // L'ID du membership doit être unique. Le RPC ne le fournit pas directement,
                // donc nous pouvons le générer ou utiliser une combinaison.
                // Ici, nous allons utiliser l'ID de l'utilisateur comme ID principal pour le BarMember
                // en assumant une relation 1:1 pour la gestion des membres.
                id: m.id, // Utiliser l'ID de l'utilisateur comme ID du membre pour simplicité
                userId: m.id,
                barId: barId,
                role: m.role as UserRole, // Cast le rôle de string vers UserRole
                assignedBy: '', // Non fourni par le RPC 'get_bar_members', peut être null ou vide
                assignedAt: new Date(m.joined_at),
                isActive: m.member_is_active, // Statut du membership

                // Propriétés de l'utilisateur imbriqué (AppUser)
                user: {
                    id: m.id,
                    username: m.username || '',
                    name: m.name || '',
                    phone: m.phone || '',
                    email: m.email || '',
                    createdAt: new Date(m.created_at || new Date()), // created_at est dans DbUser
                    createdBy: '', // Non fourni par le RPC 'get_bar_members', peut être null ou vide
                    isActive: m.is_active || false, // Statut global de l'utilisateur (fix null type)
                    firstLogin: m.first_login || false, // fix boolean type safety
                    lastLoginAt: m.last_login_at ? new Date(m.last_login_at) : undefined,
                    role: m.role as UserRole, // Assurer que le rôle est aussi sur l'objet user imbriqué
                }
            }));
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
        // 🚀 Hybride: Realtime ou polling 60s (ou valeur custom)
        refetchInterval: smartSync.isSynced ? false : (options?.refetchInterval !== undefined ? options.refetchInterval : 60000),
    });
};
