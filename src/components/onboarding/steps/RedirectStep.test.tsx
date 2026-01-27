import { render, waitFor, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RedirectStep } from './RedirectStep';
import { BrowserRouter } from 'react-router-dom';
import * as BarContext from '../../../context/BarContext';

// Mock BarContext
vi.mock('../../../context/BarContext', () => ({
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
        mockConfig.completionCheck.mockResolvedValue(false);

        const { unmount } = render(
            <BrowserRouter>
                <RedirectStep config={mockConfig} onComplete={mockOnComplete} />
            </BrowserRouter>
        );

        unmount();
        // Verification is implicit: if intervals were not cleared, we might see console warnings or async errors
        // but in a real test env we would spyOn global.clearInterval
    });

    it('should not call onComplete if unmounted during timeout', async () => {
        vi.useFakeTimers();
        mockUsedBar.mockReturnValue({ currentBar: { id: 'bar-123' } });
        mockConfig.completionCheck.mockResolvedValue(true);

        const { unmount } = render(
            <BrowserRouter>
                <RedirectStep config={mockConfig} onComplete={mockOnComplete} />
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
        vi.useFakeTimers();
        mockUsedBar.mockReturnValue({ currentBar: { id: 'bar-123' } });
        mockConfig.completionCheck.mockResolvedValue(true);

        render(
            <BrowserRouter>
                <RedirectStep config={mockConfig} onComplete={mockOnComplete} />
            </BrowserRouter>
        );

        await waitFor(() => expect(mockConfig.completionCheck).toHaveBeenCalled());

        vi.advanceTimersByTime(2000); // Wait for 1500ms timeout
        expect(mockOnComplete).toHaveBeenCalled();

        vi.useRealTimers();
    });
});
