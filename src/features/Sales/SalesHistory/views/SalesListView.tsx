import { useCallback, useRef, useEffect, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Eye } from 'lucide-react';
import { Sale, User } from '../../../../types';
import { getSaleDate, isConfirmedReturn } from '../../../../utils/saleHelpers';
import { EnhancedButton } from '../../../../components/EnhancedButton';
import { useViewport } from '../../../../hooks/useViewport';
import { isToday } from 'date-fns';

const MOBILE_ROW_HEIGHT = 73; // px per mobile row (p-4 = 32px padding + ~41px content)
const VIRTUALIZE_THRESHOLD = 50; // Only virtualize when list is large

interface SalesListViewProps {
    sales: Sale[];
    formatPrice: (price: number) => string;
    onViewDetails: (sale: Sale) => void;
    getReturnsBySale: (saleId: string) => any[];
    users?: User[];
}

/** Single mobile row — extracted for react-window rendering */
function MobileSaleRow({ sale, formatPrice, onViewDetails, getReturnsBySale, users, style }: {
    sale: Sale;
    formatPrice: (price: number) => string;
    onViewDetails: (sale: Sale) => void;
    getReturnsBySale: (saleId: string) => any[];
    users?: User[];
    style?: React.CSSProperties;
}) {
    const saleDate = getSaleDate(sale);
    const timeStr = new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = isToday(saleDate) ? '' : saleDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const itemCount = sale.items_count ?? sale.items.reduce((sum, item) => sum + item.quantity, 0);
    const seller = users?.find(u => u.id === sale.soldBy);
    const saleReturns = getReturnsBySale(sale.id);
    const hasReturns = saleReturns.length > 0;
    const refundedAmount = saleReturns
        .filter(isConfirmedReturn)
        .reduce((sum, r) => sum + r.refundAmount, 0);
    const netAmount = sale.total - refundedAmount;

    return (
        <div
            style={style}
            onClick={() => onViewDetails(sale)}
            className="p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer border-b border-gray-100"
        >
            <div className="flex flex-col w-12 shrink-0">
                <span className="text-sm font-bold text-gray-900 leading-tight">{timeStr}</span>
                <span className="text-[10px] text-gray-400 font-mono leading-tight">#{sale.id.slice(-4)}</span>
            </div>
            <div className="flex-1 px-3 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-medium text-gray-700 truncate">{seller?.name || 'Inconnu'}</span>
                    {hasReturns && <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />}
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                    {itemCount} articles • {sale.status === 'validated' ? 'Payé' : sale.status}
                </div>
            </div>
            <div className="text-right shrink-0">
                {dateStr && (
                    <div className="text-[10px] font-bold text-gray-400 leading-tight mb-0.5">{dateStr}</div>
                )}
                <div className={`font-mono font-bold text-sm leading-tight ${hasReturns ? 'text-amber-600' : 'text-gray-900'}`}>
                    {formatPrice(netAmount)}
                </div>
                {hasReturns && (
                    <div className="text-[10px] text-red-500 font-medium leading-tight">-{formatPrice(refundedAmount)}</div>
                )}
            </div>
        </div>
    );
}

export function SalesListView({
    sales,
    formatPrice,
    onViewDetails,
    getReturnsBySale,
    users
}: SalesListViewProps) {
    const { isMobile } = useViewport();
    const containerRef = useRef<HTMLDivElement>(null);
    const [listHeight, setListHeight] = useState(400);

    // Measure available height for virtualized list
    useEffect(() => {
        if (!isMobile || sales.length < VIRTUALIZE_THRESHOLD) return;
        const updateHeight = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                // Fill available viewport minus some bottom padding
                setListHeight(Math.max(300, window.innerHeight - rect.top - 80));
            }
        };
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [isMobile, sales.length]);

    const renderVirtualizedRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const sale = sales[index];
        return (
            <MobileSaleRow
                key={sale.id}
                sale={sale}
                formatPrice={formatPrice}
                onViewDetails={onViewDetails}
                getReturnsBySale={getReturnsBySale}
                users={users}
                style={style}
            />
        );
    }, [sales, formatPrice, onViewDetails, getReturnsBySale, users]);

    if (isMobile) {
        // Small lists: render normally (no virtualization overhead)
        if (sales.length < VIRTUALIZE_THRESHOLD) {
            return (
                <div className="space-y-0 divide-y divide-gray-100 border-t border-b border-gray-100 bg-white">
                    {sales.map(sale => (
                        <MobileSaleRow
                            key={sale.id}
                            sale={sale}
                            formatPrice={formatPrice}
                            onViewDetails={onViewDetails}
                            getReturnsBySale={getReturnsBySale}
                            users={users}
                        />
                    ))}
                </div>
            );
        }

        // Large lists: virtualize for performance
        return (
            <div ref={containerRef} className="border-t border-b border-gray-100 bg-white">
                <List
                    height={listHeight}
                    itemCount={sales.length}
                    itemSize={MOBILE_ROW_HEIGHT}
                    width="100%"
                    overscanCount={5}
                >
                    {renderVirtualizedRow}
                </List>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
            <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-100">
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
                        const itemCount = sale.items_count ?? sale.items.reduce((sum, item) => sum + item.quantity, 0);

                        // Calculer le montant des retours remboursés
                        const saleReturns = getReturnsBySale(sale.id);
                        const refundedAmount = saleReturns
                            .filter(isConfirmedReturn)
                            .reduce((sum, r) => sum + r.refundAmount, 0);

                        const netAmount = sale.total - refundedAmount;
                        const hasReturns = saleReturns.length > 0;

                        // Badge de statut
                        const statusBadge = {
                            pending: { label: '⏳ En attente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                            validated: { label: '✅ Validée', color: 'bg-green-100 text-green-700 border-green-200' },
                            rejected: { label: '❌ Rejetée', color: 'bg-red-100 text-red-700 border-red-200' },
                            cancelled: { label: '🚫 Annulée', color: 'bg-purple-100 text-purple-700 border-purple-200' }
                        }[sale.status] || { label: 'Inconnu', color: 'bg-gray-100 text-gray-700 border-gray-200' };

                        // Infos utilisateurs
                        // Source of truth: soldBy is the business attribution
                        const serverUserId = sale.soldBy;
                        const seller = users?.find(u => u.id === serverUserId);
                        const validator = sale.validatedBy ? users?.find(u => u.id === sale.validatedBy) : null;

                        return (
                            <tr key={sale.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors group">
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-gray-600">#{sale.id.slice(-6)}</span>
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
                                        <p className="text-sm font-medium text-gray-800">{getSaleDate(sale).toLocaleDateString('fr-FR')}</p>
                                        <p className="text-xs text-gray-500">{new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR')}</p>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{seller?.name || 'Inconnu'}</p>
                                        {validator && (
                                            <p className="text-xs text-gray-500">Val.: {validator.name}</p>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-gray-600">{itemCount} art.</td>
                                <td className="p-4">
                                    <span className={`font-mono font-medium ${hasReturns ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                        {formatPrice(sale.total)}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {refundedAmount > 0 ? (
                                        <span className="text-red-600 font-mono text-sm">-{formatPrice(refundedAmount)}</span>
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <span className="font-bold font-mono text-green-700 text-base">{formatPrice(netAmount)}</span>
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

