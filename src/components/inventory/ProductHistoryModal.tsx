import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBarContext } from '../../context/BarContext';
import { useAuth } from '../../context/AuthContext';
import { StockService } from '../../services/supabase/stock.service';
import { Product } from '../../types';
import { Spinner } from '../ui/Spinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { useStockMutations } from '../../hooks/mutations/useStockMutations';
import { dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import {
    History,
    TrendingDown,
    TrendingUp,
    Package,
    AlertTriangle,
    ShoppingCart,
    Truck,
    User,
    Calendar,
    RotateCcw,
    Undo2
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
    type: 'sale' | 'supply' | 'consignment' | 'adjustment' | 'return';
    date: Date;
    delta: number;
    label: string;
    user: string;
    details: string;
    price: number | null;
    notes: string | null;
    // supply-specific
    supplyReversed?: boolean;
    supplyReversalOf?: string | null;
}

const DEFAULT_HISTORY_DAYS = 7; // Optimized for responsive loading

export function ProductHistoryModal({ isOpen, onClose, product }: ProductHistoryModalProps) {
    const { currentBar } = useBarContext();
    const { currentSession } = useAuth();
    // Promoteur uniquement — aligné avec le RPC serveur (get_user_role = 'promoteur').
    const canManageSupplies = currentSession?.role === 'promoteur' || currentSession?.role === 'super_admin';
    const { reverseSupply } = useStockMutations(currentBar?.id);
    const [history, setHistory] = useState<TimelineEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [supplyToReverse, setSupplyToReverse] = useState<TimelineEvent | null>(null);

    // ✨ Date Filters (Default: Last 7 days for responsive loading)
    const [startDate, setStartDate] = useState<string>(
        dateToYYYYMMDD(new Date(Date.now() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000))
    );
    const [endDate, setEndDate] = useState<string>(
        dateToYYYYMMDD(new Date())
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
            // Parse YYYY-MM-DD as local date (sinon new Date() interprète en UTC → décalage UTC+1)
            const parseLocal = (s: string): Date => {
                const [y, m, d] = s.split('-').map(Number);
                return new Date(y, m - 1, d);
            };
            const start = startDate ? parseLocal(startDate) : undefined;
            const end = endDate ? parseLocal(endDate) : undefined;

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
            case 'return': return <RotateCcw size={16} className="text-purple-600" />;
            default: return <History size={16} className="text-muted-foreground" />;
        }
    };

    const getBadgeColor = (delta: number) => {
        if (delta > 0) return 'bg-green-100 text-green-700 border-green-200';
        if (delta < 0) return 'bg-red-50 text-red-700 border-red-100'; // Sales are negative stock
        return 'bg-muted text-foreground/80 border-border';
    };

    return (
        <>
        <Modal
            open={isOpen}
            onClose={onClose}
            title={`Historique : ${product.name}`}
            description={`Stock Actuel : ${product.stock} unités`}
            icon={<History className="text-blue-600" size={24} />}
            headerClassName="bg-blue-50/50"
            size="lg"
        >
            <div className="flex items-center gap-2 px-1 mb-4 bg-muted p-3 rounded-lg border border-border">
                <div className="flex-1">
                    <label className="block text-micro text-muted-foreground mb-1">Du</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="input-token w-full text-body-sm border border-border bg-card rounded-md px-2 py-1.5"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-micro text-muted-foreground mb-1">Au</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="input-token w-full text-body-sm border border-border bg-card rounded-md px-2 py-1.5"
                    />
                </div>
            </div>

            <div className="min-h-[400px] max-h-[60vh] overflow-y-auto px-1">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Spinner size="lg" />
                        <p className="text-body-sm text-muted-foreground">Reconstitution de l'enquête...</p>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg text-center">
                        {error}
                        <button onClick={loadHistory} className="block mx-auto mt-2 text-body-sm underline">Réessayer</button>
                    </div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <History size={48} className="mx-auto mb-3 opacity-20" />
                        <p className="text-body-sm">Aucun mouvement récent enregistré.</p>
                    </div>
                ) : (
                    <div className="space-y-0 relative before:absolute before:left-4 before:top-0 before:bottom-0 before:w-px before:bg-gray-200">
                        {history.map((event, index) => (
                            <div key={`${event.type}-${event.id}-${index}`} className="relative pl-10 py-3 group">
                                {/* Timeline Dot */}
                                <div className={`absolute left-[11px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm z-10 
                                    ${event.delta > 0 ? 'bg-green-500' : event.delta < 0 ? 'bg-red-400' : 'bg-gray-400'}`}
                                />

                                <div className="bg-card rounded-xl border border-border p-3 shadow-sm hover:shadow-md transition-shadow group-hover:border-blue-100">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`p-1.5 rounded-lg bg-muted border border-border`}>
                                                {getIcon(event.type)}
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <h4 className="text-body-sm font-semibold text-foreground capitalize">
                                                        {event.label}
                                                    </h4>
                                                    {(event as any).status === 'pending' && (
                                                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-micro rounded">
                                                            En attente
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-caption text-muted-foreground flex items-center gap-1">
                                                    <Calendar size={10} />
                                                    {format(event.date, "d MMM yyyy 'à' HH:mm", { locale: fr })}
                                                </p>
                                            </div>
                                        </div>

                                        <span className={`px-2.5 py-1 rounded-lg text-caption font-semibold border flex items-center gap-1 tabular-nums ${getBadgeColor(event.delta)}`}>
                                            {event.delta > 0 ? <TrendingUp size={12} /> : event.delta < 0 ? <TrendingDown size={12} /> : <Package size={12} />}
                                            {event.delta > 0 ? '+' : ''}{event.delta}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-caption mt-2 pt-2 border-t border-border">
                                        <div className="flex items-center gap-1.5 text-foreground/70 bg-muted px-2 py-1 rounded">
                                            <User size={12} />
                                            <span className="font-medium">
                                                {/* ✨ PRIVACY: Anonymiser pour les serveurs si ce n'est pas eux */}
                                                {(() => {
                                                    // ✨ Fix: Use top-level hook reference
                                                    const isServer = currentSession?.role === 'serveur';
                                                    const currentUserName = currentSession?.userName;

                                                    if (isServer && event.user !== currentUserName && event.user !== 'Inconnu') {
                                                        return 'Collègue';
                                                    }
                                                    return event.user;
                                                })()}
                                            </span>
                                        </div>

                                        <div className="text-muted-foreground font-mono">
                                            {event.details}
                                        </div>
                                    </div>

                                    {event.notes && (
                                        <div className="mt-2 text-caption text-muted-foreground italic pl-2 border-l-2 border-border">
                                            "{event.notes}"
                                        </div>
                                    )}

                                    {event.type === 'supply' && canManageSupplies && (
                                        <div className="mt-2 flex justify-end">
                                            {event.supplyReversed ? (
                                                <span className="text-micro bg-muted text-muted-foreground px-2 py-1 rounded-full uppercase">
                                                    Annulé
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => setSupplyToReverse(event)}
                                                    className="flex items-center gap-1 text-caption text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 py-1 rounded-lg transition-all"
                                                >
                                                    <Undo2 size={12} />
                                                    Annuler cet appro
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>

        <ConfirmationModal
            isOpen={!!supplyToReverse}
            onClose={() => setSupplyToReverse(null)}
            onConfirm={() => {
                if (!supplyToReverse) return;
                reverseSupply.mutate(
                    { supplyId: supplyToReverse.id, productId: product.id },
                    {
                        onSettled: () => setSupplyToReverse(null),
                        onSuccess: () => loadHistory(),
                    }
                );
            }}
            title="Annuler l'approvisionnement"
            message={`Cette action va créer une écriture d'annulation pour "${product.name}" (${supplyToReverse?.delta ?? ''} unités). Le stock et la comptabilité seront corrigés automatiquement.`}
            confirmLabel={reverseSupply.isPending ? 'Annulation…' : "Confirmer l'annulation"}
            cancelLabel="Garder"
            isDestructive={true}
            isLoading={reverseSupply.isPending}
        />
        </>
    );
}
