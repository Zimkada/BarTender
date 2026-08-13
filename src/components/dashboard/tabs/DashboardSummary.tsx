import { useNavigate } from 'react-router-dom';
import {
    TrendingUp, DollarSign, ShoppingCart, Package,
    AlertTriangle, RotateCcw, Archive, MessageCircle
} from 'lucide-react';
import { DataFreshnessIndicatorCompact } from '../../DataFreshnessIndicator';
import { AnimatedCounter } from '../../AnimatedCounter';
import {
    KitchenSummaryCards, KitchenVigilanceList, MixedScopeKitchenCards,
} from '../KitchenSummaryCards';
import type { ActivityScope } from '../../common/scopeHelpers';
import { EnhancedButton } from '../../EnhancedButton';
import { Bar, Product, ProductStockInfo } from '../../../types';
import { StaleSalesCleanupBanner } from '../StaleSalesCleanupBanner';

interface DashboardSummaryProps {
    // Data
    currentBar: Bar | null;
    todayTotal: number;
    salesCount: number;
    pendingSalesCount: number;
    totalItems: number;
    returnsCount: number;
    pendingReturnsCount: number;
    consignmentsCount: number;
    lowStockProducts: Product[];
    topProductsList: { name: string; qty: number }[];
    allProductsStockInfo: Record<string, ProductStockInfo>;
    isServerRole: boolean;
    /**
     * ⭐ Portee active. En RESTAU, trois cartes (Alertes, Retours, Consign.)
     * sont remplacees par les indicateurs cuisine : elles portent sur les
     * BOISSONS et n ont rien a dire d un plat (§13.1).
     * ⚠️ OPTIONNELLE : omise, l ecran est rigoureusement celui d avant (§3).
     */
    scope?: ActivityScope;
    /**
     * ⛔ INDISPENSABLE POUR §3 — ne PAS deriver de `scope`.
     *
     * `scope === 'all'` est vrai dans DEUX situations opposees : un bar PUR
     * (ou la portee est forcee a 'all') et un bar MIXTE ou l utilisateur a
     * choisi « Tout ». Sans ce booleen, un bar pur afficherait les cartes
     * cuisine — exactement la regression que §3 interdit.
     * ⚠️ Defaut `false` : omise, la prop laisse l ecran d avant a l identique.
     */
    hasRestaurant?: boolean;
    barId?: string;
    businessDate?: string;


    // Helpers
    formatPrice: (amount: number) => string;

    // Actions & States
    onRefresh: () => Promise<void>;
    onExportWhatsApp: () => void;
}

