import { Eye } from 'lucide-react';
import { Sale, User } from '../../../../types';
import { getSaleDate } from '../../../../utils/saleHelpers';
import { EnhancedButton } from '../../../../components/EnhancedButton';

interface SalesListViewProps {
    sales: Sale[];
    formatPrice: (price: number) => string;
    onViewDetails: (sale: Sale) => void;
    getReturnsBySale: (saleId: string) => any[];
    users?: User[];
}

export function SalesListView({
    sales,
    formatPrice,
    onViewDetails,
    getReturnsBySale,
    users
}: SalesListViewProps) {
    return (
        <div className="bg-white rounded-xl border border-amber-100 overflow-x-auto">
            <table className="w-full min-w-[900px]">
                <thead className="bg-amber-50">
                    <tr>
                        <th className="text-left p-4 font-medium text-gray-700">ID</th>
                        <th className="text-left p-4 font-medium text-gray-700">Statut</th>
                        <th className="text-left p-4 font-medium text-gray-700">Date</th>
                        <th className="text-left p-4 font-medium text-gray-700">
                            <div>Auteur</div>
                        </th>
                        <th className="text-left p-4 font-medium text-gray-700">Articles</th>
                        <th className="text-left p-4 font-medium text-gray-700">Total</th>
                        <th className="text-left p-4 font-medium text-gray-700">Retours</th>
                        <th className="text-left p-4 font-medium text-gray-700">Net</th>
                        <th className="text-left p-4 font-medium text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sales.map(sale => {
                        const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

                        // Calculer le montant des retours remboursés
                        const saleReturns = getReturnsBySale(sale.id);
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
                            <tr key={sale.id} className="border-t border-amber-100 hover:bg-amber-50">
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <span>#{sale.id.slice(-6)}</span>
                                        {hasReturns && (
                                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                                {saleReturns.length} retour{saleReturns.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`text-xs px-2 py-1 rounded-full border ${statusBadge.color}`}>
                                        {statusBadge.label}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div>
                                        <p className="text-sm">{getSaleDate(sale).toLocaleDateString('fr-FR')}</p>
                                        <p className="text-xs text-gray-600">{new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR')}</p>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div>
                                        <p className="text-sm font-medium">{seller?.name || 'Inconnu'}</p>
                                        {validator && (
                                            <p className="text-xs text-gray-500">Val.: {validator.name}</p>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">{itemCount} articles</td>
                                <td className="p-4">
                                    <span className={`font-semibold ${hasReturns ? 'text-gray-500 line-through' : 'text-amber-600'}`}>
                                        {formatPrice(sale.total)}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {refundedAmount > 0 ? (
                                        <span className="text-red-600 font-medium">-{formatPrice(refundedAmount)}</span>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <span className="font-bold text-green-600">{formatPrice(netAmount)}</span>
                                </td>
                                <td className="p-4">
                                    <EnhancedButton
                                        variant="info"
                                        size="sm"
                                        onClick={() => onViewDetails(sale)}
                                        icon={<Eye size={14} />}
                                    >
                                        Voir
                                    </EnhancedButton>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
