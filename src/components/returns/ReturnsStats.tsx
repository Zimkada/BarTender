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
            (r) => r.status === "approved" || r.status === "restocked",
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

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* KPI 1: Pending Returns (À traiter) */}
                <motion.div
                    custom={0}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-brand-subtle p-4 rounded-2xl border border-brand-subtle flex flex-col gap-1 ring-2 ring-brand-primary/10"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-brand-primary shadow-sm">
                            <RotateCcw size={16} />
                        </div>
                        {stats.pendingCount > 0 && (
                            <span className="flex h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
                        )}
                    </div>
                    <span className="text-[10px] font-bold text-brand-dark uppercase tracking-tighter">
                        À Traiter
                    </span>
                    <div className="text-2xl font-black text-brand-primary leading-none">
                        <AnimatedCounter value={stats.pendingCount} />
                    </div>
                    <span className="text-[9px] text-brand-primary/60 font-medium font-mono uppercase">
                        Potentiel: {stats.pendingRefundAmount} F
                    </span>
                </motion.div>

                {/* KPI 2: Total Refunded (Effectués) */}
                <motion.div
                    custom={1}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-sky-50 p-4 rounded-2xl border border-sky-100 flex flex-col gap-1"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="w-8 h-8 rounded-full bg-sky-200 flex items-center justify-center text-sky-700">
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <span className="text-[10px] font-bold text-sky-700 uppercase tracking-tighter">
                        Remboursements
                    </span>
                    <div className="text-xl font-black text-sky-900 leading-none">
                        <AnimatedCounter value={stats.totalRefunded} />
                        <span className="text-[10px] ml-1">FCFA</span>
                    </div>
                    <span className="text-[9px] text-sky-600 font-medium">Effectués</span>
                </motion.div>

                {/* KPI 3: Validated Returns */}
                <motion.div
                    custom={2}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col gap-1"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700">
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tighter">
                        Retours Validés
                    </span>
                    <div className="text-2xl font-black text-emerald-900 leading-none">
                        <AnimatedCounter value={stats.validatedCount} />
                    </div>
                    <span className="text-[9px] text-emerald-600 font-medium">Approuvés</span>
                </motion.div>

                {/* KPI 4: Items Restocked (Articles Remis en Stock) */}
                <motion.div
                    custom={3}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col gap-1"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-blue-700">
                            <Package size={16} />
                        </div>
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-tighter">
                        Remis en Stock
                    </span>
                    <div className="text-2xl font-black text-blue-900 leading-none">
                        <AnimatedCounter value={stats.itemsRestocked} />
                        <span className="text-[10px] ml-1 font-bold text-blue-600">UNITES</span>
                    </div>
                    <span className="text-[9px] text-blue-600 font-medium">Remis en stock</span>
                </motion.div>

                {/* KPI 5: Product Loss (Pertes Produits) */}
                <motion.div
                    custom={4}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex flex-col gap-1"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="w-8 h-8 rounded-full bg-rose-200 flex items-center justify-center text-rose-700">
                            <AlertTriangle size={16} />
                        </div>
                    </div>
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-tighter">
                        Pertes Produits
                    </span>
                    <div className="text-2xl font-black text-rose-900 leading-none">
                        <AnimatedCounter value={stats.lostProductCount} />
                        <span className="text-[10px] ml-1 font-bold text-rose-600">UNITES</span>
                    </div>
                    <span className="text-[9px] text-rose-600 font-medium">Détruits / Perdus</span>
                </motion.div>

                {/* KPI 6: Rejection Rate */}
                <motion.div
                    custom={5}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col gap-1"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700">
                            <TrendingDown size={16} />
                        </div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tighter">
                        Taux de Rejet
                    </span>
                    <div className="text-2xl font-black text-gray-900 leading-none">
                        <AnimatedCounter value={Math.round(stats.rejectionRate)} />
                        <span className="text-sm ml-1">%</span>
                    </div>
                    <span className="text-[9px] text-gray-500 font-medium">Global</span>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Breakdown by Reason */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <RotateCcw size={14} />
                        Répartition par Motif
                    </h3>
                    <div className="space-y-4">
                        {stats.reasonStats.map((item) => (
                            <div key={item.reason} className="space-y-1">
                                <div className="flex justify-between text-[11px] font-bold">
                                    <span className="text-gray-600">
                                        {item.icon} {item.label}
                                    </span>
                                    <span className="text-gray-400">{item.count} retours</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${item.percentage}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                        className={`h-full rounded-full ${item.color === "red"
                                            ? "bg-red-500"
                                            : item.color === "amber" || item.color === "orange"
                                                ? "bg-brand-primary"
                                                : item.color === "blue"
                                                    ? "bg-blue-500"
                                                    : "bg-purple-500"
                                            }`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Insights / Operational Recommendation */}
                <div className="bg-slate-900 p-6 rounded-2xl text-white relative overflow-hidden flex flex-col justify-center border border-slate-800 shadow-xl">
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/20 backdrop-blur-sm">
                                <TrendingDown size={20} />
                            </div>
                            <div>
                                <h4 className="font-black text-sm uppercase tracking-tighter text-blue-400">
                                    Analyse & Conseil
                                </h4>
                                <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">Insight Opérationnel</p>
                            </div>
                        </div>

                        {stats.validatedCount > 0 ? (
                            <>
                                <p className="text-xl font-black mb-2 leading-tight">
                                    Motif Dominant : <span className="text-brand-primary">{stats.topReason?.label}</span>
                                </p>
                                <p className="text-xs text-gray-400 leading-relaxed mb-6">
                                    {stats.topReason?.reason === 'defective'
                                        ? "Un taux élevé de produits défectueux suggère un problème de stockage ou de manipulation des bouteilles."
                                        : stats.topReason?.reason === 'wrong_item'
                                            ? "Les erreurs de saisie impactent votre inventaire. Un rappel sur l'utilisation du scan pourrait aider."
                                            : "Surveillez la fréquence des retours pour identifier d'éventuels écarts de service."}
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-gray-400 italic mb-6">En attente de données validées pour générer une recommandation.</p>
                        )}

                        <div className="flex gap-2">
                            <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10">
                                <p className="text-[9px] font-bold text-gray-500 uppercase mb-1">Impact Ventes</p>
                                <p className="text-xs font-black">{Math.round((stats.validatedCount / (stats.validatedCount + stats.pendingCount || 1)) * 100)}% traités</p>
                            </div>
                            <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10">
                                <p className="text-[9px] font-bold text-gray-500 uppercase mb-1">Qualité Stock</p>
                                <p className="text-xs font-black">
                                    {stats.itemsRestocked > stats.lostProductCount ? "Stable" : "À surveiller"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-3xl rounded-full translate-x-10 -translate-y-10" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-brand-primary/10 blur-3xl rounded-full -translate-x-10 translate-y-10" />
                </div>
            </div>
        </div>
    );
}
