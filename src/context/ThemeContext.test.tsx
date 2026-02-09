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

// Wrapper utile pour les tests
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
);

describe('ThemeContext', () => {
    const updateBarMock = vi.fn();
    const updateThemeServiceMock = vi.spyOn(ThemeService, 'updateBarTheme');
    const getColorsServiceMock = vi.spyOn(ThemeService, 'getColors');

    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.style.cssText = ''; // Reset CSS

        // Mock ThemeService.getColors to return colors based on preset
        getColorsServiceMock.mockImplementation((config) => {
            if (config.preset === 'custom' && config.customColors) {
                return config.customColors;
            }
            return THEME_PRESETS[config.preset] || THEME_PRESETS.amber;
        });

        // Mock ThemeService.updateBarTheme to avoid real database calls
        updateThemeServiceMock.mockResolvedValue(undefined);

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
        // Setup initial theme as 'blue'
        (BarContext.useBarContext as any).mockReturnValue({
            currentBar: { id: 'bar-123', theme_config: JSON.stringify({ preset: 'blue' }) },
            updateBar: updateBarMock,
        });

        const { result } = renderHook(() => useTheme(), { wrapper });

        // Verify initial state is 'blue'
        expect(result.current.themeConfig.preset).toBe('blue');

        // Preview a different theme
        act(() => {
            result.current.previewTheme({ preset: 'purple' });
        });
        expect(result.current.themeConfig.preset).toBe('purple');
        expect(result.current.isPreviewMode).toBe(true);

        // Reset preview should revert to original 'blue'
        act(() => {
            result.current.resetPreview();
        });

        expect(result.current.isPreviewMode).toBe(false);
        expect(result.current.themeConfig.preset).toBe('blue'); // Back to original
    });

    it('updateTheme should call service and persist changes', async () => {
        const mockUpdateBar = vi.fn().mockResolvedValue(undefined);

        (BarContext.useBarContext as any).mockReturnValue({
            currentBar: { id: 'bar-123', theme_config: null },
            updateBar: mockUpdateBar,
        });

        const { result } = renderHook(() => useTheme(), { wrapper });
        const newConfig = { preset: 'purple' as const };

        await act(async () => {
            await result.current.updateTheme(newConfig);
        });

        // Verify updateBar was called with the new theme config
        expect(mockUpdateBar).toHaveBeenCalledWith('bar-123', expect.objectContaining({
            theme_config: expect.any(Object)
        }));

        // Verify the call was with the correct preset
        const callArg = mockUpdateBar.mock.calls[0][1];
        expect(callArg.theme_config.preset).toBe('purple');
    });
});
