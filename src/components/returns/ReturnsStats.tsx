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

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* KPI 1: Pending Returns (À traiter) */}
                <motion.div
                    custom={0}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow relative overflow-hidden"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-brand-primary/10 rounded-lg text-brand-primary">
                            <RotateCcw size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">À Traiter</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <AnimatedCounter value={stats.pendingCount} className="text-xl font-black text-gray-900" />
                        {stats.pendingCount > 0 && (
                            <span className="flex h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
                        )}
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium truncate mt-1 uppercase tracking-tighter">
                        Potentiel: {stats.pendingRefundAmount} F
                    </p>
                </motion.div>

                {/* KPI 2: Total Refunded (Effectués) */}
                <motion.div
                    custom={1}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <DollarSign size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Remboursés</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <AnimatedCounter value={stats.totalRefunded} className="text-xl font-black text-gray-900" />
                        <span className="text-[10px] font-black text-gray-400 uppercase">FCFA</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Total effectués</p>
                </motion.div>

                {/* KPI 3: Validated Returns */}
                <motion.div
                    custom={2}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <CheckCircle2 size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Validés</span>
                    </div>
                    <AnimatedCounter value={stats.validatedCount} className="text-xl font-black text-gray-900" />
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Retours approuvés</p>
                </motion.div>

                {/* KPI 4: Items Restocked (Articles Remis en Stock) */}
                <motion.div
                    custom={3}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Package size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">En Stock</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <AnimatedCounter value={stats.itemsRestocked} className="text-xl font-black text-gray-900" />
                        <span className="text-[10px] font-black text-indigo-400 uppercase">UNITÉS</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Réintégrés</p>
                </motion.div>

                {/* KPI 5: Product Loss (Pertes Produits) */}
                <motion.div
                    custom={4}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-red-500/60 hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-red-50 rounded-lg text-red-600">
                            <AlertTriangle size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Pertes</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <div className="text-xl font-black text-red-600">
                            <AnimatedCounter value={stats.lostProductCount} />
                        </div>
                        <span className="text-[10px] font-black text-red-400 uppercase">UNITÉS</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Détruits / Perdus</p>
                </motion.div>

                {/* KPI 6: Rejection Rate */}
                <motion.div
                    custom={5}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
                            <TrendingDown size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Refus</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <AnimatedCounter value={Math.round(stats.rejectionRate)} className="text-xl font-black text-gray-900" />
                        <span className="text-sm font-black text-gray-400">%</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Taux de rejet</p>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Breakdown by Reason - Design Elite */}
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl shadow-brand-subtle/5 relative overflow-hidden">
                    <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                        Répartition par Motif
                    </h3>
                    <div className="space-y-5">
                        {stats.reasonStats.map((item) => (
                            <div key={item.reason} className="space-y-2">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-[11px] font-black text-gray-600 flex items-center gap-2">
                                        <span className="text-base leading-none">{item.icon}</span>
                                        <span className="uppercase tracking-tight">{item.label}</span>
                                    </span>
                                    <span className="text-[10px] font-bold">
                                        <span className="text-gray-900 font-black text-xs mr-1">{item.count}</span>
                                        <span className="text-gray-400 uppercase tracking-tighter">retour{item.count > 1 ? 's' : ''}</span>
                                    </span>
                                </div>
                                <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden border border-gray-100/50">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${item.percentage}%` }}
                                        transition={{ duration: 1.2, ease: "circOut" }}
                                        className={`h-full rounded-full ${item.color === "red"
                                            ? "bg-gradient-to-r from-red-600 to-red-400 shadow-sm shadow-red-200"
                                            : item.color === "amber" || item.color === "orange"
                                                ? "bg-gradient-to-r from-brand-primary to-amber-300 shadow-sm shadow-brand-subtle"
                                                : item.color === "blue"
                                                    ? "bg-gradient-to-r from-blue-600 to-blue-400 shadow-sm shadow-blue-200"
                                                    : "bg-gradient-to-r from-purple-600 to-purple-400 shadow-sm shadow-purple-200"
                                            }`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Insights / Operational Recommendation - Design Dark Intel */}
                <div className="bg-[#0c121e] p-7 rounded-[2.5rem] text-white relative overflow-hidden flex flex-col justify-center border border-white/5 shadow-2xl shadow-blue-900/20">
                    {/* Background Glow Effect */}
                    <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/10 blur-[80px] rounded-full -mr-24 -mt-24" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-primary/5 blur-[60px] rounded-full -ml-16 -mb-16" />

                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-white/10 backdrop-blur-xl shadow-inner">
                                <TrendingDown size={22} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h4 className="font-black text-sm uppercase tracking-[0.1em] text-blue-400 mb-0.5">
                                    Analyse & Conseil
                                </h4>
                                <p className="text-[10px] text-gray-500 font-black tracking-[0.2em] uppercase opacity-60">Intelligence Opérationnelle</p>
                            </div>
                        </div>

                        {stats.validatedCount > 0 ? (
                            <>
                                <p className="text-xl font-black mb-3 leading-tight tracking-tight uppercase">
                                    Motif Dominant : <span
                                        style={{ background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                                    >{stats.topReason?.label}</span>
                                </p>
                                <p className="text-[13px] text-gray-400 leading-relaxed mb-8 font-medium">
                                    {stats.topReason?.reason === 'defective'
                                        ? "Un taux élevé de produits défectueux suggère un problème de stockage ou de manipulation. Un audit de la chaîne froide est conseillé."
                                        : stats.topReason?.reason === 'wrong_item'
                                            ? "Les erreurs de saisie impactent votre inventaire. Un rappel sur le scan systématique réduirait ces écarts."
                                            : "La fréquence des retours est stable. Veillez à maintenir la rigueur actuelle sur les contrôles de caisse."}
                                </p>
                            </>
                        ) : (
                            <div className="py-10 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 mb-8">
                                <p className="text-xs text-gray-500 italic font-medium px-4">
                                    Protocoles analytiques en attente de données validées pour générer une recommandation stratégique.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 rounded-[1.5rem] bg-white/5 border border-white/10 backdrop-blur-sm group hover:bg-white/10 transition-all">
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Impact Ventes</p>
                                <p
                                    className="text-lg font-black tracking-tighter"
                                    style={{ background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                                >
                                    {Math.round((stats.validatedCount / (stats.validatedCount + stats.pendingCount || 1)) * 100)}% <span className="text-[10px] uppercase font-bold tracking-tighter text-gray-600">traités</span>
                                </p>
                            </div>
                            <div className="p-4 rounded-[1.5rem] bg-white/5 border border-white/10 backdrop-blur-sm group hover:bg-white/10 transition-all">
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Qualité Stock</p>
                                <p
                                    className="text-lg font-black tracking-tighter uppercase"
                                    style={{ background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                                >
                                    {stats.itemsRestocked > stats.lostProductCount ? "Stable" : "Alerte"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
