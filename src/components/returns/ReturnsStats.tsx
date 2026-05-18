import { useMemo } from "react";
import { motion } from "framer-motion";
import {
    RotateCcw,
    DollarSign,
    AlertTriangle,
    TrendingDown,
    Package,
    CheckCircle2,
} from "lucide-react";
import { Return, ReturnReason, ReturnReasonConfig } from "../../types";
import { AnimatedCounter } from "../AnimatedCounter";

interface ReturnsStatsProps {
    returns: Return[];
    returnReasons: Record<ReturnReason, ReturnReasonConfig>;
}

/**
 * Premium analytics view for returns.
 * Displays KPI cards and visual breakdowns by reason.
 */
export function ReturnsStats({ returns, returnReasons }: ReturnsStatsProps) {
    // Aggregate stats via useMemo
    const stats = useMemo(() => {
        const totalReturnsCount = returns.length;
        const validatedReturns = returns.filter(
            (r) => r.status === "approved" || r.status === "validated" || r.status === "restocked",
        );
        const pendingReturns = returns.filter((r) => r.status === "pending");

        const validatedCount = validatedReturns.length;
        const pendingCount = pendingReturns.length;

        const totalRefunded = validatedReturns
            .filter((r) => r.isRefunded)
            .reduce((sum, r) => sum + r.refundAmount, 0);

        const pendingRefundAmount = pendingReturns
            .filter((r) => r.isRefunded)
            .reduce((sum, r) => sum + r.refundAmount, 0);

        const itemsRestocked = returns
            .filter((r) => r.status === "restocked")
            .reduce((sum, r) => sum + r.quantityReturned, 0);

        const lostProductCount = validatedReturns
            .filter((r) => r.reason === "defective" || r.reason === "expired")
            .reduce((sum, r) => sum + r.quantityReturned, 0);

        const rejectionRate =
            totalReturnsCount > 0
                ? (returns.filter((r) => r.status === "rejected").length /
                    totalReturnsCount) *
                100
                : 0;

        // Reason breakdown
        const reasonStats = (Object.keys(returnReasons) as ReturnReason[]).map(
            (reason) => {
                const count = returns.filter((r) => r.reason === reason).length;
                const percentage =
                    totalReturnsCount > 0 ? (count / totalReturnsCount) * 100 : 0;
                return {
                    reason,
                    label: returnReasons[reason].label,
                    icon: returnReasons[reason].icon,
                    color: returnReasons[reason].color,
                    count,
                    percentage,
                };
            },
        );

        const topReason = reasonStats.reduce(
            (prev, current) => (prev.count > current.count ? prev : current),
            reasonStats[0],
        );

        return {
            totalRefunded,
            pendingRefundAmount,
            validatedCount,
            pendingCount,
            itemsRestocked,
            lostProductCount,
            rejectionRate,
            reasonStats,
            topReason,
        };
    }, [returns, returnReasons]);

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: { delay: i * 0.1 },
        }),
    };

    const kpis = [
        { Icon: RotateCcw, label: "À traiter", value: stats.pendingCount, sub: `Potentiel : ${stats.pendingRefundAmount} F`, accent: false, animated: true, hasPulse: stats.pendingCount > 0 },
        { Icon: DollarSign, label: "Remboursés", value: stats.totalRefunded, sub: "Total effectués", unit: "FCFA", animated: true },
        { Icon: CheckCircle2, label: "Validés", value: stats.validatedCount, sub: "Retours approuvés", animated: true },
        { Icon: Package, label: "En stock", value: stats.itemsRestocked, sub: "Réintégrés", unit: "unités", animated: true },
        { Icon: AlertTriangle, label: "Pertes", value: stats.lostProductCount, sub: "Détruits / Perdus", unit: "unités", isDanger: true },
        { Icon: TrendingDown, label: "Refus", value: Math.round(stats.rejectionRate), sub: "Taux de rejet", unit: "%", animated: true },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {kpis.map((kpi, idx) => (
                    <motion.div
                        key={kpi.label}
                        custom={idx}
                        initial="hidden"
                        animate="visible"
                        variants={cardVariants}
                        className={`bg-card rounded-2xl p-4 shadow-sm border transition-shadow hover:shadow-md ${kpi.isDanger ? 'border-red-200 dark:border-red-900/40' : 'border-border'}`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${kpi.isDanger ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'bg-brand-subtle text-brand-primary'}`}>
                                <kpi.Icon size={18} />
                            </div>
                            <span className="text-micro text-muted-foreground">{kpi.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            {kpi.animated !== false ? (
                                <AnimatedCounter value={kpi.value} className={`text-h2 font-semibold tabular-nums ${kpi.isDanger ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`} />
                            ) : (
                                <div className={`text-h2 font-semibold tabular-nums ${kpi.isDanger ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                                    <AnimatedCounter value={kpi.value} />
                                </div>
                            )}
                            {kpi.unit && (
                                <span className="text-caption font-medium text-muted-foreground">{kpi.unit}</span>
                            )}
                            {kpi.hasPulse && (
                                <span className="flex h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" aria-hidden="true" />
                            )}
                        </div>
                        <p className="text-caption text-muted-foreground mt-1 truncate tabular-nums">{kpi.sub}</p>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Breakdown par motif */}
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
                    <h3 className="text-h3 text-foreground mb-5 flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <TrendingDown size={18} />
                        </div>
                        Répartition par motif
                    </h3>
                    <div className="space-y-4">
                        {stats.reasonStats.map((item) => (
                            <div key={item.reason} className="space-y-1.5">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-body-sm font-medium text-foreground/80 flex items-center gap-2">
                                        <span className="text-base leading-none">{item.icon}</span>
                                        <span>{item.label}</span>
                                    </span>
                                    <span className="text-caption text-muted-foreground">
                                        <span className="text-body-sm font-semibold text-foreground mr-1 tabular-nums">{item.count}</span>
                                        retour{item.count > 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${item.percentage}%` }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                        className={`h-full rounded-full ${item.color === "red"
                                            ? "bg-red-500"
                                            : item.color === "amber" || item.color === "orange"
                                                ? "bg-brand-primary"
                                                : item.color === "blue"
                                                    ? "bg-blue-500"
                                                    : "bg-gray-400"
                                            }`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Analyse & Conseil — panneau analytique propre */}
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <TrendingDown size={18} />
                        </div>
                        <div>
                            <h4 className="text-h3 text-foreground">Analyse & conseil</h4>
                            <p className="text-caption text-muted-foreground">Intelligence opérationnelle</p>
                        </div>
                    </div>

                    {stats.validatedCount > 0 ? (
                        <>
                            <p className="text-body text-foreground mb-2 font-semibold">
                                Motif dominant : <span className="text-brand-primary">{stats.topReason?.label}</span>
                            </p>
                            <p className="text-body-sm text-foreground/70 leading-relaxed mb-5">
                                {stats.topReason?.reason === 'defective'
                                    ? "Un taux élevé de produits défectueux suggère un problème de stockage ou de manipulation. Un audit de la chaîne froide est conseillé."
                                    : stats.topReason?.reason === 'wrong_item'
                                        ? "Les erreurs de saisie impactent votre inventaire. Renforcez la double vérification produit (commande, ticket, produit servi) pour réduire ces écarts."
                                        : "La fréquence des retours est stable. Veillez à maintenir la rigueur actuelle sur les contrôles de caisse."}
                            </p>
                        </>
                    ) : (
                        <div className="py-8 text-center bg-muted rounded-xl border border-dashed border-border mb-5">
                            <p className="text-body-sm text-muted-foreground italic px-4">
                                En attente de données validées pour générer une recommandation.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-muted border border-border">
                            <p className="text-micro text-muted-foreground mb-1">Impact ventes</p>
                            <p className="text-body font-semibold text-foreground tabular-nums">
                                {Math.round((stats.validatedCount / (stats.validatedCount + stats.pendingCount || 1)) * 100)}%
                                <span className="text-caption font-medium text-muted-foreground ml-1">traités</span>
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted border border-border">
                            <p className="text-micro text-muted-foreground mb-1">Qualité stock</p>
                            <p className={`text-body font-semibold ${stats.itemsRestocked > stats.lostProductCount ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {stats.itemsRestocked > stats.lostProductCount ? "Stable" : "Alerte"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
