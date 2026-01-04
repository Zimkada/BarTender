import { Eye, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sale, User } from '../../../../types';
import { getSaleDate } from '../../../../utils/saleHelpers';
import { EnhancedButton } from '../../../../components/EnhancedButton';

interface SalesCardsViewProps {
    sales: Sale[];
    formatPrice: (price: number) => string;
    onViewDetails: (sale: Sale) => void;
    getReturnsBySale: (saleId: string) => any[];
    users?: User[];
}

export function SalesCardsView({
    sales,
    formatPrice,
    onViewDetails,
    getReturnsBySale,
    users
}: SalesCardsViewProps) {
    return (
        <div className="space-y-3">
            {sales.map(sale => (
                <SaleCard
                    key={sale.id}
                    sale={sale}
                    formatPrice={formatPrice}
                    onViewDetails={() => onViewDetails(sale)}
                    getReturnsBySale={getReturnsBySale}
                    users={users}
                />
            ))}
        </div>
    );
}

// Internal component for individual card
export function SaleCard({
    sale,
    formatPrice,
    onViewDetails,
    getReturnsBySale,
    users
}: {
    sale: Sale;
    formatPrice: (price: number) => string;
    onViewDetails: () => void;
    getReturnsBySale?: (saleId: string) => any[];
    users?: User[];
}) {
    const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

    // Calculer le montant des retours remboursés
    const saleReturns = getReturnsBySale ? getReturnsBySale(sale.id) : [];
    const refundedAmount = saleReturns
        .filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
        .reduce((sum, r) => sum + r.refundAmount, 0);

    const netAmount = sale.total - refundedAmount;
    const hasReturns = saleReturns.length > 0;

    // Badge de statut
    const statusBadge = {
        pending: { label: '⏳ En attente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
        validated: { label: '✅ Validée', color: 'bg-green-100 text-green-700 border-green-200' },
        rejected: { label: '❌ Rejetée', color: 'bg-red-100 text-red-700 border-red-200' }
    }[sale.status] || { label: 'Inconnu', color: 'bg-gray-100 text-gray-700 border-gray-200' };

    // Infos utilisateurs
    // Source of truth: soldBy is the business attribution
    const serverUserId = sale.soldBy;
    const seller = users?.find(u => u.id === serverUserId);
    const validator = sale.validatedBy ? users?.find(u => u.id === sale.validatedBy) : null;

    return (
        <motion.div
            whileHover={{ y: -2 }}
            className="bg-white rounded-xl p-4 border border-amber-100 shadow-sm hover:shadow-md transition-all"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-800">Vente #{sale.id.slice(-6)}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge.color}`}>
                            {statusBadge.label}
                        </span>
                    </div>
                    <p className="text-sm text-gray-600">
                        {getSaleDate(sale).toLocaleDateString('fr-FR')} • {new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {seller && (
                        <p className="text-xs text-gray-500 mt-1">
                            Par: {seller.name}
                            {validator && ` • Validée par: ${validator.name}`}
                        </p>
                    )}
                </div>
                <div className="text-right">
                    <span className="text-lg font-bold text-amber-600">{formatPrice(sale.total)}</span>
                    {hasReturns && refundedAmount > 0 && (
                        <p className="text-xs text-red-600 font-medium">
                            -{formatPrice(refundedAmount).replace(/\s/g, '')}
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-2 mb-4">
                {sale.items.slice(0, 2).map((item: any, index) => {
                    const name = item.product?.name || item.product_name || 'Produit';
                    const volume = item.product?.volume || item.product_volume || '';
                    const price = item.product?.price || item.unit_price || 0;
                    return (
                        <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.quantity}x {name} {volume ? `(${volume})` : ''}</span>
                            <span className="text-gray-600">{formatPrice(price * item.quantity)}</span>
                        </div>
                    );
                })}
                {sale.items.length > 2 && (
                    <p className="text-sm text-gray-500">... et {sale.items.length - 2} autres articles</p>
                )}
            </div>

            {/* Affichage des retours et montant net */}
            {hasReturns && (
                <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-red-700 font-medium">
                            <RotateCcw size={14} className="inline mr-1" />
                            {oldSaleReturnsLength(saleReturns)} retour{saleReturns.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-800 font-semibold">
                            Net: {formatPrice(netAmount)}
                        </span>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{itemCount} articles</span>
                <EnhancedButton
                    variant="info"
                    size="sm"
                    onClick={onViewDetails}
                    icon={<Eye size={14} />}
                >
                    Détails
                </EnhancedButton>
            </div>
        </motion.div>
    );
}

// Helper for type safety if needed, or just inline
function oldSaleReturnsLength(returns: any[]) {
    return returns.length;
}
