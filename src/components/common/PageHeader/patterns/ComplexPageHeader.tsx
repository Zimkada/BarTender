import React from 'react';
import { PageHeader } from '../BasePageHeader';

export interface ComplexPageHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    mobileActions?: React.ReactNode;
    bottomContent?: React.ReactNode; // Zone pour search, filtres, tris...
    guideId?: string;
    onBack?: () => void;
}

export function ComplexPageHeader({
    title,
    subtitle,
    icon,
    actions,
    mobileActions,
    bottomContent,
    guideId,
    onBack
}: ComplexPageHeaderProps) {
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
                    {actions}
                    {guideId && <PageHeader.Guide guideId={guideId} />}
                </PageHeader.Actions>
            </PageHeader.Top>

            {/* Mobile Actions */}
            {(mobileActions || actions || guideId) && (
                <PageHeader.MobileActions>
                    {mobileActions || actions}
                    {guideId && <PageHeader.Guide guideId={guideId} variant="compact" />}
                </PageHeader.MobileActions>
            )}

            {/* Bottom Content (Search, Filters, etc.) */}
            {bottomContent && (
                <div className="pt-3 sm:pt-4 border-t border-white/10 mt-2">
                    {bottomContent}
                </div>
            )}
        </PageHeader>
    );
}
