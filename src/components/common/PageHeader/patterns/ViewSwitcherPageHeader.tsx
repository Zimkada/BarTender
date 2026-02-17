import React from 'react';
import { PageHeader } from '../BasePageHeader';
import { Button } from '../../../../components/ui/Button';
import { List, BarChart3 } from 'lucide-react';

export interface ViewSwitcherPageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    currentView: 'list' | 'analytics';
    onViewChange: (view: 'list' | 'analytics') => void;
    actions?: React.ReactNode; // Actions additionnelles (ex: Guide est géré via guideId)
    guideId?: string;
    onBack?: () => void;
}

export function ViewSwitcherPageHeader({
    title,
    subtitle,
    icon,
    currentView,
    onViewChange,
    actions,
    guideId,
    onBack
}: ViewSwitcherPageHeaderProps) {

    const ViewToggle = (
        <div className="flex bg-white/50 backdrop-blur-sm p-1 rounded-xl w-full sm:w-auto border border-amber-400/20">
            <Button
                onClick={() => onViewChange('list')}
                variant="ghost"
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex-1 sm:flex-initial ${currentView === 'list' ? 'glass-action-button-active-2026' : 'glass-action-button-2026'}`}
            >
                <List size={16} /> Liste
            </Button>
            <Button
                onClick={() => onViewChange('analytics')}
                variant="ghost"
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex-1 sm:flex-initial ${currentView === 'analytics' ? 'glass-action-button-active-2026' : 'glass-action-button-2026'}`}
            >
                <BarChart3 size={16} /> Stats
            </Button>
        </div>
    );


    return (
        <PageHeader>
            <PageHeader.Top>
                <PageHeader.Left>
                    <PageHeader.Back onClick={onBack} />
                    {icon && <PageHeader.Icon>{icon}</PageHeader.Icon>}
                    <div className="flex-1 min-w-0">
                        <PageHeader.Title>{title}</PageHeader.Title>
                        {subtitle && <PageHeader.Description>{subtitle}</PageHeader.Description>}
                    </div>
                </PageHeader.Left>

                <PageHeader.Actions>
                    {/* Actions spécifiques (vide souvent) */}
                    {actions}
                    {/* Guide Button */}
                    {guideId && <PageHeader.Guide guideId={guideId} />}
                    {/* Switcher Desktop - Placé après le guide ou avant ? UX: Switcher est important. 
               Proposal: Actions < Guide < Switcher ? Or Switcher < Guide? 
               Plan says: Guide TOUJOURS à la fin. 
               So: Actions -> Switcher -> Guide? 
               Wait, PageHeader.Guide is a wrapper. 
               Let's put Switcher explicitly. */}
                    {ViewToggle}
                </PageHeader.Actions>
            </PageHeader.Top>

            {/* Mobile: Switcher is often below title in full width */}
            <PageHeader.MobileActions>
                {ViewToggle}
                {guideId && <PageHeader.Guide guideId={guideId} variant="compact" />}
            </PageHeader.MobileActions>
        </PageHeader>
    );
}