export function DashboardSummary({
    currentBar,
    todayTotal,
    salesCount,
    pendingSalesCount,
    totalItems,
    returnsCount,
    pendingReturnsCount,
    consignmentsCount,
    lowStockProducts,
    topProductsList,
    allProductsStockInfo,
    isServerRole,
    scope = 'all',
    hasRestaurant = false,
    barId,
    businessDate,
    formatPrice,
    onRefresh,
    onExportWhatsApp,
}: DashboardSummaryProps) {
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            {!isServerRole && currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                <StaleSalesCleanupBanner barId={currentBar.id} />
            )}

            {/* Header section */}
            <div className="flex items-center justify-between">
                <h2 className="text-h3 text-foreground">Indicateurs clés</h2>
                {currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                    <DataFreshnessIndicatorCompact
                        viewName="daily_sales_summary"
                        onRefreshComplete={onRefresh}
                    />
                )}
            </div>

            {/* KPI Grid — cards plates avec accent brand uniforme, hors-norme = sémantique */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-guide="revenue-stats">
                {/* Revenus — KPI principal, légèrement accentué */}
                <div className="bg-card rounded-2xl p-4 shadow-sm border border-brand-primary/30 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <DollarSign size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Revenus</span>
                    </div>
                    <AnimatedCounter value={todayTotal} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground truncate mt-1 tabular-nums">{formatPrice(todayTotal)} net</p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <ShoppingCart size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Ventes</span>
                    </div>
                    <AnimatedCounter value={salesCount} className="text-h2 font-semibold text-foreground tabular-nums" />
                    {/* ⚠️ En RESTAU, le compteur porte les tickets CONTENANT un
                        plat (derive dans DailyDashboard) — d ou un libelle qui
                        le precise. « X en attente » n aurait aucun sens : les
                        ventes en attente de validation ne se ventilent pas. */}
                    <p className="text-caption text-muted-foreground mt-1 tabular-nums">
                        {scope === 'kitchen'
                            ? 'commandes avec plat'
                            : `${pendingSalesCount} en attente`}
                    </p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <Package size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Articles</span>
                    </div>
                    <AnimatedCounter value={totalItems} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground mt-1">Total vendus</p>
                </div>

                {/* ⭐⭐ TROIS CAS, ET LA GRILLE FAIT TOUJOURS 6 CARTES.
                    `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` : 6 est le seul
                    total qui tombe juste aux trois paliers. Chaque branche en
                    rend donc exactement 3, jamais 2 ni 4.

                    · RESTAU — Alertes/Retours/Consign. portent sur les
                      BOISSONS (§13.1) : remplacees par les 4 cartes cuisine.
                    · TOUT sur bar MIXTE — Retours et Consignations cedent
                      leur place a Ingredients et Pret. Sans cela, le mode
                      cense tout montrer etait le seul a cacher la cuisine.
                    · SINON (bar pur, ou portee Bar) — bloc d avant, a
                      l identique (§3). */}
                {scope === 'kitchen' ? (
                    <KitchenSummaryCards barId={barId} businessDate={businessDate ?? ''} />
                ) : (
                <>
                {/* Alertes — sémantique rouge préservée (signal universel), avec variantes dark */}
                <div className="bg-card rounded-2xl p-4 shadow-sm border border-red-200 dark:border-red-900/40 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                            <AlertTriangle size={18} />
                        </div>
                        {/* ⚠️ En « Tout » sur bar mixte, cette carte cohabite avec
                            « Ingredients » : sans etiquette, on croirait qu elle
                            couvre AUSSI la cuisine, alors qu elle ne porte que
                            `bar_products`. */}
                        <div className="flex flex-col items-end gap-1 min-w-0">
                            <span className="text-micro text-muted-foreground">Alertes</span>
                            {hasRestaurant && scope === 'all' && (
                                <span className="px-1.5 py-px rounded text-micro font-medium bg-muted text-muted-foreground border border-border leading-tight">
                                    Bar
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-h2 font-semibold text-red-600 dark:text-red-400 tabular-nums">{lowStockProducts.length}</div>
                    <p className="text-caption text-muted-foreground mt-1">Stock critique</p>
                </div>

                {hasRestaurant && scope === 'all' ? (
                    /* ⭐ Les DEUX cartes cuisine du mode Tout — le composant en
                       rend toujours exactement 2, y compris pour le serveur
                       (Ingredients y devient Retours). C est ce qui garantit
                       le compte de 6. */
                    <MixedScopeKitchenCards
                        barId={barId}
                        returnsCount={returnsCount}
                        pendingReturnsCount={pendingReturnsCount}
                    />
                ) : (
                <>
                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <RotateCcw size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Retours</span>
                    </div>
                    <AnimatedCounter value={returnsCount} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground mt-1 tabular-nums">{pendingReturnsCount} en attente</p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <Archive size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Consign.</span>
                    </div>
                    <div className="text-h2 font-semibold text-foreground tabular-nums">{consignmentsCount}</div>
                    <p className="text-caption text-muted-foreground mt-1">Fiches actives</p>
                </div>
                </>
                )}
                </>
                )}
            </div>

            {/* Insights — 2 panneaux compagnons (top produits + stock à surveiller) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <TrendingUp size={18} />
                        </div>
                        <h3 className="text-h3 text-foreground">Top produits vendus</h3>
                    </div>
                    {topProductsList.length > 0 ? (
                        <div className="space-y-2.5">
                            {topProductsList.map((p, i) => (
                                <div key={i} className="flex justify-between items-center py-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-subtle text-brand-primary text-caption font-semibold flex-shrink-0">
                                            {i + 1}
                                        </span>
                                        <span className="text-body-sm text-foreground/80 truncate">{p.name}</span>
                                    </div>
                                    <span className="text-body-sm font-semibold text-foreground tabular-nums flex-shrink-0 ml-2">
                                        {p.qty} <span className="text-caption text-muted-foreground font-normal">unités</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-muted rounded-xl border border-dashed border-border">
                            <p className="text-body-sm text-muted-foreground">Aucune vente enregistrée pour le moment</p>
                        </div>
                    )}
                </div>

                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                            <AlertTriangle size={18} />
                        </div>
                        {/* ⚠️ En « Tout » sur bar mixte, ce panneau ne liste que
                            les BOISSONS alors qu une carte « Ingredients » est
                            desormais juste au-dessus : sans « boissons » dans
                            le titre, on croirait que la cuisine y figure aussi
                            et qu elle n a rien a signaler. Le detail des
                            ingredients reste en portee Restau. */}
                        <h3 className="text-h3 text-foreground">
                            {scope === 'kitchen'
                                ? 'Vigilance ingrédients'
                                : hasRestaurant && scope === 'all'
                                    ? 'Points de vigilance boissons'
                                    : 'Points de vigilance stock'}
                        </h3>
                    </div>
                    {/* ⭐ En RESTAU, la liste porte sur les INGREDIENTS : les
                        alertes de bar_products n ont rien a dire de la cuisine. */}
                    {scope === 'kitchen' ? (
                        <KitchenVigilanceList barId={barId} />
                    ) : lowStockProducts.length > 0 ? (
                        <div className="space-y-2.5">
                            {lowStockProducts.slice(0, 5).map(p => (
                                <div key={p.id} className="flex justify-between items-center py-1">
                                    <span className="text-body-sm text-foreground/80 truncate min-w-0">{p.name}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <span className="text-caption text-muted-foreground">Restant</span>
                                        <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-caption font-semibold tabular-nums">
                                            {allProductsStockInfo[p.id]?.availableStock ?? p.stock}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {lowStockProducts.length > 5 && (
                                <button
                                    onClick={() => navigate('/inventory')}
                                    className="w-full mt-2 text-caption text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
                                >
                                    Voir les {lowStockProducts.length - 5} autres alertes →
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-green-50 dark:bg-green-950/30 rounded-xl border border-dashed border-green-200 dark:border-green-900/40">
                            <p className="text-body-sm text-green-700 dark:text-green-400 font-medium">Tous vos stocks sont au-dessus des seuils ✓</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Partage du rapport */}
            <div className="bg-card rounded-2xl p-5 border border-border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h4 className="text-h3 text-foreground">Partager le rapport du jour</h4>
                    <p className="text-body-sm text-muted-foreground mt-0.5">Envoyez le résumé des ventes à votre équipe via WhatsApp</p>
                </div>

                <div className="flex flex-row gap-2 w-full sm:w-auto">
                    <EnhancedButton
                        onClick={onExportWhatsApp}
                        variant="success"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 text-white rounded-lg text-body-sm font-semibold shadow-sm active:scale-[0.98] transition-all"
                    >
                        <MessageCircle size={16} />
                        WhatsApp
                    </EnhancedButton>
                </div>
            </div>
        </div>
    );
}
