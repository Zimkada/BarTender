import type { ElementType } from 'react';
import { Container, LayoutGrid, AlertTriangle, Tags, Wallet, TrendingUp, ShieldAlert, AlertOctagon, Info, CheckCircle2, Wrench } from 'lucide-react';
import { motion } from 'framer-motion';
import { Product, BarSettings } from '../../types';
import { ProductWithAnomaly } from '../../hooks/useInventoryFilter';
import { CategoryStatsList } from '../common/CategoryStatsList';
import { Button } from '../ui/Button';
import { getDisplayCost } from '../../utils/costResolution';

interface InventoryStatsProps {
    products: Product[];
    categoryStats: any[];
    productsWithAnomalies: ProductWithAnomaly[];
    lowStockCount: number;
    onNavigateToOperations: () => void;
    formatPrice: (amount: number) => string;
    barSettings?: BarSettings | null;
}

export function InventoryStats({
    products,
    categoryStats,
    productsWithAnomalies,
    lowStockCount,
    onNavigateToOperations,
    formatPrice,
    barSettings,
}: InventoryStatsProps) {

    return (
        <div className="space-y-6" data-guide="inventory-stats">
            {/* Résumé Global */}
            <InventorySummaryCards products={products} formatPrice={formatPrice} barSettings={barSettings} />

            {/* Répartition Catégories */}
            <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
                <h2 className="text-h3 text-foreground mb-4 flex items-center gap-2">
                    <LayoutGrid size={18} className="text-brand-primary" />
                    Répartition par catégorie
                </h2>
                <div className="space-y-4">
                    <CategoryStatsList stats={categoryStats} showAlerts={false} />
                </div>
            </div>

            {/* Panneau d'attention unifié */}
            <AttentionPanel
                productsWithAnomalies={productsWithAnomalies}
                lowStockCount={lowStockCount}
                onNavigateToOperations={onNavigateToOperations}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : panneau d'attention unifié
// ─────────────────────────────────────────────────────────────

interface AttentionPanelProps {
    productsWithAnomalies: ProductWithAnomaly[];
    lowStockCount: number;
    onNavigateToOperations: () => void;
}

function AttentionPanel({ productsWithAnomalies, lowStockCount, onNavigateToOperations }: AttentionPanelProps) {
    const anomalousProducts = productsWithAnomalies.filter(p => !!p.anomaly);
    const totalCount = anomalousProducts.length;

    const criticalCount = anomalousProducts.filter(p => p.anomaly?.severity === 'red').length;
    const warningCount  = anomalousProducts.filter(p => p.anomaly?.severity === 'orange').length;
    const infoCount     = anomalousProducts.filter(p => p.anomaly?.severity === 'yellow').length;

    // ── État sain : utilise les tokens brand (s'adapte au thème du bar) ──
    if (totalCount === 0) {
        return (
            <div className="bg-brand-subtle p-6 rounded-2xl border border-brand-primary/20 text-center">
                <CheckCircle2 className="mx-auto text-brand-primary mb-2" size={32} />
                <h3 className="text-h3 text-foreground">Inventaire en parfaite santé</h3>
                <p className="text-body-sm text-muted-foreground mt-1">Aucune anomalie détectée sur vos produits.</p>
            </div>
        );
    }

    // ── Fond du panel : couleur sémantique selon sévérité la plus haute ──
    // Les couleurs de statut (rouge/orange) restent hardcodées : elles sont universelles,
    // indépendantes du thème du bar. Pour le cas info-seulement, on utilise le token brand.
    const panelClass = criticalCount > 0
        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40'
        : warningCount > 0
            ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/40'
            : 'bg-brand-subtle border-brand-primary/20';

    const iconClass = criticalCount > 0
        ? 'text-red-500'
        : warningCount > 0
            ? 'text-orange-500'
            : 'text-brand-primary';

    return (
        <div className={`${panelClass} p-6 rounded-2xl border text-center space-y-4`}>

            {/* En-tête */}
            <div>
                <AlertTriangle className={`mx-auto ${iconClass} mb-2`} size={32} />
                <h3 className="text-h3 text-foreground">
                    {totalCount} produit{totalCount > 1 ? 's' : ''} nécessite{totalCount > 1 ? 'nt' : ''} votre attention
                </h3>
            </div>

            {/* Pills — flex-wrap : aucun risque de débordement sur mobile */}
            <div className="flex flex-wrap gap-2 justify-center">
                <SeverityPill
                    count={criticalCount}
                    label="Critique"
                    icon={ShieldAlert}
                    colorClass="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40"
                    iconClass="text-red-500"
                />
                <SeverityPill
                    count={warningCount}
                    label="Alerte"
                    icon={AlertOctagon}
                    colorClass="bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900/40"
                    iconClass="text-orange-500"
                />
                <SeverityPill
                    count={infoCount}
                    label="Info"
                    icon={Info}
                    colorClass="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/40"
                    iconClass="text-amber-500"
                />
            </div>

            {/* Contexte stock bas → opérations (seulement si pertinent) */}
            {lowStockCount > 0 && (
                <p className="text-body-sm text-foreground/80 flex items-center justify-center gap-1.5">
                    <Wrench size={14} className="text-muted-foreground shrink-0" />
                    Dont{' '}
                    <span className="font-semibold text-foreground tabular-nums">{lowStockCount}</span>
                    {' '}en stock bas à réapprovisionner
                </p>
            )}

            <Button onClick={onNavigateToOperations} className="px-8">
                Aller aux opérations
            </Button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Micro-composant : pill de sévérité (horizontal, compact)
// flex-wrap côté parent → s'adapte à toute largeur d'écran
// ─────────────────────────────────────────────────────────────

interface SeverityPillProps {
    count: number;
    label: string;
    icon: ElementType;
    colorClass: string;
    iconClass: string;
}

function SeverityPill({ count, label, icon: Icon, colorClass, iconClass }: SeverityPillProps) {
    // Note : classes statiques pour que Tailwind les inclue au build
    const dimClass = count === 0 ? 'opacity-40' : '';

    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${colorClass} ${dimClass}`}>
            <Icon size={14} className={iconClass} />
            <span className="text-body-sm font-semibold tabular-nums leading-none">{count}</span>
            <span className="text-caption font-medium">{label}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : cartes résumé global
// ─────────────────────────────────────────────────────────────

function InventorySummaryCards({ products, formatPrice, barSettings }: { products: Product[], formatPrice: (amount: number) => string, barSettings?: BarSettings | null }) {
    const stats = {
        categoriesCount: new Set(products.map(p => p.categoryId)).size,
        productsCount: products.length,
        // Respect costDisplayMethod : CUMP ou dernier coût selon le réglage du bar
        purchaseValue: products.reduce((acc, p) => acc + (p.stock * (getDisplayCost(p, barSettings).cost || 0)), 0),
        saleValue: products.reduce((acc, p) => acc + (p.stock * p.price), 0),
    };

    const cards = [
        { label: "Catégories", value: stats.categoriesCount, icon: Tags },
        { label: "Produits", value: stats.productsCount, icon: Container },
        { label: "Valeur d'achat", value: formatPrice(stats.purchaseValue), icon: Wallet },
        { label: "Valeur de vente", value: formatPrice(stats.saleValue), icon: TrendingUp },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card, idx) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className="p-4 rounded-2xl border border-border shadow-sm bg-card flex flex-col items-start gap-3"
                >
                    <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                        <card.icon size={18} />
                    </div>
                    <div className="min-w-0 w-full">
                        <div className="text-h2 text-foreground leading-tight tabular-nums truncate">
                            {card.value}
                        </div>
                        <div className="text-micro text-muted-foreground mt-1">
                            {card.label}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
