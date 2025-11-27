import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    message: string;
    subMessage?: string;
    action?: React.ReactNode;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon,
    message,
    subMessage,
    action,
    className = ""
}) => {
    return (
        <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
            <div className="bg-gray-50 p-4 rounded-full mb-4">
                <Icon size={48} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">{message}</h3>
            {subMessage && (
                <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">{subMessage}</p>
            )}
            {action && (
                <div>{action}</div>
            )}
        </div>
    );
};
