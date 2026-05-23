import { useState, useMemo } from 'react';
import { useOrderDraft } from '../../../hooks/useOrderDraft';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { useViewport } from '../../../hooks/useViewport';
import { useBarContext } from '../../../context/BarContext';
import { useAuth } from '../../../context/AuthContext';
import { usePurchaseOrdersMutations } from '../../../hooks/mutations/usePurchaseOrdersMutations';
import { useFeedback } from '../../../hooks/useFeedback';
import { Button } from '../../ui/Button';
import {
    Trash2,
    Download,
    MessageCircle,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Search,
    Save,
    CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../../lib/utils';
import { replaceAccents, buildWhatsAppMessage } from '../../../utils/stringFormatting';

interface OrderFinalizationProps {
    onOrderSaved?: () => void;
}

export function OrderFinalization({ onOrderSaved }: OrderFinalizationProps) {
    const { items, updateItem, removeItem, clearDraft, totals } = useOrderDraft();
    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();
    const { currentBar } = useBarContext();
    const { currentSession } = useAuth();
    const { showSuccess, showError } = useFeedback();
    const { createOrder } = usePurchaseOrdersMutations(currentBar?.id);

    // Local State
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedItems, setExpandedItems] = useState<string[]>([]); // Mobile only
    const [savedOrderId, setSavedOrderId] = useState<string | null>(null);

    // Filtrage
    const filteredItems = useMemo(() => {
        return items.filter(item =>
            item.productName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [items, searchTerm]);

    const toggleExpand = (id: string) => {
        setExpandedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    // Exports
    const exportWhatsApp = () => {
        if (items.length === 0) return;

        let body = '';
        items.forEach((item, idx) => {
            if (item.quantity > 0) {
                body += `${idx + 1}. *${item.productName}*\n`;
                body += `   Qté: ${item.quantity}`;
                if (item.lotSize > 1) {
                    const lots = Math.floor(item.quantity / item.lotSize);
                    const rest = item.quantity % item.lotSize;
                    body += ` (${lots} lots + ${rest})`;
                }

                const subtotal = (item.lotPrice > 0 && item.lotSize > 0)
                    ? (item.quantity / item.lotSize) * item.lotPrice
                    : item.quantity * item.unitPrice;

                if (subtotal > 0) {
                    body += ` | Total: ${formatPrice(subtotal)}`;
                }

                if (item.supplier) body += `\n   Fournisseur: ${item.supplier}`;
                body += `\n\n`;
            }
        });

        body += `*TOTAL ESTIMÉ : ${formatPrice(totals.totalCost)}*`;

        const msg = buildWhatsAppMessage({
            barName: currentBar?.name || 'Mon Bar',
            title: 'Bon de commande',
            body,
        });

        const url = `https://wa.me/?text=${encodeURIComponent(replaceAccents(msg))}`;
        window.open(url, '_blank');
    };

    const handleSaveOrder = async () => {
        if (!currentBar || !currentSession || items.length === 0) return;
        try {
            const order = await createOrder.mutateAsync({
                items,
                createdBy: currentSession.userId,
            });
            setSavedOrderId(order.id);
            showSuccess('Commande enregistrée ! Vous pouvez la retrouver dans l\'onglet Commandes.');
            clearDraft();
            onOrderSaved?.();
        } catch {
            showError('Impossible d\'enregistrer la commande.');
        }
    };

    const exportExcel = async () => {
        if (items.length === 0) return;

        try {
            // Lazy load xlsx
            const XLSX = await import('xlsx');

            // Préparation des données
            const data = items
                .filter(item => item.quantity > 0)
                .map(item => ({
                    'Produit': item.productName,
                    'Volume': item.productVolume,
                    'Quantité (Unités)': item.quantity,
                    'Taille Lot': item.lotSize,
                    'Nombre Lots': Math.floor(item.quantity / item.lotSize),
                    'Reste (Unités)': item.quantity % item.lotSize,
                    'Prix Unitaire (Est.)': item.unitPrice,
                    'Prix Lot (Négocié)': item.lotPrice,
                    'Fournisseur': item.supplier,
                    'Total Estimé': (item.lotPrice > 0 && item.lotSize > 0)
                        ? (item.quantity / item.lotSize) * item.lotPrice
                        : item.quantity * item.unitPrice
                }));

            // Ajout ligne total
            data.push({
                'Produit': 'TOTAL ESTIMÉ',
                'Volume': '',
                'Quantité (Unités)': totals.itemsCount,
                'Taille Lot': 0,
                'Nombre Lots': 0,
                'Reste (Unités)': 0,
                'Prix Unitaire (Est.)': 0,
                'Prix Lot (Négocié)': 0,
                'Fournisseur': '',
                'Total Estimé': totals.totalCost
            });

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Commande");

            // Génération fichier
            const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
            XLSX.writeFile(workbook, `Bon_Commande_${dateStr}.xlsx`);
        } catch (error) {
            console.error("Erreur export Excel:", error);
            // Si on avait useFeedback ici, on pourrait afficher une erreur
        }
    };

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-card rounded-3xl border border-dashed border-border">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground text-center">Aucun produit sélectionné</h3>
                <p className="text-muted-foreground text-sm text-center max-w-xs mt-2">
                    Retournez à l'onglet "Préparation" pour ajouter des produits à votre commande.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-card p-4 rounded-2xl border border-border shadow-sm">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Filtrer..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="input-token w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-xl text-sm"
                    />
                </div>

                <div className="hidden sm:flex gap-2 w-full sm:w-auto flex-wrap">
                    <Button
                        onClick={() => {
                            if (window.confirm("Êtes-vous sûr de vouloir vider la commande ?")) {
                                clearDraft();
                            }
                        }}
                        className="flex-1 sm:flex-none gap-2 text-white border-none hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: '#EF4444', backgroundImage: 'none' }}
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Vider</span>
                    </Button>
                    <Button
                        onClick={exportExcel}
                        className="flex-1 sm:flex-none gap-2 text-white border-none hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: '#1D6F42', backgroundImage: 'none' }}
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Excel</span>
                    </Button>
                    <Button
                        onClick={exportWhatsApp}
                        className="flex-1 sm:flex-none gap-2 text-white border-none hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: '#25D366', backgroundImage: 'none' }}
                    >
                        <MessageCircle className="w-4 h-4" />
                        <span className="hidden sm:inline">WhatsApp</span>
                    </Button>
                    {!savedOrderId && (
                        <Button
                            onClick={handleSaveOrder}
                            disabled={createOrder.isPending || items.length === 0}
                            className="flex-1 sm:flex-none gap-2 text-white border-none hover:opacity-90 transition-opacity font-bold"
                            style={{ backgroundColor: '#6366F1', backgroundImage: 'none' }}
                        >
                            <Save className="w-4 h-4" />
                            {createOrder.isPending ? 'Enregistrement…' : 'Enregistrer & Commander'}
                        </Button>
                    )}
                    {savedOrderId && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 rounded-lg text-green-700 dark:text-green-400 text-sm font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            Commande sauvegardée
                        </div>
                    )}
                </div>
            </div>

            {/* Desktop View (Table) */}
            {!isMobile ? (
                <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Produit</th>
                                <th className="px-4 py-4 w-32">Qté (Unités)</th>
                                <th className="px-4 py-4 w-32">Condit. (Lot)</th>
                                <th className="px-4 py-4 w-32">Prix/Lot</th>
                                <th className="px-4 py-4 w-48">Fournisseur</th>
                                <th className="px-4 py-4 w-32 text-right">Total Est.</th>
                                <th className="px-4 py-4 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredItems.map(item => (
                                <tr key={item.productId} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-foreground">{item.productName}</div>
                                        <div className="text-xs text-muted-foreground">{item.productVolume}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <input
                                            type="number"
                                            min="0"
                                            value={item.quantity}
                                            onChange={e => updateItem(item.productId, { quantity: parseInt(e.target.value) || 0 })}
                                            className="input-token w-full px-3 py-2 bg-muted border border-border rounded-lg text-center font-bold"
                                        />
                                    </td>
                                    <td className="px-4 py-4">
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.lotSize || ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const num = val === '' ? 0 : parseInt(val);
                                                updateItem(item.productId, { lotSize: isNaN(num) ? 0 : num });
                                            }}
                                            className="input-token w-full px-3 py-2 bg-card border border-border rounded-lg text-center"
                                        />
                                    </td>
                                    <td className="px-4 py-4">
                                        <input
                                            type="number"
                                            min="0"
                                            value={item.lotPrice || ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const num = val === '' ? 0 : parseFloat(val);
                                                updateItem(item.productId, { lotPrice: isNaN(num) ? 0 : num });
                                            }}
                                            className="input-token w-full px-3 py-2 bg-card border border-border rounded-lg text-center"
                                        />
                                    </td>
                                    <td className="px-4 py-4">
                                        <input
                                            type="text"
                                            placeholder="Standard"
                                            value={item.supplier}
                                            onChange={e => updateItem(item.productId, { supplier: e.target.value })}
                                            className="input-token w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    </td>
                                    <td className="px-4 py-4 text-right font-bold text-foreground">
                                        {(() => {
                                            const total = (item.lotPrice > 0 && item.lotSize > 0)
                                                ? (item.quantity / item.lotSize) * item.lotPrice
                                                : item.quantity * item.unitPrice;

                                            if (total === 0) {
                                                return (
                                                    <div className="flex items-center justify-end gap-1 text-orange-500 font-medium">
                                                        <AlertCircle className="w-4 h-4" />
                                                        <span className="text-xs">Prix manquant</span>
                                                    </div>
                                                );
                                            }
                                            return formatPrice(total);
                                        })()}
                                    </td>
                                    <td className="px-4 py-4">
                                        <button
                                            onClick={() => removeItem(item.productId)}
                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-muted">
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-right font-bold text-muted-foreground uppercase text-xs tracking-wider">Total Estimé</td>
                                <td className="px-4 py-4 text-right font-black text-lg text-brand-primary">
                                    {formatPrice(totals.totalCost)}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                /* Mobile View (Cards) */
                <div className="space-y-3">
                    {filteredItems.map(item => {
                        const isExpanded = expandedItems.includes(item.productId);
                        const totalItemCost = (item.lotPrice > 0 && item.lotSize > 0)
                            ? (item.quantity / item.lotSize) * item.lotPrice
                            : item.quantity * item.unitPrice;

                        return (
                            <motion.div
                                key={item.productId}
                                layout
                                className={cn(
                                    "bg-card rounded-xl border p-4 transition-all shadow-sm",
                                    item.quantity > 0 ? "border-brand-primary/50 ring-1 ring-brand-primary/10" : "border-border"
                                )}
                            >
                                <div className="flex justify-between items-start gap-4 mb-3">
                                    <div>
                                        <h4 className="font-bold text-foreground">{item.productName}</h4>
                                        <p className="text-xs text-muted-foreground">{item.productVolume}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-brand-primary">{formatPrice(totalItemCost)}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Qté à commander</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={e => updateItem(item.productId, { quantity: parseInt(e.target.value) || 0 })}
                                                className="input-token w-full px-4 py-3 bg-muted border border-border rounded-xl font-bold text-lg text-center"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleExpand(item.productId)}
                                        className={cn(
                                            "p-3 rounded-xl border mt-5 transition-all",
                                            isExpanded ? "bg-brand-subtle text-brand-primary border-brand-primary/20" : "bg-card border-border text-muted-foreground"
                                        )}
                                    >
                                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-4 mt-4 border-t border-border grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Taille Lot</label>
                                                    <input
                                                        type="number"
                                                        value={item.lotSize || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            // Si vide, on met 0 (ou undefined) temporairement
                                                            const num = val === '' ? 0 : parseInt(val);
                                                            updateItem(item.productId, { lotSize: isNaN(num) ? 0 : num });
                                                        }}
                                                        className="input-token w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Prix / Lot</label>
                                                    <input
                                                        type="number"
                                                        value={item.lotPrice || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const num = val === '' ? 0 : parseFloat(val);
                                                            updateItem(item.productId, { lotPrice: isNaN(num) ? 0 : num });
                                                        }}
                                                        className="input-token w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Fournisseur</label>
                                                    <input
                                                        type="text"
                                                        value={item.supplier}
                                                        onChange={e => updateItem(item.productId, { supplier: e.target.value })}
                                                        placeholder="Nom du fournisseur"
                                                        className="input-token w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="col-span-2 pt-2">
                                                    <Button variant="ghost" size="sm" onClick={() => removeItem(item.productId)} className="w-full text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-300">
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Retirer de la commande
                                                    </Button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Sticky Footer Mobile Summary */}
            {isMobile && filteredItems.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-50 pb-safe">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm text-muted-foreground font-medium">{totals.itemsCount} articles</span>
                        <span className="text-xl font-black text-brand-primary">{formatPrice(totals.totalCost)}</span>
                    </div>
                    {savedOrderId ? (
                        <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 rounded-xl text-green-700 dark:text-green-400 text-sm font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            Commande sauvegardée
                        </div>
                    ) : (
                        <>
                            <Button
                                onClick={handleSaveOrder}
                                disabled={createOrder.isPending}
                                className="w-full gap-2 text-white border-none font-bold mb-2"
                                style={{ backgroundColor: '#6366F1', backgroundImage: 'none' }}
                            >
                                <Save className="w-4 h-4" />
                                {createOrder.isPending ? 'Enregistrement…' : 'Enregistrer & Commander'}
                            </Button>
                            <div className="grid grid-cols-3 gap-2">
                                <Button
                                    className="w-full text-white border-none hover:opacity-90 transition-opacity"
                                    style={{ backgroundColor: '#EF4444', backgroundImage: 'none' }}
                                    onClick={() => {
                                        if (window.confirm("Vider la commande ?")) {
                                            clearDraft();
                                        }
                                    }}
                                >
                                    <Trash2 className="w-5 h-5" />
                                </Button>
                                <Button
                                    className="w-full text-white border-none hover:opacity-90 transition-opacity"
                                    style={{ backgroundColor: '#1D6F42', backgroundImage: 'none' }}
                                    onClick={exportExcel}
                                >
                                    Excel
                                </Button>
                                <Button
                                    className="w-full text-white border-none hover:opacity-90 transition-opacity"
                                    style={{ backgroundColor: '#25D366', backgroundImage: 'none' }}
                                    onClick={exportWhatsApp}
                                >
                                    WhatsApp
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
