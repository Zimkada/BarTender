import { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { ChevronRight, AlertTriangle } from 'lucide-react';

interface SelectionCardProps extends Omit<HTMLMotionProps<"button">, "title"> {
    /**
     * The main status of the card.
     * - 'default': Available/Clickable
     * - 'disabled': Unavailable/Not Clickable (Grayed out)
     * - 'error': Unavailable with specific error styling (Red background)
     */
    status?: 'default' | 'disabled' | 'error';
    /**
     * Optional text to display when status is 'error' or 'disabled'
     */
    statusText?: string;
    /**
     * Main content rendered inside the card
     */
    children: ReactNode;
    /**
     * Whether to show the chevron arrow on the right.
     * Defaults to true if status is 'default'.
     */
    showArrow?: boolean;
    /**
     * Price to display in the action area (optional)
     */
    priceDisplay?: ReactNode;
}

export function SelectionCard({
    status = 'default',
    statusText,
    children,
    showArrow = true,
    priceDisplay,
    className,
    ...props
}: SelectionCardProps) {
    const isClickable = status === 'default';

    const containerClasses = {
        default: "border-brand-primary/10 bg-white hover:border-brand-primary/60 shadow-md hover:shadow-brand-subtle/20",
        disabled: "border-gray-100 bg-gray-50/30 opacity-60 cursor-not-allowed",
        error: "border-red-100 bg-red-50/50 opacity-90 cursor-not-allowed"
    };

    return (
        <motion.button
            whileHover={isClickable ? { y: -2, scale: 1.01 } : {}}
            disabled={!isClickable}
            className={`
                w-full p-4 text-left rounded-2xl border-2 transition-all relative overflow-hidden
                ${containerClasses[status]}
                ${className || ''}
            `}
            {...props}
        >
            <div className="flex justify-between items-center w-full gap-4">
                {/* Main Content Area */}
                <div className="flex-1 min-w-0">
                    {children}
                </div>

                {/* Right Action Area (Price + Arrow) */}
                {(priceDisplay || showArrow || statusText) && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex flex-col items-end">
                            {priceDisplay && (
                                <div className="mb-0.5">{priceDisplay}</div>
                            )}
                            {/* Status Text (Error Reason) */}
                            {!isClickable && statusText && (
                                <div className={`
                                    flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter italic whitespace-nowrap
                                    ${status === 'error' ? 'text-red-500' : 'text-gray-400'}
                                `}>
                                    {status === 'error' && <AlertTriangle size={10} />}
                                    {statusText}
                                </div>
                            )}
                        </div>

                        {/* Arrow Button */}
                        {showArrow && (
                            <div
                                className={`
                                    w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform
                                    ${isClickable
                                        ? 'shadow-brand-primary/20 group-hover:translate-x-1'
                                        : 'bg-gray-100 shadow-none text-gray-300'}
                                `}
                                style={isClickable ? { background: 'var(--brand-gradient)' } : {}}
                            >
                                <ChevronRight size={18} className={isClickable ? 'text-white' : 'text-gray-300'} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.button>
    );
}
