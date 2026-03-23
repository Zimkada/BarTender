/**
 * Network Quality Detection Utility
 *
 * Uses the Network Information API (navigator.connection) to detect
 * connection quality and adapt polling/fetching behavior.
 *
 * Designed for West African mobile networks where 2G/3G is common.
 */

type NetworkQuality = 'fast' | 'slow' | '2g';

interface NetworkConnection {
    effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
    downlink: number; // Mbps
    rtt: number; // ms
    saveData: boolean;
}

/**
 * Detect current network quality.
 * Falls back to 'fast' if Network Information API is not supported.
 */
export function getNetworkQuality(): NetworkQuality {
    const conn = (navigator as any).connection as NetworkConnection | undefined;
    if (!conn) return 'fast'; // API not supported — assume fast

    // User explicitly requested data saving
    if (conn.saveData) return '2g';

    // Classify by effectiveType (Chrome, Edge, Opera, Samsung Internet)
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return '2g';
    if (conn.effectiveType === '3g' || conn.downlink < 1) return 'slow';
    return 'fast';
}

/**
 * Adapt a polling interval based on network quality.
 *
 * - fast: use base interval as-is
 * - slow: multiply by 3 (reduce frequency)
 * - 2g: disable polling entirely (return false)
 *
 * @param base - Base polling interval in ms
 * @returns Adapted interval in ms, or false to disable polling
 */
export function getAdaptivePollingInterval(base: number): number | false {
    const quality = getNetworkQuality();
    if (quality === '2g') return false;
    if (quality === 'slow') return base * 3;
    return base;
}

/**
 * Check if the current network supports background polling.
 * On 2G or with saveData, background polling should be disabled.
 */
export function shouldEnablePolling(): boolean {
    return getNetworkQuality() !== '2g';
}
