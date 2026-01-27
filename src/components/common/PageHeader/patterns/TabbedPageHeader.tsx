import React from 'react';
import { PageHeader } from '../BasePageHeader';
import { Button } from '../../../../components/ui/Button';

export interface TabItem {
    id: string;
    label: string;
    icon?: React.ElementType;
}

export interface TabbedPageHeaderProps {
    title: string | React.ReactNode;
    subtitle?: string | React.ReactNode;
    icon?: React.ReactNode;
    tabs: TabItem[];
    activeTab: string;
    onTabChange: (id: string) => void;
    actions?: React.ReactNode;
    mobileTopRightContent?: React.ReactNode;
    guideId?: string;
    onBack?: () => void;
    hideSubtitleOnMobile?: boolean;
}

export function TabbedPageHeader({
    title,
    subtitle,
    icon,
    tabs,
    activeTab,
    onTabChange,
    actions,
    mobileTopRightContent,
    guideId,
    onBack,
    hideSubtitleOnMobile
}: TabbedPageHeaderProps) {
    return (
        <PageHeader>
            <PageHeader.Top>
                <PageHeader.Left>
                    <PageHeader.Back onClick={onBack} />
                    {icon && <PageHeader.Icon>{icon}</PageHeader.Icon>}
                    <div className="flex-1 min-w-0">
                        <PageHeader.Title>{title}</PageHeader.Title>
                        {subtitle && (
                            <PageHeader.Description className={hideSubtitleOnMobile ? 'hidden sm:block' : ''}>
                                {subtitle}
                            </PageHeader.Description>
                        )}
                    </div>
                </PageHeader.Left>

                {/* Guide Button & Top Right Content on Mobile (Top Row) */}
                {(guideId || mobileTopRightContent) && (
                    <div className="sm:hidden flex items-center gap-1 flex-shrink-0 ml-1">
                        {mobileTopRightContent}
                        {guideId && <PageHeader.Guide guideId={guideId} variant="compact" />}
                    </div>
                )}

                <PageHeader.Actions>
                    {actions}
                    {guideId && <PageHeader.Guide guideId={guideId} />}
                </PageHeader.Actions>
            </PageHeader.Top>

            {/* Mobile Actions: Guide etc. */}
            {/* Mobile Actions: Actions only (Guide is on top) */}
            {actions && (
                <PageHeader.MobileActions>
                    {actions}
                </PageHeader.MobileActions>
            )}

            {/* Tabs Row */}
            <div className="pt-2 sm:pt-4 border-t border-white/10 sm:border-none">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <Button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                variant="ghost"
                                className={`flex-1 py-2 sm:py-2.5 px-3 sm:px-5 font-bold text-[10px] sm:text-xs transition-all whitespace-nowrap uppercase tracking-widest ${isActive
                                    ? 'glass-action-button-active-2026'
                                    : 'glass-action-button-2026 opacity-80'
                                    }`}
                            >
                                {Icon && <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 hidden sm:inline mr-2" />}
                                {tab.label}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </PageHeader>
    );
}
