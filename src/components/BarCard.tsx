import React, { useState } from 'react';
import { Bar, BarMember, User } from '../types';
import { BarActionButtons } from './BarActionButtons';
import { PLANS, PLAN_ORDER, getPlan, type PlanId } from '../config/plans';

interface BarCardProps {
    bar: Bar;
    members: (BarMember & { user: User })[];
    onToggleStatus: (barId: string, currentStatus: boolean) => Promise<void>;
    onPlanChange?: (barId: string, newPlan: PlanId) => Promise<void>;
    onClose?: () => void;
}

export const BarCard = React.memo<BarCardProps>(
    ({ bar, members, onToggleStatus, onPlanChange, onClose }) => {
        const owner =
            members.find(m => m.userId === bar.ownerId)?.user ||
            members.find(m => m.role === 'promoteur')?.user;

        const currentPlan = getPlan(bar.settings?.plan);
        const [changingPlan, setChangingPlan] = useState(false);

        const activeMembers = members.filter(m => m.isActive !== false).length;

        const handlePlanChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
            const newPlan = e.target.value as PlanId;
            if (newPlan === currentPlan.id || !onPlanChange) return;

            const newPlanDef = PLANS[newPlan];

            // Garde-fou downgrade : vérifier que le nombre de membres actifs est compatible
            if (activeMembers > newPlanDef.maxMembers) {
                const confirmed = confirm(
                    `Ce bar a ${activeMembers} membres actifs mais le plan ${newPlanDef.label} n'autorise que ${newPlanDef.maxMembers}. ` +
                    `L'ajout de nouveaux membres sera bloqué, mais les membres existants ne seront pas supprimés.\n\n` +
                    `Voulez-vous continuer ?`
                );
                if (!confirmed) {
                    // Reset le select à la valeur actuelle
                    e.target.value = currentPlan.id;
                    return;
                }
            }

            setChangingPlan(true);
            try {
                await onPlanChange(bar.id, newPlan);
            } finally {
                setChangingPlan(false);
            }
        };

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
                        <span className="font-semibold">Membres:</span> {members.length} / {currentPlan.maxMembers}
                    </p>
                    <p>
                        <span className="font-semibold">Créé le:</span>{' '}
                        {new Date(bar.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                </div>

                {/* Plan selector */}
                <div className="flex items-center gap-2 mb-3 text-xs">
                    <span className="font-semibold text-gray-600">Plan :</span>
                    <select
                        value={currentPlan.id}
                        onChange={handlePlanChange}
                        disabled={changingPlan}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                    >
                        {PLAN_ORDER.map(planId => (
                            <option key={planId} value={planId}>
                                {PLANS[planId].label} — {PLANS[planId].maxMembers} membres, {PLANS[planId].description}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Actions */}
                <BarActionButtons
                    bar={bar}
                    onToggleStatus={onToggleStatus}
                    onClose={onClose}
                />
            </div>
        );
    }
);

BarCard.displayName = 'BarCard';
