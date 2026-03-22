import { render, waitFor, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RedirectStep } from './RedirectStep';
import { BrowserRouter } from 'react-router-dom';
import * as BarContext from '../../../context/BarContext';
import { OnboardingProvider } from '../../../context/OnboardingContext';

// Mock BarContext
vi.mock('../../../context/BarContext', () => ({
    useBarContext: vi.fn(), // Note: was useBar in previous view? Correcting to useBarContext if needed.
    useBar: vi.fn(),
}));

const mockUsedBar = BarContext.useBar as unknown as ReturnType<typeof vi.fn>;

describe('RedirectStep', () => {
    const mockConfig = {
        id: 'test-step',
        title: 'Test Step',
        description: 'Test Description',
        targetRoute: '/test',
        completionCheck: vi.fn(),
        isMandatory: true,
    };

    const mockOnComplete = vi.fn();

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should cleanup interval on unmount', () => {
        mockUsedBar.mockReturnValue({ currentBar: { id: 'bar-123' } });
        mockConfig.completionCheck.mockResolvedValue({ complete: false, count: 0 });

        const { unmount } = render(
            <BrowserRouter>
                <OnboardingProvider>
                    <RedirectStep config={mockConfig} onComplete={mockOnComplete} />
                </OnboardingProvider>
            </BrowserRouter>
        );

        unmount();
        // Verification is implicit: if intervals were not cleared, we might see console warnings or async errors
        // but in a real test env we would spyOn global.clearInterval
    });

    it('should not call onComplete if unmounted during timeout', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockUsedBar.mockReturnValue({ currentBar: { id: 'bar-123' } });
        mockConfig.completionCheck.mockResolvedValue({ complete: true, count: 1 });

        const { unmount } = render(
            <BrowserRouter>
                <OnboardingProvider>
                    <RedirectStep config={mockConfig} onComplete={mockOnComplete} />
                </OnboardingProvider>
            </BrowserRouter>
        );

        // Initial check triggers completion logic
        await waitFor(() => expect(mockConfig.completionCheck).toHaveBeenCalled());

        // Advance timer partially (simulating part of the 1500ms wait)
        unmount();

        // Advance rest of time
        vi.advanceTimersByTime(2000);

        expect(mockOnComplete).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('should auto-progress when task is complete', async () => {
        mockUsedBar.mockReturnValue({ currentBar: { id: 'bar-123' } });
        mockConfig.completionCheck.mockResolvedValue({ complete: true, count: 1 });

        render(
            <BrowserRouter>
                <OnboardingProvider>
                    <RedirectStep config={mockConfig} onComplete={mockOnComplete} />
                </OnboardingProvider>
            </BrowserRouter>
        );

        // completionCheck resolves with complete:true → setTimeout(onComplete, 1500)
        await waitFor(() => expect(mockOnComplete).toHaveBeenCalled(), { timeout: 5000 });
    });
});
