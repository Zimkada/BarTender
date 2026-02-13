import React from 'react';
import { Trash2, ChevronDown, ChevronUp, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { Salary } from '../../../types';
import { cn } from '../../../lib/utils';
import { formatPeriod } from '../../../utils/accounting';

interface SalaryListItemProps {
    period: string;
    data: {
        amount: number;
        count: number;
        salaries: Salary[];
    };
    isExpanded: boolean;
    onToggle: () => void;
    onDelete: (id: string) => void;
    getMemberName: (id: string) => string;
    getMemberRole: (id: string) => string;
    isMobile: boolean;
}

export const SalaryListItem: React.FC<SalaryListItemProps> = ({
    period,
    data,
    isExpanded,
    onToggle,
    onDelete,
    getMemberName,
    getMemberRole,
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
                        📅
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-gray-800">{formatPeriod(period)}</p>
                        <p className="text-xs text-gray-500 font-medium">
                            {data.count} paiement{data.count > 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-black text-indigo-600">
                            {formatPrice(data.amount)}
                        </p>
                    </div>
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                        isExpanded ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400"
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
                            {data.salaries.map(salary => (
                                <div
                                    key={salary.id}
                                    className="flex items-center justify-between bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-white shadow-sm group transition-all hover:shadow-md"
                                >
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center scale-90">
                                            <User size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-gray-900 truncate">
                                                    {getMemberName(salary.memberId)}
                                                </p>
                                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">
                                                    {getMemberRole(salary.memberId)}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                                                Payé le {new Date(salary.paidAt).toLocaleDateString('fr-FR')}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-black text-indigo-600">
                                                {formatPrice(salary.amount)}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => onDelete(salary.id)}
                                        className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 ml-2"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
