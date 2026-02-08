/**
 * Utility for safe cryptographic operations
 */

/**
 * Generates a random UUID (v4) with a fallback if crypto.randomUUID is not available.
 * Useful for environments without secure context (HTTP) or older browsers.
 */
export const generateUUID = (): string => {
    // 1. Try native crypto.randomUUID (Preferred)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // 2. Fallback to older crypto.getRandomValues
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        return (([1e7] as any) + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: any) =>
            (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
        );
    }

    // 3. Last resort fallback (Math.random) - Not cryptographically secure but functional
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
