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
                    ? "bg-red-50 border-red-500 ring-4 ring-red-500/10 text-red-900"
                    : "hover:border-red-200 border-gray-100";
            case "orange":
            case "amber":
                return isSelected
                    ? "bg-amber-50 border-amber-500 ring-4 ring-amber-500/10 text-amber-900"
                    : "hover:border-amber-200 border-gray-100";
            case "blue":
                return isSelected
                    ? "bg-blue-50 border-blue-500 ring-4 ring-blue-500/10 text-blue-900"
                    : "hover:border-blue-200 border-gray-100";
            case "purple":
                return isSelected
                    ? "bg-purple-50 border-purple-500 ring-4 ring-purple-500/10 text-purple-900"
                    : "hover:border-purple-200 border-gray-100";
            default:
                return isSelected
                    ? "bg-gray-50 border-gray-500 ring-4 ring-gray-500/10 text-gray-900"
                    : "hover:border-gray-200 border-gray-100";
        }
    };

    const getActiveDotColor = (color: string) => {
        switch (color) {
            case "red": return "bg-red-500";
            case "orange":
            case "amber": return "bg-amber-500";
            case "blue": return "bg-blue-500";
            case "purple": return "bg-purple-500";
            default: return "bg-gray-500";
        }
    };

    return (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(reasons).map(([key, config]) => {
                const isSelected = selectedReason === key;
                const reasonKey = key as ReturnReason;
                const colorClass = getColorClasses(config.color, isSelected);

                return (
                    <motion.button
                        key={key}
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect(reasonKey)}
                        className={`
              relative p-3 rounded-xl border-2 transition-all text-left flex flex-col gap-2 h-full shadow-sm
              ${colorClass}
              ${isSelected ? "z-10" : "bg-white"}
            `}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-2xl" role="img" aria-label={config.label}>
                                {config.icon}
                            </span>
                            {isSelected && (
                                <motion.div
                                    layoutId="active-indicator"
                                    className={`w-4 h-4 rounded-full ${getActiveDotColor(config.color)} flex items-center justify-center`}
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                </motion.div>
                            )}
                        </div>

                        <div className="flex-grow">
                            <h4 className={`font-bold text-sm leading-tight ${isSelected ? "" : "text-gray-800"}`}>
                                {config.label}
                            </h4>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight line-clamp-2">
                                {config.description}
                            </p>
                        </div>

                        {/* Impact Badges */}
                        <div className="flex flex-wrap gap-1 mt-auto pt-1">
                            {config.autoRestock && (
                                <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                    + STOCK
                                </span>
                            )}
                            {config.autoRefund && (
                                <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                    💰 REMBOURSEMENT
                                </span>
                            )}
                            {key === "other" && (
                                <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                    MANUEL
                                </span>
                            )}
                        </div>
                    </motion.button>
                );
            })}
        </div>
    );
}
