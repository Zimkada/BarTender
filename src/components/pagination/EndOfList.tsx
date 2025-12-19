import React from 'react';

export interface EndOfListProps {
  show?: boolean;
  message?: string;
  itemCount?: number;
  className?: string;
}

/**
 * Affiche un message quand on atteint la fin de la liste
 */
export const EndOfList: React.FC<EndOfListProps> = ({
  show = false,
  message,
  itemCount,
  className,
}) => {
  if (!show) return null;

  const defaultMessage = itemCount
    ? `Fin de la liste - ${itemCount} éléments au total`
    : 'Fin de la liste';

  return (
    <div
      className={`flex items-center justify-center py-8 px-4 text-center ${
        className || ''
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        <svg
          className="h-6 w-6 text-green-500"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          {message || defaultMessage}
        </p>
      </div>
    </div>
  );
};

EndOfList.displayName = 'EndOfList';
