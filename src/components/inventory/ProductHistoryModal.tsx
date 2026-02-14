import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBarContext } from '../../context/BarContext';
import { useAuth } from '../../context/AuthContext';
import { StockService } from '../../services/supabase/stock.service';
import { Product } from '../../types';
import { Spinner } from '../ui/Spinner';
import {
    History,
    TrendingDown,
    TrendingUp,
    Package,
    AlertTriangle,
    ShoppingCart,
    Truck,
    User,
    Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ProductHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product;
}

interface TimelineEvent {
    id: string;
    type: 'sale' | 'supply' | 'consignment' | 'adjustment';
    date: Date;
    delta: number;
    label: string;
    user: string;
    details: string;
    price: number | null;
    notes: string | null;
}

export function ProductHistoryModal({ isOpen, onClose, product }: ProductHistoryModalProps) {
    const { currentBar } = useBarContext();
    const [history, setHistory] = useState<TimelineEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ✨ Date Filters (Default: Last 30 days)
    const [startDate, setStartDate] = useState<string>(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );

    useEffect(() => {
        if (isOpen && currentBar && product) {
            loadHistory();
        }
    }, [isOpen, currentBar, product, startDate, endDate]); // Reload on date change

    const loadHistory = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const start = startDate ? new Date(startDate) : undefined;
            const end = endDate ? new Date(endDate) : undefined;

            // Adjust end date to include the full day
            if (end) end.setHours(23, 59, 59, 999);

            const data = await StockService.getProductHistory(currentBar!.id, product.id, {
                startDate: start,
                endDate: end
            });
            setHistory(data);
        } catch (err) {
            console.error(err);
            setError("Impossible de charger l'historique.");
        } finally {
            setIsLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'sale': return <ShoppingCart size={16} className="text-blue-500" />;
            case 'supply': return <Truck size={16} className="text-green-500" />;
            case 'consignment': return <Package size={16} className="text-purple-500" />;
            case 'adjustment': return <AlertTriangle size={16} className="text-orange-500" />;
            default: return <History size={16} className="text-gray-500" />;
        }
    };

    const getBadgeColor = (delta: number) => {
        if (delta > 0) return 'bg-green-100 text-green-700 border-green-200';
        if (delta < 0) return 'bg-red-50 text-red-700 border-red-100'; // Sales are negative stock
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={`Historique : ${product.name}`}
            description={`Stock Actuel : ${product.stock} unités`}
            icon={<History className="text-blue-600" size={24} />}
            headerClassName="bg-blue-50/50"
            size="lg"
        >
            <div className="flex items-center gap-2 px-1 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Du</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Au</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="min-h-[400px] max-h-[60vh] overflow-y-auto px-1">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Spinner size="lg" />
                        <p className="text-sm text-gray-400">Reconstitution de l'enquête...</p>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-50 text-red-600 rounded-lg text-center">
                        {error}
                        <button onClick={loadHistory} className="block mx-auto mt-2 text-sm underline">Réessayer</button>
                    </div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <History size={48} className="mx-auto mb-3 opacity-20" />
                        <p>Aucun mouvement récent enregistré.</p>
                    </div>
                ) : (
                    <div className="space-y-0 relative before:absolute before:left-4 before:top-0 before:bottom-0 before:w-px before:bg-gray-200">
                        {history.map((event, index) => (
                            <div key={`${event.type}-${event.id}-${index}`} className="relative pl-10 py-3 group">
                                {/* Timeline Dot */}
                                <div className={`absolute left-[11px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm z-10 
                                    ${event.delta > 0 ? 'bg-green-500' : event.delta < 0 ? 'bg-red-400' : 'bg-gray-400'}`}
                                />

                                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md transition-shadow group-hover:border-blue-100">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`p-1.5 rounded-lg bg-gray-50 border border-gray-100`}>
                                                {getIcon(event.type)}
                                            </span>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 capitalize">
                                                    {event.label}
                                                </h4>
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Calendar size={10} />
                                                    {format(event.date, "d MMM yyyy 'à' HH:mm", { locale: fr })}
                                                </p>
                                            </div>
                                        </div>

                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1 ${getBadgeColor(event.delta)}`}>
                                            {event.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                            {event.delta > 0 ? '+' : ''}{event.delta}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 px-2 py-1 rounded">
                                            <User size={12} />
                                            <span className="font-medium">
                                                {/* ✨ PRIVACY: Anonymiser pour les serveurs si ce n'est pas eux */}
                                                {(() => {
                                                    const { currentSession } = useAuth();
                                                    const isServer = currentSession?.role === 'serveur';
                                                    if (isServer && event.user !== currentSession.userName && event.user !== 'Inconnu') {
                                                        return 'Collègue';
                                                    }
                                                    return event.user;
                                                })()}
                                            </span>
                                        </div>

                                        <div className="text-gray-500 font-mono">
                                            {event.details}
                                        </div>
                                    </div>

                                    {event.notes && (
                                        <div className="mt-2 text-xs text-gray-400 italic pl-2 border-l-2 border-gray-100">
                                            "{event.notes}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
