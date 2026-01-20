import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../ui/Button';
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
        <div className={`bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-2xl shadow-sm mb-4 sm:mb-6 overflow-hidden p-4 sm:p-6 ${className || ''}`}>
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
        <h1 className="text-lg sm:text-2xl font-bold truncate">{children}</h1>
    </div>
);

/** Icon container - typically for page context icon */
const Icon: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={`flex items-center justify-center bg-white/20 w-8 h-8 rounded-lg flex-shrink-0 ${className || ''}`}>
        {children}
    </div>
);

/** Subtitle/description text - hidden on mobile by default */
const Description: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <p className={`text-xs sm:text-sm text-amber-100 mt-0.5 sm:mt-1 ${className || ''}`}>
        {children}
    </p>
);

/** Desktop-only actions container (hidden on mobile) */
const Actions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {children}
    </div>
);

/** Mobile-only actions container (hidden on desktop, displayed on new line) */
const MobileActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex sm:hidden items-center gap-2">
        {children}
    </div>
);

/**
 * Back button sub-component
 * @param {() => void} onClick - Custom back handler. If not provided, navigates back in history
 */
const Back: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
    const navigate = useNavigate();
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={onClick || (() => navigate(-1))}
            className="rounded-lg transition-colors hover:bg-white/20 flex-shrink-0"
        >
            <ArrowLeft size={20} className="sm:hidden" />
            <ArrowLeft size={24} className="hidden sm:block" />
        </Button>
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
