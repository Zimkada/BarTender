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
        <div className="flex bg-amber-700/30 p-1 rounded-lg w-full sm:w-auto">
            <Button
                onClick={() => onViewChange('list')}
                variant={currentView === 'list' ? 'default' : 'ghost'}
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all flex-1 sm:flex-initial ${currentView === 'list' ? '' : 'text-amber-100 hover:bg-white/10'}`}
            >
                <List size={16} className="mr-2" /> Liste
            </Button>
            <Button
                onClick={() => onViewChange('analytics')}
                variant={currentView === 'analytics' ? 'default' : 'ghost'}
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all flex-1 sm:flex-initial ${currentView === 'analytics' ? '' : 'text-amber-100 hover:bg-white/10'}`}
            >
                <BarChart3 size={16} className="mr-2" /> Analytics
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
