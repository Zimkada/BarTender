import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { DEFAULT_THEME_CONFIG, THEME_PRESETS } from '../types/theme';
import * as BarContext from './BarContext';
import * as AuthContext from './AuthContext';
import { ThemeService } from '../services/theme.service';

// Mocks
vi.mock('./BarContext');
vi.mock('./AuthContext');
vi.mock('../services/theme.service');

// Wrapper utile pour les tests
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
);

describe('ThemeContext', () => {
    const updateBarMock = vi.fn();
    const updateThemeServiceMock = vi.spyOn(ThemeService, 'updateBarTheme');

    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.style.cssText = ''; // Reset CSS

        // Default mocks
        (BarContext.useBarContext as any).mockReturnValue({
            currentBar: { id: 'bar-123', theme_config: null },
            updateBar: updateBarMock,
        });

        (AuthContext.useAuth as any).mockReturnValue({
            currentSession: { role: 'promoteur' },
        });
    });

    it('should use default theme when theme_config is null', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });

        expect(result.current.themeConfig.preset).toBe('amber');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(THEME_PRESETS.amber.primary);
    });

    it('should fall back to default theme when theme_config is invalid JSON', () => {
        (BarContext.useBarContext as any).mockReturnValue({
            currentBar: { id: 'bar-123', theme_config: '{invalid-json' }, // Malformed
        });

        const { result } = renderHook(() => useTheme(), { wrapper });

        expect(result.current.themeConfig).toEqual(DEFAULT_THEME_CONFIG);
    });

    it('should apply theme from DB when valid', () => {
        const validConfig = JSON.stringify({ preset: 'blue' });
        (BarContext.useBarContext as any).mockReturnValue({
            currentBar: { id: 'bar-123', theme_config: validConfig },
        });

        const { result } = renderHook(() => useTheme(), { wrapper });

        expect(result.current.themeConfig.preset).toBe('blue');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(THEME_PRESETS.blue.primary);
    });

    it('SuperAdmin should ALWAYS see Indigo theme regardless of bar config', () => {
        // Setup: Bar is configured as 'rose', but User is SuperAdmin
        (BarContext.useBarContext as any).mockReturnValue({
            currentBar: { id: 'bar-123', theme_config: JSON.stringify({ preset: 'rose' }) },
        });
        (AuthContext.useAuth as any).mockReturnValue({
            currentSession: { role: 'super_admin' },
        });

        const { result } = renderHook(() => useTheme(), { wrapper });

        // Logical config might reflect bar state (debatable, but CSS must be Indigo)
        // Here we check critical CSS injection
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#6366f1'); // Indigo
    });

    it('preview function should update CSS instantly without saving', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });

        act(() => {
            result.current.previewTheme({ preset: 'emerald' });
        });

        expect(result.current.isPreviewMode).toBe(true);
        expect(result.current.themeConfig.preset).toBe('emerald');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(THEME_PRESETS.emerald.primary);

        // Verify NOT saved yet
        expect(updateThemeServiceMock).not.toHaveBeenCalled();
    });

    it('resetPreview should revert to original theme', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });

        act(() => {
            result.current.previewTheme({ preset: 'blue' });
        });
        expect(result.current.themeConfig.preset).toBe('blue');

        act(() => {
            result.current.resetPreview();
        });

        expect(result.current.isPreviewMode).toBe(false);
        expect(result.current.themeConfig.preset).toBe('amber'); // Back to default
    });

    it('updateTheme should call service and persist changes', async () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        const newConfig = { preset: 'purple' as const };

        await act(async () => {
            await result.current.updateTheme(newConfig);
        });

        expect(updateThemeServiceMock).toHaveBeenCalledWith('bar-123', newConfig);
        expect(result.current.isPreviewMode).toBe(false); // Should exit preview
    });
});
