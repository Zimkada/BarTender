import { Edit, BarChart3, Trash2 } from 'lucide-react';
import { Product, ProductStockInfo } from '../../types';
import { Button } from '../ui/Button';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';

interface InventoryCardProps {
    product: Product;
    stockInfo: ProductStockInfo | null;
    avgCost: number;
    margin: number;
    categoryName: string;
    onEdit: (product: Product) => void;
    onAdjust: (product: Product) => void;
    onDelete: (product: Product) => void;
}

export function InventoryCard({
    product,
    stockInfo,
    avgCost,
    margin,
    categoryName,
    onEdit,
    onAdjust,
    onDelete
}: InventoryCardProps) {
    const { formatPrice } = useCurrencyFormatter();
    const currentStock = stockInfo?.physicalStock ?? 0;
    const availableStock = stockInfo?.availableStock ?? product.stock;
    const isLowStock = availableStock <= product.alertThreshold;

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-amber-200 transition-colors">
            <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{product.name}</h3>
                        <p className="text-sm text-gray-500">{product.volume || 'Format non spécifié'}</p>
                        <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded uppercase tracking-wider">
                            {categoryName}
                        </span>
                    </div>
                    <div className="text-right">
                        <div className={`text-lg font-black ${isLowStock ? 'text-red-500' : 'text-gray-900'}`}>
                            {currentStock}
                        </div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Stock</div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50">
                    <div className="text-center">
                        <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Prix</div>
                        <div className="text-xs font-bold text-amber-600">{formatPrice(product.price)}</div>
                    </div>
                    <div className="text-center border-x border-gray-50">
                        <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Coût</div>
                        <div className="text-xs font-bold text-gray-700">{avgCost > 0 ? formatPrice(avgCost) : '-'}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Marge</div>
                        <div className={`text-xs font-bold ${margin > 40 ? 'text-green-600' : margin > 20 ? 'text-amber-600' : 'text-red-500'}`}>
                            {margin > 0 ? `${margin.toFixed(0)}%` : '-'}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={() => onEdit(product)}
                        variant="secondary"
                        size="sm"
                        className="flex-1 bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                    >
                        <Edit size={14} className="mr-1.5" />
                        Modifier
                    </Button>
                    <Button
                        onClick={() => onAdjust(product)}
                        variant="secondary"
                        size="sm"
                        className="flex-1 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
                    >
                        <BarChart3 size={14} className="mr-1.5" />
                        Ajuster
                    </Button>
                    <Button
                        onClick={() => onDelete(product)}
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                    >
                        <Trash2 size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
}
