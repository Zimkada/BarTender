import { useState } from 'react';
import { motion } from 'framer-motion';
import { Receipt, ArrowRight } from 'lucide-react';
import type { TicketWithSummary } from '../../hooks/queries/useTickets';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { FaireLePointModal } from './FaireLePointModal';
import { Button } from '../ui/Button';

interface BonStripProps {
    tickets: TicketWithSummary[];
}

export function BonStrip({ tickets }: BonStripProps) {
    const { formatPrice } = useCurrencyFormatter();
    const [showModal, setShowModal] = useState(false);

    if (tickets.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
        >
            <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                    <Receipt size={14} className="text-brand-primary" />
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                        Bons ouverts
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowModal(true)}
                    className="text-[9px] font-black text-brand-primary/60 hover:text-brand-primary hover:bg-transparent uppercase tracking-widest flex items-center gap-1"
                >
                    Faire le point <ArrowRight size={10} />
                </Button>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 scroll-smooth" style={{ scrollbarWidth: 'none' }}>
                {tickets.map(ticket => (
                    <div
                        key={ticket.id}
                        className="flex-shrink-0 w-[200px] bg-white rounded-xl border border-brand-subtle/30 p-3 shadow-sm"
                    >
                        <p className="text-[10px] font-black text-gray-700 truncate">{ticket.productSummary}</p>
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs font-black text-brand-dark font-mono">{formatPrice(ticket.totalAmount)}</span>
                            <span className="text-[8px] font-black text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">
                                {ticket.salesCount} vente{ticket.salesCount > 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <FaireLePointModal
                    tickets={tickets}
                    onClose={() => setShowModal(false)}
                />
            )}
        </motion.div>
    );
}
