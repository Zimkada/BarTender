import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateBusinessDate,
  dateToYYYYMMDD,
  getBusinessDate,
  filterByBusinessDateRange,
  getCurrentBusinessDateString,
} from './businessDateHelpers';

describe('calculateBusinessDate — aligned with SQL trigger', () => {
  it("returns same day when hour is well after closeHour (e.g. 23h, closeHour=6)", () => {
    // 04/10/2025 à 23h → journée commerciale = 04/10/2025
    const date = new Date(2025, 9, 4, 23, 0, 0);
    const result = calculateBusinessDate(date, 6);
    expect(result.getDate()).toBe(4);
    expect(result.getMonth()).toBe(9);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it("returns previous day when hour is before closeHour (e.g. 02h, closeHour=6)", () => {
    // 05/10/2025 à 02h → journée commerciale = 04/10/2025
    const date = new Date(2025, 9, 5, 2, 0, 0);
    const result = calculateBusinessDate(date, 6);
    expect(result.getDate()).toBe(4);
    expect(result.getMonth()).toBe(9);
  });

  it("returns same day at exact closeHour (e.g. 06h pile, closeHour=6)", () => {
    // 05/10/2025 à 06h pile → journée commerciale = 05/10/2025 (nouvelle journée)
    const date = new Date(2025, 9, 5, 6, 0, 0);
    const result = calculateBusinessDate(date, 6);
    expect(result.getDate()).toBe(5);
  });

  it("returns previous day at midnight (e.g. 00h, closeHour=6)", () => {
    const date = new Date(2025, 9, 5, 0, 0, 0);
    const result = calculateBusinessDate(date, 6);
    expect(result.getDate()).toBe(4);
  });

  it("works with closeHour=0 (strict civil day)", () => {
    // À closeHour=0, aucune date n'est jamais "avant" la clôture
    const date = new Date(2025, 9, 5, 2, 0, 0);
    const result = calculateBusinessDate(date, 0);
    expect(result.getDate()).toBe(5);
  });

  it("handles month boundary correctly", () => {
    // 01/11/2025 à 03h, closeHour=6 → 31/10/2025
    const date = new Date(2025, 10, 1, 3, 0, 0);
    const result = calculateBusinessDate(date, 6);
    expect(result.getDate()).toBe(31);
    expect(result.getMonth()).toBe(9); // Octobre
  });

  it("handles year boundary correctly", () => {
    // 01/01/2026 à 03h, closeHour=6 → 31/12/2025
    const date = new Date(2026, 0, 1, 3, 0, 0);
    const result = calculateBusinessDate(date, 6);
    expect(result.getDate()).toBe(31);
    expect(result.getMonth()).toBe(11);
    expect(result.getFullYear()).toBe(2025);
  });

  it("normalizes time to 00:00:00.000", () => {
    const date = new Date(2025, 9, 5, 14, 37, 42, 123);
    const result = calculateBusinessDate(date, 6);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe('dateToYYYYMMDD', () => {
  it("formats local date as YYYY-MM-DD with zero-padding", () => {
    expect(dateToYYYYMMDD(new Date(2025, 0, 5))).toBe('2025-01-05');
    expect(dateToYYYYMMDD(new Date(2025, 11, 31))).toBe('2025-12-31');
    expect(dateToYYYYMMDD(new Date(2026, 4, 20))).toBe('2026-05-20');
  });

  it("uses local time (not UTC)", () => {
    // Crée une date locale — le résultat reflète l'heure locale, pas l'UTC
    const localDate = new Date(2025, 9, 4, 23, 0, 0);
    expect(dateToYYYYMMDD(localDate)).toBe('2025-10-04');
  });
});

describe('getBusinessDate', () => {
  it("returns existing businessDate when present (YYYY-MM-DD string)", () => {
    expect(getBusinessDate({ businessDate: '2025-10-04' })).toBe('2025-10-04');
  });

  it("returns existing business_date (snake_case) when present", () => {
    expect(getBusinessDate({ business_date: '2025-10-04' })).toBe('2025-10-04');
  });

  it("falls back to calculation from createdAt when businessDate missing", () => {
    // 05/10/2025 à 02h, closeHour=6 → business_date = 04/10/2025
    const result = getBusinessDate(
      { createdAt: new Date(2025, 9, 5, 2, 0, 0) },
      6
    );
    expect(result).toBe('2025-10-04');
  });

  it("prefers validatedAt over createdAt for fallback calculation", () => {
    const result = getBusinessDate(
      {
        createdAt: new Date(2025, 9, 1, 12, 0, 0),
        validatedAt: new Date(2025, 9, 5, 2, 0, 0),
      },
      6
    );
    // validatedAt at 02h → previous day
    expect(result).toBe('2025-10-04');
  });

  it("throws when no usable date is present", () => {
    expect(() => getBusinessDate({})).toThrow();
  });
});

describe('filterByBusinessDateRange', () => {
  const items = [
    { id: 'a', businessDate: '2025-10-01' },
    { id: 'b', businessDate: '2025-10-05' },
    { id: 'c', businessDate: '2025-10-10' },
    { id: 'd', businessDate: '2025-10-15' },
  ];

  it("filters items inclusively on both bounds", () => {
    const result = filterByBusinessDateRange(items, '2025-10-05', '2025-10-10');
    expect(result.map(i => i.id)).toEqual(['b', 'c']);
  });

  it("includes items on the exact start date", () => {
    const result = filterByBusinessDateRange(items, '2025-10-01', '2025-10-01');
    expect(result.map(i => i.id)).toEqual(['a']);
  });

  it("returns empty array when no item matches", () => {
    const result = filterByBusinessDateRange(items, '2025-11-01', '2025-11-30');
    expect(result).toEqual([]);
  });
});

describe('getCurrentBusinessDateString', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current calendar day after closeHour", () => {
    vi.setSystemTime(new Date(2026, 4, 20, 14, 0, 0));
    expect(getCurrentBusinessDateString(6)).toBe('2026-05-20');
  });

  it("returns previous calendar day before closeHour", () => {
    vi.setSystemTime(new Date(2026, 4, 21, 3, 0, 0));
    expect(getCurrentBusinessDateString(6)).toBe('2026-05-20');
  });

  it("at exact closeHour, switches to the new calendar day", () => {
    vi.setSystemTime(new Date(2026, 4, 21, 6, 0, 0));
    expect(getCurrentBusinessDateString(6)).toBe('2026-05-21');
  });
});
