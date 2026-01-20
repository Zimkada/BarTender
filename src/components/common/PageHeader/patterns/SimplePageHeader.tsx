import React from 'react';
import { PageHeader } from '../BasePageHeader';

export interface SimplePageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    mobileActions?: React.ReactNode; // Si différent du desktop
    mobileTopRightContent?: React.ReactNode;
    guideId?: string;
    onBack?: () => void;
    className?: string; // Pour surcharge éventuelle
}

export function SimplePageHeader({
    title,
    subtitle,
    icon,
    actions,
    mobileActions,
    mobileTopRightContent,
    guideId,
    onBack,
    className
}: SimplePageHeaderProps) {
    return (
        <PageHeader
            className={className}
            title={title}
            subtitle={subtitle}
            icon={icon}
            actions={actions}
            mobileActions={mobileActions}
            mobileTopRightContent={mobileTopRightContent}
            guideId={guideId}
        >
            <PageHeader.Top>
                <PageHeader.Left>
                    <PageHeader.Back onClick={onBack} />
                    {icon && <PageHeader.Icon>{icon}</PageHeader.Icon>}
                    <div className="flex-1 min-w-0">
                        <PageHeader.Title>{title}</PageHeader.Title>
                        {subtitle && <PageHeader.Description>{subtitle}</PageHeader.Description>}
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

            {/* Mobile Actions : Affichés uniquement sur mobile via CSS du composant MobileActions */}
            {(mobileActions ?? actions) && (
                <PageHeader.MobileActions>
                    {mobileActions ?? actions}
                </PageHeader.MobileActions>
            )}
        </PageHeader>
    );
}
