import { useState, useMemo, useEffect } from 'react';
import { AnalyticsService, TopProduct } from '../../../../services/supabase/analytics.service';
import type { Bar } from '../../../../types';
import { useRevenueStats } from '../../../../hooks/useRevenueStats';
import { dateToYYYYMMDD } from '../../../../utils/businessDateHelpers';

interface UseSalesStatsProps {
    // ⚡ filteredSales RETIRE (15/09/2026) : il ne servait qu'a additionner les
    // ventes optimistes au CA backend. useRevenueStats fusionne desormais
    // l'offline lui-meme, avec deduplication par idempotency_key — ajouter
    // filteredSales par-dessus produirait un double comptage.
    // La liste reste passee separement a AnalyticsView (prop `sales`), qui en a
    // besoin pour ses propres graphiques.
    timeRange: string;
    startDate: Date;
    endDate: Date;
    currentBar: Bar | null;
    serverId?: string; // Optional: for filtering top products by server
}

export function useSalesStats({
    timeRange,
    startDate,
    endDate,
    currentBar,
    serverId
}: UseSalesStatsProps) {
    // --- ÉTATS ---
    const [topProductsLimit, setTopProductsLimit] = useState<number>(5);
    const [topProductMetric, setTopProductMetric] = useState<'units' | 'revenue' | 'profit'>('units');
    const [sqlTopProducts, setSqlTopProducts] = useState<TopProduct[]>([]);
    const [isLoadingTopProducts, setIsLoadingTopProducts] = useState(false);

    /**
     * ⚡ Disk IO (15/09/2026) : le CA vient desormais de useRevenueStats, qui
     * lit les tables BRUTES, et non plus de AnalyticsService.getRevenueSummary,
     * qui lisait la vue materialisee daily_sales_summary.
     *
     * POURQUOI : cette vue portait 79,6 % du cout de refresh de la base. Chaque
     * vente validee declenchait une reecriture complete (~2,2 s mesurees) d'une
     * vue de 626 lignes couvrant 7 bars. Deux correctifs de debounce ont echoue
     * a reduire ce cout — mesure du 15/09, l'espacement reel des ventes depasse
     * largement toute fenetre de debounce raisonnable. Le probleme n'etait pas
     * la FREQUENCE des refresh mais leur COUT UNITAIRE : la seule issue est de
     * ne plus dependre de la vue.
     *
     * PARITE VALIDEE EN BASE le 14-15/09 avant migration :
     *   - 11 bars, tous closing_hour = 6 (la vue codait 6h en dur, le trigger
     *     business_date lit closing_hour par bar : aucune divergence possible)
     *   - CA brut et nombre de ventes : 0 ecart sur 70 couples bar/jour (30 j)
     *   - Retours : 0 ecart sur 706 retours (90 j). ⚠️ Les deux definitions
     *     different pourtant (la vue filtre status='approved' seul ;
     *     isConfirmedReturn accepte aussi validated/restocked MAIS exige un
     *     impact financier). Elles coincident sur les donnees actuelles, pas
     *     par construction — sans consequence ici puisque la vue disparait de
     *     ce chemin.
     *
     * ⭐ useRevenueStats derive son perimetre de la PERMISSION canViewAllSales,
     * exactement comme serverIdForAnalytics ci-dessous (SalesHistoryPage:211).
     * Les deux coincident donc toujours : aucun parametre serverId a propager.
     */
    const revenueStats = useRevenueStats({
        startDate: dateToYYYYMMDD(startDate),
        endDate: dateToYYYYMMDD(endDate),
        enabled: !!currentBar,
    });

    // --- EFFETS ---
    // Load statistics from SQL view and RPC when filters change
    useEffect(() => {
        if (!currentBar) return;

        const loadStats = async () => {
            setIsLoadingTopProducts(true);
            try {
                // Le CA ne passe plus par ici : il vient de useRevenueStats
                // (tables brutes). Seuls les top produits restent charges ici.
                //
                // Charger les top produits via RPC
                /**
                 * ⭐ MARGE DE SECURITE sur la limite — 05/08/2026.
                 *
                 * ⚠️ AnalyticsView filtre ce classement PAR PORTEE (Bar /
                 * Restau) APRES reception. Si le serveur ne renvoyait que
                 * topProductsLimit  lignes, une portee Restau pourrait
                 * n en garder AUCUNE alors que des plats se vendent — les 5
                 * premieres etant des boissons.
                 * ⭐ x4 plafonne a 50 : assez pour qu une portee trouve ses
                 * lignes, assez peu pour ne pas alourdir la reponse (§3 —
                 * l egress reste borne).
                 * ⚠️ Le plafond FINAL reste topProductsLimit, applique
                 * apres tri ligne 132 : l utilisateur voit bien son top 5.
                 */
                const FETCH_MULTIPLIER = 4;
                const MAX_FETCH = 50;
                const products = await AnalyticsService.getTopProducts(
                    currentBar.id,
                    startDate,
                    endDate,
                    Math.min(topProductsLimit * FETCH_MULTIPLIER, MAX_FETCH),
                    'quantity',
                    serverId
                );

                setSqlTopProducts(products || []);
            } catch (error) {
                console.error('Error loading top products:', error);
                setSqlTopProducts([]);
            } finally {
                setIsLoadingTopProducts(false);
            }
        };

        loadStats();
    }, [
        currentBar?.id,
        startDate.toISOString(),
        endDate.toISOString(),
        topProductsLimit,
        serverId
    ]);


    // --- CALCULS ---
    const stats = useMemo(() => {
        /**
         * 🔴 CERTIFICATION SECURITE : PLUS DE FUSION MANUELLE ICI.
         *
         * L'ancienne version ajoutait au CA backend le montant des ventes
         * optimistes de filteredSales. C'etait correct tant que le backend
         * venait de la vue materialisee, qui ignore l'offline.
         *
         * ⚠️ Le refaire avec useRevenueStats produirait un DOUBLE COMPTAGE :
         * ce hook fusionne DEJA serveur + offline (getOfflineSales) + ventes
         * en transition, et deduplique par idempotency_key contre
         * recentlySyncedMap — ce que l'addition naive ci-dessus ne faisait
         * pas. Sa fusion est strictement meilleure : on lui laisse le CA.
         *
         * netRevenue (= brut - retours confirmes) correspond a l'ancien
         * totalRevenue (= net_revenue ?? gross_revenue de la vue) ;
         * saleCount correspond a totalSales (= validated_count).
         */
        const totalRevenue = revenueStats.netRevenue;
        const totalItems = revenueStats.saleCount;

        // 3. KPI contextuel selon la période
        let kpiValue = 0;
        let kpiLabel = 'Panier moyen';

        // Calculer le nombre de jours dans la période sélectionnée
        const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        if (timeRange === 'today') {
            const now = new Date();
            const effectiveNow = now < startDate ? startDate : now;
            const hoursElapsed = (effectiveNow.getTime() - startDate.getTime()) / (1000 * 60 * 60);
            kpiValue = hoursElapsed > 0 ? totalRevenue / hoursElapsed : 0;
            kpiLabel = 'CA moyen/heure';
        } else {
            kpiValue = totalRevenue / dayCount;
            kpiLabel = 'CA moyen/jour';
        }

        // 4. Top Produits (transformé depuis SQL)
        const topProductsResult = (sqlTopProducts && sqlTopProducts.length > 0)
            ? sqlTopProducts.map(p => ({
                name: p.product_name,
                volume: p.product_volume || '',
                displayName: `${p.product_name}${p.product_volume ? ' (' + p.product_volume + ')' : ''}`,
                units: p.total_quantity,
                revenue: p.total_revenue,
                profit: p.profit ?? p.total_revenue
            }))
            : [];

        // Créer les 3 listes triées
        const byUnits = [...topProductsResult].sort((a, b) => b.units - a.units).slice(0, topProductsLimit);
        const byRevenue = [...topProductsResult].sort((a, b) => b.revenue - a.revenue).slice(0, topProductsLimit);
        const byProfit = [...topProductsResult].sort((a, b) => b.profit - a.profit).slice(0, topProductsLimit);

        return {
            totalRevenue,
            totalItems,
            kpiValue,
            kpiLabel,
            topProducts: { byUnits, byRevenue, byProfit }
        };
    }, [revenueStats.netRevenue, revenueStats.saleCount, timeRange, sqlTopProducts, topProductsLimit, startDate, endDate]);

    return {
        stats,
        topProductsLimit,
        setTopProductsLimit,
        topProductMetric,
        setTopProductMetric,
        sqlTopProducts,
        setSqlTopProducts, // Exported in case it's needed elsewhere, though mainly internal
        // Les deux sources doivent etre couvertes : le CA (useRevenueStats) et
        // les top produits (RPC). Omettre l'une afficherait un total partiel
        // comme s'il etait definitif.
        isLoadingStats: isLoadingTopProducts || revenueStats.isLoading
    };
}
