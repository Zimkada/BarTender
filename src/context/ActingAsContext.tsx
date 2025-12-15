import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

/**
 * ActingAs State
 * Represents the current "Acting As" session for super_admin impersonation
 */
export interface ActingAsState {
  isActive: boolean;
  userId: string | null;
  userName: string | null;
  barId: string | null;
  barName: string | null;
  startedAt: Date | null;
}

/**
 * ActingAs Context
 * Manages proxy admin impersonation state globally
 */
interface ActingAsContextType {
  actingAs: ActingAsState;
  startActingAs: (userId: string, userName: string, barId: string, barName: string) => void;
  stopActingAs: () => void;
  isActingAs: () => boolean;
}

const ActingAsContext = createContext<ActingAsContextType | undefined>(undefined);

/**
 * ActingAsProvider
 * Provides impersonation context to the entire app
 */
export const ActingAsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize from sessionStorage to persist state across refreshes
  const [actingAs, setActingAs] = useState<ActingAsState>(() => {
    try {
      const saved = sessionStorage.getItem('acting-as-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore Date object since JSON stringifies it
        if (parsed.startedAt) {
          parsed.startedAt = new Date(parsed.startedAt);
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse acting-as-state', e);
    }
    return {
      isActive: false,
      userId: null,
      userName: null,
      barId: null,
      barName: null,
      startedAt: null,
    };
  });

  // Persist to sessionStorage whenever state changes
  useEffect(() => {
    if (actingAs.isActive) {
      sessionStorage.setItem('acting-as-state', JSON.stringify(actingAs));
    } else {
      sessionStorage.removeItem('acting-as-state');
    }
  }, [actingAs]);

  /**
   * Start acting as another user
   * Called when super_admin selects a user to impersonate
   */
  const startActingAs = useCallback((userId: string, userName: string, barId: string, barName: string) => {
    setActingAs({
      isActive: true,
      userId,
      userName,
      barId,
      barName,
      startedAt: new Date(),
    });

    // Log to console for debugging
    console.log(
      `[ActingAs] Started acting as ${userName} in bar ${barName}`,
      { userId, barId, startedAt: new Date().toISOString() }
    );
  }, []);

  /**
   * Stop acting as another user
   * Returns to normal super_admin mode
   */
  const stopActingAs = useCallback(() => {
    const previousUser = actingAs.userName;
    setActingAs({
      isActive: false,
      userId: null,
      userName: null,
      barId: null,
      barName: null,
      startedAt: null,
    });

    console.log(`[ActingAs] Stopped acting as ${previousUser}`);
  }, [actingAs.userName]);

  /**
   * Check if currently acting as another user
   */
  const isActingAs = useCallback(() => actingAs.isActive, [actingAs.isActive]);

  const value: ActingAsContextType = {
    actingAs,
    startActingAs,
    stopActingAs,
    isActingAs,
  };

  return <ActingAsContext.Provider value={value}>{children}</ActingAsContext.Provider>;
};

/**
 * Hook to use ActingAs context
 * Provides impersonation state and controls
 */
export const useActingAs = () => {
  const context = useContext(ActingAsContext);
  if (!context) {
    throw new Error('useActingAs must be used within ActingAsProvider');
  }
  return context;
};
