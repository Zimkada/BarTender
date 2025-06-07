import { useState, useCallback } from 'react';

// Hook pour forcer les re-renders quand localStorage change
export const useForceUpdate = () => {
  const [, setTick] = useState(0);
  
  const forceUpdate = useCallback(() => {
    setTick(tick => tick + 1);
  }, []);
  
  return forceUpdate;
};