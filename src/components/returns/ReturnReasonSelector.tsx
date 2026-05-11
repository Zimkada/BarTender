import { motion } from "framer-motion";
import { ReturnReason, ReturnReasonConfig } from "../../types";

interface ReturnReasonSelectorProps {
    reasons: Record<ReturnReason, ReturnReasonConfig>;
    selectedReason: ReturnReason;
    onSelect: (reason: ReturnReason) => void;
}

/**
 * Premium visual selector for return reasons.
 * Replaces a standard select with interactive tiles that show the consequences of each choice.
 */
export function ReturnReasonSelector({
    reasons,
    selectedReason,
    onSelect,
}: ReturnReasonSelectorProps) {
    // Mapping logic for tailwind colors to ensure they are consistent with the app's theme
    const getColorClasses = (color: string, isSelected: boolean) => {
        switch (color) {
            case "red":
                return isSelected
                    ? "bg-red-50 border-red-500 ring-2 ring-red-500/20 text-red-900"
                    : "hover:border-red-200 border-gray-100";
            case "orange":
            case "amber":
                return isSelected
                    ? "bg-amber-50/50 border-amber-500 ring-2 ring-amber-500/20 text-amber-900"
                    : "hover:border-amber-200 border-gray-100";
            case "blue":
                return isSelected
                    ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-900"
                    : "hover:border-blue-200 border-gray-100";
            case "purple":
                return isSelected
                    ? "bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-900"
                    : "hover:border-purple-200 border-gray-100";
            default:
                return isSelected
                    ? "bg-gray-50 border-gray-500 ring-2 ring-gray-500/20 text-gray-900"
                    : "hover:border-gray-200 border-gray-100";
        }
    };

    const getActiveDotColor = (color: string) => {
        switch (color) {
            case "red": return "bg-red-500";
            case "orange":
            case "amber": return "bg-brand-primary";
            case "blue": return "bg-blue-500";
            case "purple": return "bg-purple-500";
            default: return "bg-gray-500";
        }
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-guide="returns-reasons">
            {Object.entries(reasons).map(([key, config]) => {
                const isSelected = selectedReason === key;
                const reasonKey = key as ReturnReason;
                const colorClass = getColorClasses(config.color, isSelected);

                return (
                    <motion.button
                        key={key}
                        type="button"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect(reasonKey)}
                        className={`
              relative p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left flex flex-row sm:flex-col gap-3 sm:gap-2 h-auto sm:h-full shadow-sm items-center sm:items-start outline-none focus:outline-none
              ${colorClass}
              ${isSelected ? "z-10" : "bg-white"}
            `}
                    >
                        {/* Icon - Smaller on mobile list mode */}
                        <div className="flex-shrink-0 w-10 h-10 sm:w-auto sm:h-auto flex items-center justify-center bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
                            <span className="text-xl sm:text-2xl" role="img" aria-label={config.label}>
                                {config.icon}
                            </span>
                        </div>

                        <div className="flex-grow min-w-0">
                            <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                                <h4 className={`text-body-sm font-semibold leading-tight ${isSelected ? "" : "text-gray-800"}`}>
                                    {config.label}
                                </h4>
                                {isSelected && (
                                    <motion.div
                                        layoutId="active-indicator"
                                        className={`w-3.5 h-3.5 rounded-full ${getActiveDotColor(config.color)} flex items-center justify-center shrink-0 ml-2`}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                    </motion.div>
                                )}
                            </div>

                            {/* Hide description on mobile to keep 'Menu' feel */}
                            <p className="hidden sm:block text-caption text-gray-500 leading-tight line-clamp-2">
                                {config.description}
                            </p>

                            {/* Mobile Impact Badges - Compact */}
                            <div className="flex flex-wrap gap-1 mt-1 sm:hidden">
                                {config.autoRestock && (
                                    <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-medium border border-green-100">
                                        + Stock
                                    </span>
                                )}
                                {config.autoRefund && (
                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium border border-blue-100">
                                        Remboursé
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Desktop Impact Badges */}
                        <div className="hidden sm:flex flex-wrap gap-1 mt-auto pt-1">
                            {config.autoRestock && (
                                <span className="text-caption bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium border border-green-100">
                                    + Stock
                                </span>
                            )}
                            {config.autoRefund && (
                                <span className="text-caption bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                                    Remboursement
                                </span>
                            )}
                            {key === "other" && (
                                <span className="text-caption bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full font-medium border border-gray-100">
                                    Manuel
                                </span>
                            )}
                        </div>
                    </motion.button>
                );
            })}
        </div>
    );
}
