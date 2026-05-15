import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * ColorMode = dimension light/dark/system, indépendante du theme (brand) per-bar.
 *
 * - 'system' : suit la préférence OS via matchMedia('(prefers-color-scheme: dark)')
 * - 'light'  : mode clair forcé (override OS)
 * - 'dark'   : mode sombre forcé (override OS)
 *
 * Persistance : localStorage 'bartender_color_mode' (par device, pas par bar).
 * Anti-FOUC : un script inline dans index.html applique la classe AVANT React monte.
 */
export type ColorMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'bartender_color_mode';

interface ColorModeContextValue {
  /** Préférence brute (system/light/dark) */
  colorMode: ColorMode;
  /** Mode effectif appliqué (light ou dark) après résolution de 'system' */
  resolvedMode: 'light' | 'dark';
  /** Modifie la préférence et persiste */
  setColorMode: (mode: ColorMode) => void;
}

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

/** Lit la préférence stockée (sans throw si localStorage indispo) */
function readStoredMode(): ColorMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage peut throw (mode privé, quota)
  }
  return 'system';
}

/** Résout 'system' vers light ou dark selon matchMedia */
function resolveMode(mode: ColorMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applique la classe .dark sur <html> */
function applyClass(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => readStoredMode());
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() => resolveMode(readStoredMode()));

  // Synchronise la classe DOM + le mode résolu quand la préférence change
  useEffect(() => {
    const resolved = resolveMode(colorMode);
    setResolvedMode(resolved);
    applyClass(resolved);
  }, [colorMode]);

  // Écoute les changements OS uniquement si mode = 'system'
  useEffect(() => {
    if (colorMode !== 'system') return;
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const resolved: 'light' | 'dark' = e.matches ? 'dark' : 'light';
      setResolvedMode(resolved);
      applyClass(resolved);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [colorMode]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ColorModeContext.Provider value={{ colorMode, resolvedMode, setColorMode }}>
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) {
    throw new Error('useColorMode must be used within a ColorModeProvider');
  }
  return ctx;
}
