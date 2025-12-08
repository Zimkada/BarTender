import { useQuery } from '@tanstack/react-query';
import { supabase, handleSupabaseError } from '../lib/supabase';

// Fonction pour récupérer un seul feature flag
const fetchFeatureFlag = async (key: string): Promise<boolean> => {
    const { data, error } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', key)
        .single();

    if (error) {
        // Si le flag n'existe pas dans la base de données, on le considère comme désactivé par sécurité.
        // Cela évite de faire planter l'application si un flag est présent dans le code mais pas encore créé en BDD.
        if (error.code === 'PGRST116') { // Erreur PostgREST "query returned no rows"
            console.warn(`Feature flag "${key}" non trouvé en base de données. Il sera considéré comme désactivé.`);
            return false;
        }
        // Pour les autres erreurs, on les remonte.
        handleSupabaseError(error);
    }

    return data?.enabled ?? false;
};

/**
 * Hook pour vérifier l'état d'un feature flag.
 * @param key La clé unique du feature flag à vérifier.
 * @returns Un objet de React Query contenant `data` (boolean), `isLoading`, `isError`, etc.
 */
export const useFeatureFlag = (key: string) => {
    return useQuery({
        queryKey: ['feature-flag', key],
        queryFn: () => fetchFeatureFlag(key),
        // Les flags changent rarement. On peut donc les garder en cache longtemps
        // pour éviter des appels réseau inutiles.
        staleTime: 1000 * 60 * 5, // 5 minutes
        cacheTime: 1000 * 60 * 60, // 1 heure
    });
};
