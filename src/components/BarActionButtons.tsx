import React, { useState } from 'react';
import { Ban, CheckCircle } from 'lucide-react';
import { Bar } from '../types';
import { BarReportButton } from './admin/BarReportButton';

interface BarActionButtonsProps {
    bar: Bar;
    onToggleStatus: (barId: string, currentStatus: boolean) => Promise<void>;
    onClose?: () => void;
}

export const BarActionButtons = React.memo<BarActionButtonsProps>(
    ({ bar, onToggleStatus, onClose }) => {
        const [loading, setLoading] = useState(false);

        const handleToggleStatus = async () => {
            setLoading(true);
            try {
                await onToggleStatus(bar.id, bar.isActive);
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleToggleStatus}
                    disabled={loading}
                    className={`px-3 py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 ${bar.isActive
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                >
                    {bar.isActive ? (
                        <>
                            <Ban className="w-3.5 h-3.5" />
                            Suspendre
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Activer
                        </>
                    )}
                </button>
                <BarReportButton bar={bar} />
            </div>
        );
    }
);

BarActionButtons.displayName = 'BarActionButtons';
