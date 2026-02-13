import React from 'react';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { UnifiedExpense } from '../../../hooks/pivots/useUnifiedExpenses';
import { cn } from '../../../lib/utils';

interface ExpenseListItemProps {
    categoryKey: string;
    data: {
        label: string;
        icon: string;
        amount: number;
        count: number;
    };
    items: UnifiedExpense[];
    isExpanded: boolean;
    onToggle: () => void;
    onDelete: (id: string) => void;
    isMobile: boolean;
}

export const ExpenseListItem: React.FC<ExpenseListItemProps> = ({
    categoryKey,
    data,
    items,
    isExpanded,
    onToggle,
    onDelete,
    isMobile
}) => {
    const { formatPrice } = useCurrencyFormatter();

    return (
        <div className="border-b border-gray-100 last:border-0">
            <button
                onClick={onToggle}
                className={cn(
                    "w-full p-4 flex items-center justify-between hover:bg-gray-50/80 transition-all",
                    isExpanded && "bg-gray-50/50"
                )}
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-xl">
                        {data.icon}
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-gray-800">{data.label}</p>
                        <p className="text-xs text-gray-500 font-medium">
                            {data.count} opération{data.count > 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-black text-rose-600">
                            -{formatPrice(data.amount)}
                        </p>
                    </div>
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                        isExpanded ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"
                    )}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-gray-50/30"
                    >
                        <div className="px-4 pb-4 space-y-2">
                            {items
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map(item => (
                                    <div
                                        key={item.id}
                                        className="flex items-center justify-between bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-white shadow-sm group transition-all hover:shadow-md"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-bold text-gray-900">
                                                    {formatPrice(item.amount)}
                                                </p>
                                                {item.isOptimistic && (
                                                    <span className="text-[9px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                                        En attente
                                                    </span>
                                                )}
                                                {item.isSupply && (
                                                    <span className="text-[9px] bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                                        Stock
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                                                <span>{new Date(item.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                {item.beneficiary && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                                        <span className="text-indigo-500">{item.beneficiary}</span>
                                                    </>
                                                )}
                                            </div>
                                            {item.notes && (
                                                <p className="text-xs text-gray-600 mt-1 line-clamp-2 italic">
                                                    "{item.notes}"
                                                </p>
                                            )}
                                        </div>

                                        {!item.isSupply && !item.isOptimistic && (
                                            <button
                                                onClick={() => onDelete(item.id)}
                                                className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
