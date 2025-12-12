import React from 'react';
import { Bar, BarMember, User, UserRole } from '../types';
import { BarActionButtons } from './BarActionButtons';

interface BarCardProps {
    bar: Bar;
    members: (BarMember & { user: User })[];
    onToggleStatus: (barId: string, currentStatus: boolean) => Promise<void>;
    onImpersonate: (userId: string, barId: string, role: UserRole) => Promise<void>;
    onShowStats: (bar: Bar) => void;
    onClose?: () => void;
}

export const BarCard = React.memo<BarCardProps>(
    ({ bar, members, onToggleStatus, onImpersonate, onShowStats, onClose }) => {
        const owner =
            members.find(m => m.userId === bar.ownerId)?.user ||
            members.find(m => m.role === 'promoteur')?.user;

        return (
            <div
                className={`bg-white rounded-lg p-4 border-2 ${bar.isActive ? 'border-green-200' : 'border-red-200'
                    } hover:shadow-lg transition-shadow`}
            >
                {/* Header */}
                <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-base text-gray-900 truncate">{bar.name}</h4>
                        <p className="text-xs text-gray-500 truncate">{bar.address || "Pas d'adresse"}</p>
                    </div>
                    <div
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ml-2 ${bar.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}
                    >
                        {bar.isActive ? 'Actif' : 'Suspendu'}
                    </div>
                </div>

                {/* Info */}
                <div className="space-y-1 text-xs mb-3 text-gray-600">
                    <p>
                        <span className="font-semibold">Promoteur:</span> {owner?.name || 'Inconnu'}
                    </p>
                    <p>
                        <span className="font-semibold">Email:</span> {owner?.email || 'N/A'}
                    </p>
                    <p>
                        <span className="font-semibold">Membres:</span> {members.length}
                    </p>
                    <p>
                        <span className="font-semibold">Créé le:</span>{' '}
                        {new Date(bar.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                </div>

                {/* Actions */}
                <BarActionButtons
                    bar={bar}
                    members={members}
                    onToggleStatus={onToggleStatus}
                    onImpersonate={onImpersonate}
                    onShowStats={onShowStats}
                    onClose={onClose}
                />
            </div>
        );
    }
);

BarCard.displayName = 'BarCard';
