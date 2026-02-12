import { useState } from 'react';
import { motion } from 'framer-motion';
import { Receipt, User } from 'lucide-react';
import type { TicketWithSummary } from '../../hooks/queries/useTickets';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { FaireLePointModal } from './FaireLePointModal';
import { InvoiceModal } from './InvoiceModal';
import { formatTicketInfo } from '../../utils/formatTicketInfo';
import { useAuth } from '../../context/AuthContext';

interface BonStripProps {
    tickets: TicketWithSummary[];
}

export function BonStrip({ tickets }: BonStripProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);

    if (tickets.length === 0) return null;

    const isManagerOrPromoter = currentSession?.role === 'gerant' || currentSession?.role === 'promoteur';

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
        >
            <div className="flex items-center gap-2 mb-3 px-1">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="glass-action-button-2026 opacity-80 hover:opacity-100 py-2 px-3 font-bold text-xs uppercase tracking-widest rounded-lg transition-all flex items-center gap-1.5"
                >
                    <span>{isExpanded ? 'Masquer bons ouverts' : `Voir bons ouverts (${tickets.length})`}</span>
                </button>
                <button
                    onClick={() => setShowModal(true)}
                    className="glass-action-button-2026 opacity-80 hover:opacity-100 py-2 px-3 font-bold text-xs uppercase tracking-widest rounded-lg transition-all flex items-center gap-1.5"
                >
                    <Receipt size={14} />
                    <span>Faire le point</span>
                </button>
            </div>

            {isExpanded && (
                <div className="grid grid-cols-2 gap-3 mb-2">
                    {tickets.map(ticket => {
                        const ticketInfo = formatTicketInfo(ticket);
                        const hasContextInfo = ticket.serverName || ticketInfo;

                        return (
                            <div
                                key={ticket.id}
                                onClick={() => setViewDetailsId(ticket.id)}
                                className="bg-white rounded-xl border border-brand-subtle/30 p-3 shadow-sm transition-all w-full cursor-pointer hover:border-brand-primary/40 active:scale-[0.98]"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-black text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap">
                                        BON #{ticket.ticketNumber || '?'}
                                    </span>
                                    <span className="text-[10px] font-black text-gray-500 whitespace-nowrap">
                                        {ticket.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {hasContextInfo && (
                                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-tight mb-1 truncate flex items-center gap-1.5">
                                        {isManagerOrPromoter ? (
                                            // Gérant/Promoteur : Nom serveur prioritaire
                                            <>
                                                <span className="flex items-center gap-0.5 text-brand-primary/70 shrink-0">
                                                    <User size={8} />
                                                    {ticket.serverName}
                                                </span>
                                                {/* Masquer table/client sur petit écran pour les gérants */}
                                                {ticketInfo && (
                                                    <span className="hidden sm:inline truncate opacity-70">
                                                        <span className="mx-1 opacity-30">•</span>
                                                        {ticketInfo}
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            // Serveur : Masquer son nom sur petit écran, montrer Table/Client
                                            <>
                                                {ticketInfo ? (
                                                    <span className="truncate text-brand-primary/80">{ticketInfo}</span>
                                                ) : (
                                                    <span className="flex items-center gap-0.5 text-brand-primary/70 shrink-0">
                                                        <User size={8} />
                                                        {ticket.serverName}
                                                    </span>
                                                )}
                                                {/* Montrer le nom serveur seulement sur grand écran pour le serveur */}
                                                {ticketInfo && ticket.serverName && (
                                                    <span className="hidden sm:inline truncate opacity-70">
                                                        <span className="mx-1 opacity-30">•</span>
                                                        {ticket.serverName}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                <p className="text-[10px] font-black text-gray-700 truncate mb-2">{ticket.productSummary}</p>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5">Net à payer</span>
                                        <span className="text-xs font-black text-brand-dark font-mono truncate mr-2">
                                            {formatPrice(ticket.totalAmount)}
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-black text-gray-400 whitespace-nowrap">
                                        ({ticket.salesCount} ventes)
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
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
                    ticket={tickets.find(t => t.id === viewDetailsId)}
                    onClose={() => setViewDetailsId(null)}
                />
            )}
        </motion.div>
    );
}
