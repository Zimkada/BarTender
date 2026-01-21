import { useState } from 'react';
import { TeamPerformanceTable } from '../../analytics/TeamPerformanceTable';
import { UserPerformanceStat } from '../../../hooks/useTeamPerformance';

interface DashboardPerformanceProps {
    teamPerformanceData: UserPerformanceStat[];
    totalRevenue: number;
    isServerRole: boolean;
}

export function DashboardPerformance({
    teamPerformanceData,
    totalRevenue,
    isServerRole
}: DashboardPerformanceProps) {
    const [userFilter, setUserFilter] = useState<'all' | 'servers' | 'management'>('all');

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-100" data-guide="team-performance">
                <TeamPerformanceTable
                    data={teamPerformanceData}
                    totalRevenue={totalRevenue}
                    filter={userFilter}
                    onFilterChange={setUserFilter}
                    title={isServerRole ? "Ma Performance (Journée)" : "Performance Équipe (Journée)"}
                    subtitle="Net (Ventes - Remboursés)"
                    compact={false}
                />
            </div>
        </div>
    );
}
