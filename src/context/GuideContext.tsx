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
    async (tourId: string) => {
      if (!activeTour || activeTour.id !== tourId) {
        // In production, would load from guides registry
        // For now, we'll set it up in components
        setIsVisible(true);
        setCurrentStepIndex(0);
        setError(null);

        // Log analytics
        if (userId) {
          await auditLogger.log('GUIDE_STARTED', {
            tour_id: tourId,
            user_role: currentSession?.role,
            timestamp: new Date().toISOString(),
          });
        }
      }
    },
    [activeTour, userId, currentSession?.role]
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
        auditLogger.log('GUIDE_STEP_VIEWED', {
          tour_id: activeTour.id,
          step_index: newIndex,
        });
      }
    }
  }, [activeTour, currentStepIndex, userId]);

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
    if (!activeTour || !userId) return;

    try {
      setIsLoading(true);

      // Save completion to Supabase
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
      await auditLogger.log('GUIDE_COMPLETED', {
        tour_id: activeTour.id,
        user_role: currentSession?.role,
        steps_count: activeTour.steps.length,
      });

      // Close modal
      closeTour();
    } catch (err: any) {
      console.error('Failed to complete guide:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [activeTour, userId, currentSession?.role]);

  /**
   * Skip tour
   */
  const skipTour = useCallback(async () => {
    if (!activeTour || !userId) return;

    try {
      // Save skip to Supabase
      await supabase.from('guide_progress').upsert({
        user_id: userId,
        tour_id: activeTour.id,
        skipped_at: new Date().toISOString(),
        current_step_index: currentStepIndex,
      });

      // Log skip
      await auditLogger.log('GUIDE_SKIPPED', {
        tour_id: activeTour.id,
        step_index: currentStepIndex,
      });

      closeTour();
    } catch (err: any) {
      console.error('Failed to skip guide:', err);
    }
  }, [activeTour, userId, currentStepIndex]);

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
        await auditLogger.log('GUIDE_RATED', {
          tour_id: activeTour.id,
          rating,
        });

        // Close after rating
        setTimeout(() => closeTour(), 500);
      } catch (err: any) {
        console.error('Failed to rate guide:', err);
      }
    },
    [activeTour, userId]
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
  }, [activeTour, currentStepIndex]);

  /**
   * Get progress percentage
   */
  const getProgressPercentage = useCallback((): number => {
    if (!activeTour) return 0;
    return ((currentStepIndex + 1) / activeTour.steps.length) * 100;
  }, [activeTour, currentStepIndex]);

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
