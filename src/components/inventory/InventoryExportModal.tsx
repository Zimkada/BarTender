import { useState } from 'react';
import { Download, Calendar, Activity, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { Product, Category, ProductStockInfo } from '../../types';
import { useInventoryExport } from '../../hooks/useInventoryExport';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface InventoryExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    barId: string;
    barName: string;
    products: Product[];
    categories: Category[];
    getStockInfo: (id: string) => ProductStockInfo | null;
}

export function InventoryExportModal({
    isOpen,
    onClose,
    barId,
    barName,
    products,
    categories,
    getStockInfo
}: InventoryExportModalProps) {
    const [mode, setMode] = useState<'current' | 'historical'>('current');
    const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [targetTime, setTargetTime] = useState<string>('06:00');

    const { exportToExcel, isExporting } = useInventoryExport({
        barId,
        barName,
        products,
        categories,
        getStockInfo
    });

    const handleExport = async () => {
        if (mode === 'current') {
            await exportToExcel('current');
        } else {
            const fullDate = new Date(`${targetDate}T${targetTime}:00`);
            await exportToExcel('historical', fullDate);
        }
        onClose();
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Export Inventaire"
            description="Choisissez le type de rapport"
            icon={
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <FileSpreadsheet className="w-6 h-6 text-amber-600" />
                </div>
            }
            footer={
                <>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-gray-600 hover:bg-gray-100"
                    >
                        Annuler
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={isExporting}
                        className={cn(
                            "gap-2 font-bold shadow-lg transition-all",
                            isExporting ? "bg-gray-400" :
                                mode === 'current'
                                    ? "btn-brand text-white shadow-amber-500/20"
                                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                        )}
                    >
                        {isExporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Calcul...</span>
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                <span>Télécharger Excel</span>
                            </>
                        )}
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                {/* Mode Selection */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setMode('current')}
                        className={cn(
                            "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all",
                            mode === 'current'
                                ? "bg-amber-50 border-amber-200 text-amber-700 shadow-sm"
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
                        )}
                    >
                        <Activity className="w-6 h-6" />
                        <span className="font-medium">État Actuel</span>
                    </button>

                    <button
                        onClick={() => setMode('historical')}
                        className={cn(
                            "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all",
                            mode === 'historical'
                                ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
                        )}
                    >
                        <Calendar className="w-6 h-6" />
                        <span className="font-medium">Historique</span>
                    </button>
                </div>

                {/* Historical Options */}
                {mode === 'historical' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 bg-blue-50 p-4 rounded-xl border border-blue-100"
                    >
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-800">
                                <strong>Mode Reconstruction :</strong> Le système va recalculer le stock exact
                                à la date choisie en annulant tous les mouvements récents.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-600">Date Cible</label>
                                <input
                                    type="date"
                                    value={targetDate}
                                    onChange={(e) => setTargetDate(e.target.value)}
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-600">Heure (Début Jr.)</label>
                                <input
                                    type="time"
                                    value={targetTime}
                                    onChange={(e) => setTargetTime(e.target.value)}
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </Modal>
    );
}
