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
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
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
                <h3 className="font-bold text-gray-900">Inventaire en parfaite santé</h3>
                <p className="text-sm text-gray-500 mt-1">Aucune anomalie détectée sur vos produits.</p>
            </div>
        );
    }

    // ── Fond du panel : couleur sémantique selon sévérité la plus haute ──
    // Les couleurs de statut (rouge/orange) restent hardcodées : elles sont universelles,
    // indépendantes du thème du bar. Pour le cas info-seulement, on utilise le token brand.
    const panelClass = criticalCount > 0
        ? 'bg-red-50 border-red-200'
        : warningCount > 0
            ? 'bg-orange-50 border-orange-200'
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
                <h3 className="font-bold text-gray-900 text-lg">
                    {totalCount} produit{totalCount > 1 ? 's' : ''} nécessite{totalCount > 1 ? 'nt' : ''} votre attention
                </h3>
            </div>

            {/* Pills — flex-wrap : aucun risque de débordement sur mobile */}
            <div className="flex flex-wrap gap-2 justify-center">
                <SeverityPill
                    count={criticalCount}
                    label="Critique"
                    icon={ShieldAlert}
                    colorClass="bg-red-100 text-red-700 border-red-200"
                    iconClass="text-red-500"
                />
                <SeverityPill
                    count={warningCount}
                    label="Alerte"
                    icon={AlertOctagon}
                    colorClass="bg-orange-100 text-orange-700 border-orange-200"
                    iconClass="text-orange-500"
                />
                <SeverityPill
                    count={infoCount}
                    label="Info"
                    icon={Info}
                    colorClass="bg-amber-100 text-amber-700 border-amber-200"
                    iconClass="text-amber-500"
                />
            </div>

            {/* Contexte stock bas → opérations (seulement si pertinent) */}
            {lowStockCount > 0 && (
                <p className="text-sm text-gray-600 flex items-center justify-center gap-1.5">
                    <Wrench size={14} className="text-gray-400 shrink-0" />
                    Dont{' '}
                    <span className="font-semibold text-gray-800">{lowStockCount}</span>
                    {' '}en stock bas à réapprovisionner
                </p>
            )}

            <Button onClick={onNavigateToOperations} className="font-bold px-8">
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
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold ${colorClass} ${dimClass}`}>
            <Icon size={14} className={iconClass} />
            <span className="text-base font-black leading-none">{count}</span>
            <span className="text-xs">{label}</span>
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
        {
            label: "Catégories",
            value: stats.categoriesCount,
            icon: Tags,
            color: "bg-purple-50 text-purple-600",
            delay: 0
        },
        {
            label: "Produits",
            value: stats.productsCount,
            icon: Container,
            color: "bg-blue-50 text-blue-600",
            delay: 0.1
        },
        {
            label: "Valeur Achat Stock Actuel",
            value: formatPrice(stats.purchaseValue),
            icon: Wallet,
            color: "bg-emerald-50 text-emerald-600",
            delay: 0.2
        },
        {
            label: "Valeur Vente Stock Actuel",
            value: formatPrice(stats.saleValue),
            icon: TrendingUp,
            color: "bg-brand-subtle text-brand-dark",
            delay: 0.3
        }
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card, idx) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: card.delay }}
                    whileTap={{ scale: 0.98 }}
                    className="p-4 rounded-2xl border border-gray-100 shadow-sm bg-white flex flex-col items-center justify-center text-center gap-2"
                >
                    <div className={`w-10 h-10 rounded-full ${card.color} flex items-center justify-center mb-1`}>
                        <card.icon size={20} />
                    </div>
                    <div>
                        <div className="text-xl font-black text-gray-900 leading-tight">
                            {card.value}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
                            {card.label}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
