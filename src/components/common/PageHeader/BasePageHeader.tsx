import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../../ui/BackButton';
import { GuideHeaderButton } from '../../guide/GuideHeaderButton';

export interface PageHeaderProps {
    children: React.ReactNode;
    className?: string;
}

// Sub-components interfaces
interface PageHeaderComponent extends React.FC<PageHeaderProps> {
    Top: React.FC<{ children: React.ReactNode }>;
    Left: React.FC<{ children: React.ReactNode }>;
    Title: React.FC<{ children: React.ReactNode }>;
    Description: React.FC<{ children: React.ReactNode; className?: string }>;
    Actions: React.FC<{ children: React.ReactNode }>;
    MobileActions: React.FC<{ children: React.ReactNode }>;
    Icon: React.FC<{ children: React.ReactNode; className?: string }>;
    Back: React.FC<{ onClick?: () => void }>;
    Guide: React.FC<{ guideId: string; variant?: 'default' | 'compact' }>;
}

const PageHeader: PageHeaderComponent = ({
    children,
    className
}: PageHeaderProps) => {
    return (
        <div className={`glass-page-header mb-4 sm:mb-6 overflow-hidden p-4 sm:p-6 transition-all duration-500 ${className || ''}`}>
            <div className="flex flex-col gap-3 sm:gap-4">
                {children}
            </div>
        </div>
    );
};

// Sub-components implementations
/** Top-level flex container for header content (title/left + actions/right) */
const Top: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-between gap-2 sm:gap-3">
        {children}
    </div>
);

/** Left section container (back button + icon + title area) */
const Left: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {children}
    </div>
);

/** Heading element - auto-truncated for long titles */
const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex-1 min-w-0">
        <h1 className="text-lg sm:text-2xl font-bold truncate tracking-tight">{children}</h1>
    </div>
);

/** Icon container - typically for page context icon */
const Icon: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={`flex items-center justify-center glass-page-icon w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 ${className || ''}`}>
        {children}
    </div>
);

/** Subtitle/description text - hidden on mobile by default */
const Description: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={`text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 font-medium ${className || ''}`}>
        {children}
    </div>
);

/** Desktop-only actions container (hidden on mobile) */
const Actions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="hidden sm:flex items-center gap-2 flex-shrink-0 page-header-actions">
        {children}
    </div>
);

/** Mobile-only actions container (hidden on desktop, displayed on new line) */
const MobileActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex sm:hidden items-center gap-2 page-header-actions">
        {children}
    </div>
);

/**
 * Back button sub-component
 * @param {() => void} onClick - Custom back handler. If not provided, navigates back in history
 */
const Back: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
    const navigate = useNavigate();
    // Utilisation du BackButton unifié qui porte maintenant le style "Glass" par défaut
    return (
        <BackButton
            onClick={onClick || (() => navigate(-1))}
            className="sm:mr-0" // Reset margin if needed
        />
    );
};

/**
 * Guide button sub-component
 * @param {string} guideId - Unique identifier for the guide tour
 * @param {'default' | 'compact'} variant - Display variant ('default' for desktop, 'compact' for mobile)
 */
const Guide: React.FC<{ guideId: string; variant?: 'default' | 'compact' }> = ({ guideId, variant }) => (
    <GuideHeaderButton guideId={guideId} variant={variant} />
);

// Final static assignment
PageHeader.Top = Top;
PageHeader.Left = Left;
PageHeader.Title = Title;
PageHeader.Description = Description;
PageHeader.Actions = Actions;
PageHeader.MobileActions = MobileActions;
PageHeader.Icon = Icon;
PageHeader.Back = Back;
PageHeader.Guide = Guide;

export { PageHeader };
