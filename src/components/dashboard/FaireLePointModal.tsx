import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt, Check, Eye, User } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { TicketWithSummary } from '../../hooks/queries/useTickets';
import { ticketKeys } from '../../hooks/queries/useTickets';
import { salesKeys } from '../../hooks/queries/useSalesQueries';
import { TicketsService } from '../../services/supabase/tickets.service';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { InvoiceModal } from './InvoiceModal';
import { Button } from '../ui/Button';
import { PaymentMethodSelector, PaymentMethod } from '../cart/PaymentMethodSelector';
import { formatTicketInfo } from '../../utils/formatTicketInfo';

interface FaireLePointModalProps {
    tickets: TicketWithSummary[];
    onClose: () => void;
}

export function FaireLePointModal({ tickets, onClose }: FaireLePointModalProps) {
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const queryClient = useQueryClient();
    const { formatPrice } = useCurrencyFormatter();

    // Payment Logic
    const [payingId, setPayingId] = useState<string | null>(null); // Ticket ID being paid
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
    const isManagerOrPromoter = currentSession?.role === 'gerant' || currentSession?.role === 'promoteur';

    // View Details Logic
    const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);

    // Reset payment method à 'cash' chaque fois qu'on ferme le mode paiement
    useEffect(() => {
        if (payingId === null) setPaymentMethod('cash');
    }, [payingId]);

    const handleConfirmPay = async (ticketId: string) => {
        if (!currentSession) return;
        setIsProcessingPayment(true);
        try {
            await TicketsService.payTicket(ticketId, currentSession.userId, paymentMethod);
            setPaidIds(prev => new Set(prev).add(ticketId));
            queryClient.invalidateQueries({ queryKey: ticketKeys.open(currentBar?.id || '') });
            // Invalidate sales to update dashboard stats immediately
            queryClient.invalidateQueries({ queryKey: salesKeys.list(currentBar?.id || '') });
            // Fermer le mode paiement
            setPayingId(null);
            // Ouvrir la facture en mode "Consultation/Fermé" ? Non, l'UX demande juste de payer.
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Bon encaissé avec succès !');
            });
        } catch (e) {
            console.error('Erreur paiement bon:', e);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error('Erreur lors du paiement du bon');
            });
        } finally {
            setIsProcessingPayment(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-brand-dark/30 backdrop-blur-sm z-[200]" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed inset-0 z-[210] flex items-center justify-center px-4"
            >
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <Receipt size={18} className="text-brand-primary" />
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter">Faire le point</h3>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full">
                            <X size={16} />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {tickets.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">
                                <p className="text-xs">Aucun bon ouvert.</p>
                            </div>
                        ) : (
                            tickets.map(ticket => {
                                const isPaid = paidIds.has(ticket.id);
                                const isPayingMode = payingId === ticket.id;

                                return (
                                    <div key={ticket.id} className={`rounded-xl border transition-all ${isPayingMode ? 'border-brand-primary ring-1 ring-brand-primary bg-white shadow-md' : 'border-gray-100 bg-gray-50/30'}`}>
                                        <div className="p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                {/* Content Area */}
                                                <div className="flex-1 min-w-0" onClick={() => setViewDetailsId(ticket.id)} role="button">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                                                            BON #{ticket.ticketNumber || '?'}
                                                        </p>
                                                        <span className="text-[10px] font-black text-gray-400 whitespace-nowrap">
                                                            {new Date(ticket.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>

                                                    {/* Context Area (Role & Screen Size Sensitive) */}
                                                    {(ticket.serverName || formatTicketInfo(ticket)) && (
                                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-tight mb-1 truncate flex items-center gap-1.5">
                                                            {isManagerOrPromoter ? (
                                                                <>
                                                                    <span className="flex items-center gap-0.5 text-brand-primary/70 shrink-0">
                                                                        <User size={8} />
                                                                        {ticket.serverName}
                                                                    </span>
                                                                    {formatTicketInfo(ticket) && (
                                                                        <span className="hidden sm:inline truncate opacity-70">
                                                                            <span className="mx-1 opacity-30">•</span>
                                                                            {formatTicketInfo(ticket)}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {formatTicketInfo(ticket) ? (
                                                                        <span className="truncate text-brand-primary/80">{formatTicketInfo(ticket)}</span>
                                                                    ) : (
                                                                        <span className="flex items-center gap-0.5 text-brand-primary/70 shrink-0">
                                                                            <User size={8} />
                                                                            {ticket.serverName}
                                                                        </span>
                                                                    )}
                                                                    {formatTicketInfo(ticket) && ticket.serverName && (
                                                                        <span className="hidden sm:inline truncate opacity-70">
                                                                            <span className="mx-1 opacity-30">•</span>
                                                                            {ticket.serverName}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}

                                                    <p className="text-[11px] font-black text-gray-800 truncate mb-1">{ticket.productSummary}</p>
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <div className="text-right leading-none">
                                                        <span className="text-sm font-black text-brand-dark font-mono block">{formatPrice(ticket.totalAmount)}</span>
                                                        <span className="text-[9px] font-black text-gray-400 uppercase mt-1 inline-block">({ticket.salesCount} ventes)</span>
                                                    </div>

                                                    {!isPayingMode && !isPaid && (
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setViewDetailsId(ticket.id)}
                                                                className="h-7 w-7 p-0 rounded-full text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10"
                                                            >
                                                                <Eye size={14} />
                                                            </Button>
                                                            <Button
                                                                variant="default"
                                                                size="sm"
                                                                onClick={() => setPayingId(ticket.id)}
                                                                className="text-[9px] font-black uppercase tracking-widest h-7"
                                                            >
                                                                Payer
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {isPaid && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                                            <Check size={12} /> Payé
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Payment Mode Selector Area */}
                                            <AnimatePresence>
                                                {isPayingMode && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="pt-4 mt-4 border-t border-gray-100">
                                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Mode de paiement :</p>
                                                            <PaymentMethodSelector
                                                                value={paymentMethod}
                                                                onChange={setPaymentMethod}
                                                            />
                                                            <div className="flex gap-2 mt-4">
                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => setPayingId(null)}
                                                                    className="flex-1 text-gray-500"
                                                                    size="sm"
                                                                >
                                                                    Annuler
                                                                </Button>
                                                                <Button
                                                                    variant="default"
                                                                    onClick={() => handleConfirmPay(ticket.id)}
                                                                    disabled={isProcessingPayment}
                                                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                                                    size="sm"
                                                                >
                                                                    {isProcessingPayment ? '...' : `Confirmer ${formatPrice(ticket.totalAmount)}`}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </motion.div>

            {viewDetailsId && (
                <InvoiceModal
                    ticketId={viewDetailsId}
                    ticketNumber={tickets.find(t => t.id === viewDetailsId)?.ticketNumber}
                    ticket={tickets.find(t => t.id === viewDetailsId)}
                    onClose={() => setViewDetailsId(null)}
                />
            )}
        </>
    );
}
