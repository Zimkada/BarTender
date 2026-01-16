/**
 * GuideContext
 * Modern guide system context with full state management
 * Handles: tour lifecycle, progress persistence, analytics
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { GuideContextType, GuideTour, GuideStep, GuideProgress } from '@/types/guide';
import { auditLogger } from '@/services/AuditLogger';
import { supabase } from '@/lib/supabase';

/**
 * Create context
 */
const GuideContext = createContext<GuideContextType | undefined>(undefined);

/**
 * Provider component
 */
export const GuideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentSession } = useAuth();
  const userId = currentSession?.user?.id;

  // State
  const [activeTour, setActiveTour] = useState<GuideTour | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedTours, setSuggestedTours] = useState<GuideTour[]>([]);

  // Cache of completed guides (loaded once on mount)
  const [completedGuides, setCompletedGuides] = useState<Set<string>>(new Set());

  /**
   * Load completed guides from localStorage + Supabase
   */
  useEffect(() => {
    if (!userId) return;

    const loadProgress = async () => {
      try {
        // Try Supabase first
        const { data, error: dbError } = await supabase
          .from('guide_progress')
          .select('tour_id, completed_at')
          .eq('user_id', userId)
          .not('completed_at', 'is', null);

        if (!dbError && data) {
          setCompletedGuides(new Set(data.map(d => d.tour_id)));
        }
      } catch (err) {
        console.warn('Failed to load guide progress:', err);
      }
    };

    loadProgress();
  }, [userId]);

  /**
   * Start a guide tour
   */
  const startTour = useCallback(
    async (tourId: string, tour?: GuideTour) => {
      console.log('[GuideContext.startTour] tourId:', tourId, 'tour:', tour);

      // Set active tour object
      if (tour) {
        console.log('[GuideContext.startTour] Setting activeTour:', tour.title);
        setActiveTour(tour);
      } else {
        console.warn('[GuideContext.startTour] No tour object provided!');
      }

      // Show tour UI
      setIsVisible(true);
      setCurrentStepIndex(0);
      setError(null);
      console.log('[GuideContext.startTour] UI visible, currentStepIndex = 0');

      // Log analytics
      if (userId) {
        auditLogger.log({
          event: 'GUIDE_STARTED',
          userId: userId,
          userName: currentSession?.user?.email || 'Unknown',
          userRole: currentSession?.role || 'serveur',
          description: `Started guide: ${tourId}`,
          metadata: {
            tour_id: tourId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
    [userId, currentSession?.user?.email, currentSession?.role]
  );

  /**
   * Navigate to next step
   */
  const nextStep = useCallback(() => {
    if (!activeTour) return;

    if (currentStepIndex < activeTour.steps.length - 1) {
      const newIndex = currentStepIndex + 1;
      setCurrentStepIndex(newIndex);

      // Log step view
      if (userId) {
        auditLogger.log({
          event: 'GUIDE_STEP_VIEWED',
          userId: userId,
          userName: currentSession?.user?.email || 'Unknown',
          userRole: currentSession?.role || 'serveur',
          description: `Viewed step ${newIndex + 1} of guide: ${activeTour.id}`,
          metadata: {
            tour_id: activeTour.id,
            step_index: newIndex,
          },
        });
      }
    }
  }, [activeTour?.id, activeTour?.steps?.length, currentStepIndex, userId, currentSession?.user?.email, currentSession?.role]);

  /**
   * Navigate to previous step
   */
  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }, [currentStepIndex]);

  /**
   * Complete tour (save progress + rate)
   */
  const completeTour = useCallback(async () => {
    console.log('[GuideContext.completeTour] activeTour:', activeTour?.id, 'userId:', userId);

    if (!activeTour) {
      console.warn('[GuideContext.completeTour] No active tour');
      return;
    }

    try {
      setIsLoading(true);

      // Save completion to Supabase (only if user is authenticated)
      if (userId) {
        const { error: dbError } = await supabase.from('guide_progress').upsert({
          user_id: userId,
          tour_id: activeTour.id,
          completed_at: new Date().toISOString(),
          current_step_index: activeTour.steps.length - 1,
        });

        if (dbError) throw dbError;

        // Update local cache
        setCompletedGuides(prev => new Set([...prev, activeTour.id]));

        // Log completion
        auditLogger.log({
          event: 'GUIDE_COMPLETED',
          userId: userId,
          userName: currentSession?.user?.email || 'Unknown',
          userRole: currentSession?.role || 'serveur',
          description: `Completed guide: ${activeTour.id}`,
          metadata: {
            tour_id: activeTour.id,
            steps_count: activeTour.steps.length,
          },
        });
      }

      console.log('[GuideContext.completeTour] Closing tour');
      // Close modal ONLY if no error
      closeTour();
    } catch (err: any) {
      console.error('Failed to complete guide:', err);
      setError(err.message || 'Impossible de sauvegarder votre progression. Vérifiez votre connexion.');
      // ✅ Do NOT close modal on error - let user retry
    } finally {
      setIsLoading(false);
    }
  }, [activeTour?.id, activeTour?.steps?.length, userId, currentSession?.user?.email, currentSession?.role]);

  /**
   * Skip tour
   */
  const skipTour = useCallback(async () => {
    console.log('[GuideContext.skipTour] activeTour:', activeTour?.id, 'userId:', userId);

    if (!activeTour) {
      console.warn('[GuideContext.skipTour] No active tour');
      return;
    }

    try {
      // Save skip to Supabase (only if user is authenticated)
      if (userId) {
        await supabase.from('guide_progress').upsert({
          user_id: userId,
          tour_id: activeTour.id,
          skipped_at: new Date().toISOString(),
          current_step_index: currentStepIndex,
        });

        // Log skip
        auditLogger.log({
          event: 'GUIDE_SKIPPED',
          userId: userId,
          userName: currentSession?.user?.email || 'Unknown',
          userRole: currentSession?.role || 'serveur',
          description: `Skipped guide: ${activeTour.id} at step ${currentStepIndex + 1}`,
          metadata: {
            tour_id: activeTour.id,
            step_index: currentStepIndex,
          },
        });
      }

      console.log('[GuideContext.skipTour] Closing tour');
      closeTour();
    } catch (err: any) {
      console.error('Failed to skip guide:', err);
    }
  }, [activeTour?.id, userId, currentStepIndex, currentSession?.user?.email, currentSession?.role]);

  /**
   * Rate tour (1-5 stars)
   */
  const rateTour = useCallback(
    async (rating: 1 | 2 | 3 | 4 | 5) => {
      if (!activeTour || !userId) return;

      try {
        // Save rating
        await supabase
          .from('guide_progress')
          .update({ helpful_rating: rating })
          .eq('user_id', userId)
          .eq('tour_id', activeTour.id);

        // Log rating
        auditLogger.log({
          event: 'GUIDE_RATED',
          userId: userId,
          userName: currentSession?.user?.email || 'Unknown',
          userRole: currentSession?.role || 'serveur',
          description: `Rated guide: ${activeTour.id} with ${rating} stars`,
          metadata: {
            tour_id: activeTour.id,
            rating,
          },
        });

        // Close after rating
        setTimeout(() => closeTour(), 500);
      } catch (err: any) {
        console.error('Failed to rate guide:', err);
      }
    },
    [activeTour?.id, userId, currentSession?.user?.email, currentSession?.role]
  );

  /**
   * Close tour modal
   */
  const closeTour = useCallback(() => {
    setIsVisible(false);
    setActiveTour(null);
    setCurrentStepIndex(0);
    setError(null);
  }, []);

  /**
   * Get current step
   */
  const getCurrentStep = useCallback((): GuideStep | null => {
    if (!activeTour) return null;
    return activeTour.steps[currentStepIndex] ?? null;
  }, [activeTour?.steps, currentStepIndex]);

  /**
   * Get progress percentage
   */
  const getProgressPercentage = useCallback((): number => {
    if (!activeTour) return 0;
    return ((currentStepIndex + 1) / activeTour.steps.length) * 100;
  }, [activeTour?.steps?.length, currentStepIndex]);

  /**
   * Check if guide was completed
   */
  const hasCompletedGuide = useCallback(
    (tourId: string): boolean => {
      return completedGuides.has(tourId);
    },
    [completedGuides]
  );

  /**
   * Context value
   */
  const value: GuideContextType = {
    activeTour,
    currentStepIndex,
    isVisible,
    isLoading,
    error,
    suggestedTours,
    startTour,
    nextStep,
    prevStep,
    completeTour,
    skipTour,
    rateTour,
    closeTour,
    getCurrentStep,
    getProgressPercentage,
    hasCompletedGuide,
  };

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
};

/**
 * Hook to use guide context
 */
export const useGuide = (): GuideContextType => {
  const context = useContext(GuideContext);
  if (!context) {
    throw new Error('useGuide must be used within GuideProvider');
  }
  return context;
};
