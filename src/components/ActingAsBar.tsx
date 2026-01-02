import React from 'react';
import { useActingAs } from '../context/ActingAsContext';

/**
 * ActingAsBar Component
 * Displays a prominent notification when a super_admin is acting as another user
 * Provides quick access to stop the impersonation session
 */
export const ActingAsBar: React.FC = () => {
  const { actingAs, stopActingAs } = useActingAs();

  if (!actingAs.isActive) {
    return null;
  }

  const durationMinutes = actingAs.startedAt
    ? Math.floor((Date.now() - actingAs.startedAt.getTime()) / 60000)
    : 0;

  const handleStopActing = () => {
    stopActingAs();
    import('react-hot-toast').then(({ default: toast }) => {
      toast.success(`Stopped acting as ${actingAs.userName}`);
    });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Left: Status info */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white bg-opacity-20">
                <svg
                  className="h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                </svg>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">
                Acting as <strong className="font-semibold">{actingAs.userName}</strong>
              </p>
              <p className="text-xs text-amber-100">
                in <strong>{actingAs.barName}</strong> • {durationMinutes} min active
              </p>
            </div>
          </div>

          {/* Right: Action button */}
          <div className="flex-shrink-0 flex gap-2">
            <button
              onClick={handleStopActing}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-white bg-opacity-20 hover:bg-opacity-30 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-amber-500"
            >
              <svg
                className="h-4 w-4 mr-2"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Stop Acting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ActingAsBar;
