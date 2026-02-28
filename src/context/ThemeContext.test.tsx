import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { DEFAULT_THEME_CONFIG, THEME_PRESETS } from '../types/theme';
import * as AuthContext from './AuthContext';
import { ThemeService } from '../services/theme.service';

// BarContext.tsx exporte à la fois `useBarContext` et `BarContext` (le contexte React).
// ThemeContext.tsx appelle useContext(BarContext) directement (accès sécurisé sans throw).
// Le mock doit donc exporter un vrai contexte React pour que useContext fonctionne.
vi.mock('./BarContext', async () => {
    const { createContext } = await import('react');
    return {
        useBarContext: vi.fn(),
        BarContext: createContext<any>(null),
    };
});

vi.mock('./AuthContext', () => ({
    useAuth: vi.fn(),
}));

// Import du contexte mocké pour pouvoir passer des valeurs via Provider
import { BarContext as MockedBarContext } from './BarContext';

// Wrapper configurable qui injecte les valeurs de BarContext via Provider
const createWrapper = (barValue: any) =>
    ({ children }: { children: React.ReactNode }) => (
        <MockedBarContext.Provider value={barValue}>
            <ThemeProvider>{children}</ThemeProvider>
        </MockedBarContext.Provider>
    );

describe('ThemeContext', () => {
    const updateBarMock = vi.fn();
    const updateThemeServiceMock = vi.spyOn(ThemeService, 'updateBarTheme');
    const getColorsServiceMock = vi.spyOn(ThemeService, 'getColors');

    const defaultBarValue = {
        currentBar: { id: 'bar-123', theme_config: null },
        updateBar: updateBarMock,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.style.cssText = ''; // Reset CSS

        getColorsServiceMock.mockImplementation((config) => {
            if (config.preset === 'custom' && config.customColors) {
                return config.customColors;
            }
            return THEME_PRESETS[config.preset] || THEME_PRESETS.amber;
        });

        updateThemeServiceMock.mockResolvedValue(undefined);

        (AuthContext.useAuth as any).mockReturnValue({
            currentSession: { role: 'promoteur' },
        });
    });

    it('should use default theme when theme_config is null', () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper(defaultBarValue),
        });

        expect(result.current.themeConfig.preset).toBe('amber');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(THEME_PRESETS.amber.primary);
    });

    it('should fall back to default theme when theme_config is invalid JSON', () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper({ currentBar: { id: 'bar-123', theme_config: '{invalid-json' } }),
        });

        expect(result.current.themeConfig).toEqual(DEFAULT_THEME_CONFIG);
    });

    it('should apply theme from DB when valid', () => {
        const validConfig = JSON.stringify({ preset: 'blue' });
        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper({ currentBar: { id: 'bar-123', theme_config: validConfig } }),
        });

        expect(result.current.themeConfig.preset).toBe('blue');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(THEME_PRESETS.blue.primary);
    });

    it('SuperAdmin should ALWAYS see Indigo theme regardless of bar config', () => {
        (AuthContext.useAuth as any).mockReturnValue({
            currentSession: { role: 'super_admin' },
        });

        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper({
                currentBar: { id: 'bar-123', theme_config: JSON.stringify({ preset: 'rose' }) },
            }),
        });

        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#6366f1'); // Indigo
    });

    it('preview function should update CSS instantly without saving', () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper(defaultBarValue),
        });

        act(() => {
            result.current.previewTheme({ preset: 'emerald' });
        });

        expect(result.current.isPreviewMode).toBe(true);
        expect(result.current.themeConfig.preset).toBe('emerald');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(THEME_PRESETS.emerald.primary);

        expect(updateThemeServiceMock).not.toHaveBeenCalled();
    });

    it('resetPreview should revert to original theme', () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper({
                currentBar: { id: 'bar-123', theme_config: JSON.stringify({ preset: 'blue' }) },
                updateBar: updateBarMock,
            }),
        });

        expect(result.current.themeConfig.preset).toBe('blue');

        act(() => { result.current.previewTheme({ preset: 'purple' }); });
        expect(result.current.themeConfig.preset).toBe('purple');
        expect(result.current.isPreviewMode).toBe(true);

        act(() => { result.current.resetPreview(); });
        expect(result.current.isPreviewMode).toBe(false);
        expect(result.current.themeConfig.preset).toBe('blue');
    });

    it('updateTheme should call service and persist changes', async () => {
        const mockUpdateBar = vi.fn().mockResolvedValue(undefined);

        const { result } = renderHook(() => useTheme(), {
            wrapper: createWrapper({
                currentBar: { id: 'bar-123', theme_config: null },
                updateBar: mockUpdateBar,
            }),
        });

        await act(async () => {
            await result.current.updateTheme({ preset: 'purple' });
        });

        expect(mockUpdateBar).toHaveBeenCalledWith('bar-123', expect.objectContaining({
            theme_config: expect.any(Object),
        }));
        const callArg = mockUpdateBar.mock.calls[0][1];
        expect(callArg.theme_config.preset).toBe('purple');
    });
});
