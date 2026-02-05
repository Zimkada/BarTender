import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Printer } from 'lucide-react';
import { SalesService } from '../../services/supabase/sales.service';
import { useBarContext } from '../../context/BarContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { Button } from '../ui/Button';

interface InvoiceModalProps {
    ticketId: string;
    ticketNumber?: number;
    paymentMethod?: string; // If provided, we are in "Read-Only/Paid" mode or "View Details" mode
    onClose: () => void;
}

interface AggregatedItem {
    name: string;
    qty: number;
    unitPrice: number;
    total: number;
}

export function InvoiceModal({ ticketId, ticketNumber, paymentMethod, onClose }: InvoiceModalProps) {
    const { currentBar } = useBarContext();
    const { formatPrice } = useCurrencyFormatter();
    const [sales, setSales] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        SalesService.getSalesByTicketId(ticketId)
            .then(data => {
                setSales(data);
                setIsLoading(false);
            })
            .catch(e => {
                console.error('Erreur fetch facture:', e);
                setIsLoading(false);
            });
    }, [ticketId]);

    // Aggregate items and payment methods across all sales on this ticket
    const allItems: AggregatedItem[] = [];
    const paymentMethods = new Set<string>();
    let grandTotal = 0;

    sales.forEach(sale => {
        grandTotal += sale.total || 0;
        // Prioritize ticket payment method if available (passed as prop), otherwise fallback to sales payment methods
        // But for "View Details" of OPEN ticket, paymentMethod prop is undefined, so we show accumulated sales methods (if any mixed).
        // Actually, for open tickets, usually sales have "ticket" or null payment method.
        if (sale.payment_method && sale.payment_method !== 'ticket') paymentMethods.add(sale.payment_method);
        ; (sale.items || []).forEach((item: any) => {
            const name = item.product_name || item.productName || 'Produit';
            const existing = allItems.find(i => i.name === name);
            if (existing) {
                existing.qty += item.quantity || 1;
                existing.total += item.total_price || item.totalPrice || 0;
            } else {
                allItems.push({
                    name,
                    qty: item.quantity || 1,
                    unitPrice: item.unit_price || item.unitPrice || 0,
                    total: item.total_price || item.totalPrice || 0,
                });
            }
        });
    });

    const paymentLabels: Record<string, string> = {
        cash: 'Espèces',
        mobile_money: 'MoMo',
        card: 'Carte',
        credit: 'Crédit'
    };

    const today = new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const handlePrint = () => {
        document.body.classList.add('printing');
        window.print();
        document.body.classList.remove('printing');
    };

    return (
        <>
            {/* Overlay — hidden on print */}
            <div className="fixed inset-0 bg-brand-dark/40 backdrop-blur-sm z-[300] print:hidden" onClick={onClose} />

            {/* Modal container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed inset-0 z-[310] flex items-center justify-center px-4 print:block print:inset-auto"
            >
                <div className="print-target bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col print:shadow-none print:rounded-none print:max-h-none print:max-w-full">
                    {/* Modal controls — hidden on print */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 print:hidden">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter">Facture</h3>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handlePrint}
                                className="bg-brand-subtle text-brand-primary hover:bg-brand-primary hover:text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1"
                            >
                                <Printer size={10} /> Imprimer
                            </Button>
                            <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full">
                                <X size={16} />
                            </Button>
                        </div>
                    </div>

                    {/* Invoice content */}
                    <div className="flex-1 overflow-y-auto p-6 print:overflow-visible">
                        {isLoading ? (
                            <p className="text-center text-gray-400 text-sm py-8">Chargement...</p>
                        ) : (
                            <div className="space-y-5">
                                {/* Bar name + reference */}
                                <div className="text-center">
                                    <h1 className="text-lg font-black text-gray-900 uppercase tracking-tighter">{currentBar?.name || 'Bar'}</h1>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                        {ticketNumber ? `BON #${ticketNumber}` : `BON-${ticketId.slice(0, 8)}`} • {today}
                                    </p>
                                </div>

                                <div className="border-t border-dashed border-gray-200" />

                                {/* Items table */}
                                <div>
                                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                                        <span>Produit</span>
                                        <span className="text-right">Qté</span>
                                        <span className="text-right">P.U</span>
                                        <span className="text-right">Total</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {allItems.map((item, i) => (
                                            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[11px] text-gray-800 px-1">
                                                <span className="font-black">{item.name}</span>
                                                <span className="text-right text-gray-500">{item.qty}</span>
                                                <span className="text-right text-gray-500 font-mono">{formatPrice(item.unitPrice)}</span>
                                                <span className="text-right font-black font-mono">{formatPrice(item.total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-dashed border-gray-200" />

                                {/* Grand total */}
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">NET À PAYER</span>
                                    <span className="text-xl font-black text-brand-dark font-mono">{formatPrice(grandTotal)}</span>
                                </div>

                                {/* Payment methods */}
                                <div className="px-1">
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Modes de paiement : </span>
                                    <span className="text-[9px] font-black text-gray-600">
                                        {paymentMethod
                                            ? (paymentLabels[paymentMethod] || paymentMethod)
                                            : (paymentMethods.size > 0
                                                ? Array.from(paymentMethods).map(m => paymentLabels[m] || m).join(', ')
                                                : 'À régler')
                                        }
                                    </span>
                                </div>

                                {/* Signature lines — visible on print only */}
                                <div className="mt-8 pt-4 border-t border-gray-200 hidden print:block">
                                    <div className="flex justify-between">
                                        <div>
                                            <div className="w-40 border-b border-gray-400 mb-1" />
                                            <span className="text-[8px] text-gray-400">Signature du gérant</span>
                                        </div>
                                        <div>
                                            <div className="w-40 border-b border-gray-400 mb-1" />
                                            <span className="text-[8px] text-gray-400">Signature du client</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </>
    );
}
