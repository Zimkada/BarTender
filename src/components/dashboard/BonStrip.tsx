import { useState } from 'react';
import { motion } from 'framer-motion';
import { Receipt, ArrowRight } from 'lucide-react';
import type { TicketWithSummary } from '../../hooks/queries/useTickets';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { FaireLePointModal } from './FaireLePointModal';
import { InvoiceModal } from './InvoiceModal';
import { Button } from '../ui/Button';

interface BonStripProps {
    tickets: TicketWithSummary[];
}

export function BonStrip({ tickets }: BonStripProps) {
    const { formatPrice } = useCurrencyFormatter();
    const [showModal, setShowModal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);

    if (tickets.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
        >
            <div className="flex items-center justify-between mb-3 px-1">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
                >
                    <div className="w-6 h-6 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                        <Receipt size={14} />
                    </div>
                    <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                            Bons ouverts ({tickets.length})
                        </span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase mt-0.5">
                            {isExpanded ? 'Cliquer pour replier' : 'Cliquer pour voir tout'}
                        </span>
                    </div>
                </button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowModal(true)}
                    className="text-[9px] font-black text-brand-primary/60 hover:text-brand-primary hover:bg-transparent uppercase tracking-widest flex items-center gap-1"
                >
                    Faire le point <ArrowRight size={10} />
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-2">
                {(isExpanded ? tickets : tickets.slice(0, 2)).map(ticket => (
                    <div
                        key={ticket.id}
                        onClick={() => setViewDetailsId(ticket.id)}
                        className="bg-white rounded-xl border border-brand-subtle/30 p-3 shadow-sm transition-all w-full cursor-pointer hover:border-brand-primary/40 active:scale-[0.98]"
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                BON #{ticket.ticketNumber || '?'}
                            </span>
                            <span className="text-[10px] font-black text-gray-500">
                                {ticket.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        {ticket.notes && (
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-tight mb-1 truncate">
                                {ticket.notes}
                            </div>
                        )}
                        <p className="text-[10px] font-black text-gray-700 truncate mb-2">{ticket.productSummary}</p>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-brand-dark font-mono truncate mr-2">
                                {formatPrice(ticket.totalAmount)}
                            </span>
                            <span className="text-[9px] font-black text-gray-400 whitespace-nowrap">
                                ({ticket.salesCount} v.)
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {!isExpanded && tickets.length > 2 && (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-full py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest border border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    + {tickets.length - 2} autres bons ouverts
                </button>
            )}

            {showModal && (
                <FaireLePointModal
                    tickets={tickets}
                    onClose={() => setShowModal(false)}
                />
            )}

            {viewDetailsId && (
                <InvoiceModal
                    ticketId={viewDetailsId}
                    ticketNumber={tickets.find(t => t.id === viewDetailsId)?.ticketNumber}
                    notes={tickets.find(t => t.id === viewDetailsId)?.notes}
                    onClose={() => setViewDetailsId(null)}
                />
            )}
        </motion.div>
    );
}
