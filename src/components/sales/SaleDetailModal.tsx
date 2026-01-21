import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt, Clock, User, CheckCircle2 } from 'lucide-react';
import { Sale } from '../../types';
import { Button } from '../ui/Button';

interface SaleDetailModalProps {
    sale: Sale | null;
    formatPrice: (price: number) => string;
    onClose: () => void;
}

export function SaleDetailModal({ sale, formatPrice, onClose }: SaleDetailModalProps) {
    if (!sale) return null;

    // Calculer le total des items
    const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    const saleDate = new Date(sale.validatedAt || sale.createdAt);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 50, rotateX: -10 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    exit={{ opacity: 0, y: 50, rotateX: -10 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="relative w-full max-w-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Effet papier ticket */}
                    <div className="bg-white rounded-t-sm shadow-2xl overflow-hidden relative">
                        {/* Header Ticket */}
                        <div className="bg-gray-50 p-6 text-center border-b border-dashed border-gray-300 relative">
                            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-3">
                                <Receipt className="text-amber-600" size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 font-mono tracking-tight">TICKET #{sale.id.slice(-6)}</h3>
                            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">Reçu de vente</div>

                            <Button
                                onClick={onClose}
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded-full"
                            >
                                <X size={18} />
                            </Button>
                        </div>

                        {/* Corps du ticket */}
                        <div className="p-6 space-y-6 relative bg-white">
                            {/* Infos méta */}
                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 font-mono border-b border-gray-100 pb-4">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} className="text-gray-400" />
                                        <span>{saleDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <span className="pl-4">{saleDate.toLocaleDateString('fr-FR')}</span>
                                </div>
                                <div className="flex flex-col gap-1 items-end">
                                    <div className="flex items-center gap-1.5">
                                        <User size={12} className="text-gray-400" />
                                        <span>Serveur</span>
                                    </div>
                                    {/* TODO: Récupérer le nom du serveur via props ou context si nécessaire, ou on assume que c'est déjà enrichi avant. 
                                        Pour l'instant, on affiche l'ID si on n'a pas le nom, ou on le passera en props plus tard. 
                                        Dans SalesHistoryPage, on a accès aux users.
                                    */}
                                    <span className="font-semibold text-gray-700">Non spécifié</span>
                                </div>
                            </div>

                            {/* Liste Produits */}
                            <div className="space-y-3">
                                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                    <span>Description</span>
                                    <span>Montant</span>
                                </div>
                                {sale.items.map((item: any, index: number) => {
                                    const name = item.product?.name || item.product_name || 'Produit';
                                    const volume = item.product?.volume || item.product_volume || '';
                                    const price = item.product?.price || item.unit_price || 0;

                                    return (
                                        <div key={index} className="flex justify-between items-center group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-600 font-mono">
                                                    {item.quantity}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-800 leading-tight">{name}</span>
                                                    {volume && <span className="text-[10px] text-gray-400">{volume}</span>}
                                                </div>
                                            </div>
                                            <div className="text-sm font-mono font-medium text-gray-600">
                                                {formatPrice(price * item.quantity)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Totaux */}
                            <div className="pt-4 border-t-2 border-dashed border-gray-200">
                                <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
                                    <span>Sous-total ({itemCount} articles)</span>
                                    <span>{formatPrice(sale.total)}</span>
                                </div>
                                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                                    <span className="text-lg font-black text-gray-900 uppercase">Total</span>
                                    <span className="text-xl font-bold font-mono text-gray-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-100/50">
                                        {formatPrice(sale.total)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Footer Ticket - Papier déchiré */}
                        <div className="relative h-6 bg-white w-full">
                            {/* Zigzag SVG pattern for paper edge  */}
                            <div className="absolute top-0 left-0 w-full h-4 overflow-hidden"
                                style={{
                                    background: 'linear-gradient(135deg, transparent 75%, #ffffff 75%) -10px 0, linear-gradient(-135deg, transparent 75%, #ffffff 75%) 10px 0',
                                    backgroundSize: '20px 20px',
                                    backgroundColor: 'transparent',
                                    transform: 'rotate(180deg) translateY(-2px)'
                                }}>
                            </div>
                        </div>

                        {/* Status Footer */}
                        <div className="bg-gray-800 p-4 flex items-center justify-center gap-2 text-white/90 text-sm font-medium rounded-b-sm -mt-2">
                            {sale.status === 'validated' && (
                                <>
                                    <CheckCircle2 size={16} className="text-green-400" />
                                    <span>Paiement Validé</span>
                                </>
                            )}
                            {sale.status === 'pending' && (
                                <>
                                    <Clock size={16} className="text-yellow-400" />
                                    <span>En attente</span>
                                </>
                            )}
                            {sale.status === 'rejected' && (
                                <>
                                    <X size={16} className="text-red-400" />
                                    <span>Vente Annulée</span>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
