import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateDateRange, getCurrentBusinessDateString } from './dateRangeCalculator';

function daysBetweenInclusive(start: Date, end: Date): number {
  const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
}

describe('calculateDateRange — rolling ranges (Fix #1 off-by-one)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mardi 20 mai 2026, 14h00 locale — bien après closeHour=6, donc business_date = 2026-05-20
    vi.setSystemTime(new Date(2026, 4, 20, 14, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("last_7days returns exactly 7 days inclusive (J-6 to J)", () => {
    const { startDate, endDate } = calculateDateRange('last_7days', undefined, { closeHour: 6 });

    expect(daysBetweenInclusive(startDate, endDate)).toBe(7);
    expect(endDate.getFullYear()).toBe(2026);
    expect(endDate.getMonth()).toBe(4);
    expect(endDate.getDate()).toBe(20);
    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(4);
    expect(startDate.getDate()).toBe(14); // 20 - 6 = 14
  });

  it("last_30days returns exactly 30 days inclusive", () => {
    const { startDate, endDate } = calculateDateRange('last_30days', undefined, { closeHour: 6 });

    expect(daysBetweenInclusive(startDate, endDate)).toBe(30);
    expect(endDate.getDate()).toBe(20);
    expect(endDate.getMonth()).toBe(4);
    // 20 mai - 29 jours = 21 avril
    expect(startDate.getDate()).toBe(21);
    expect(startDate.getMonth()).toBe(3);
  });

  it("last_90days returns exactly 90 days inclusive", () => {
    const { startDate, endDate } = calculateDateRange('last_90days', undefined, { closeHour: 6 });
    expect(daysBetweenInclusive(startDate, endDate)).toBe(90);
  });

  it("last_365days returns exactly 365 days inclusive", () => {
    const { startDate, endDate } = calculateDateRange('last_365days', undefined, { closeHour: 6 });
    expect(daysBetweenInclusive(startDate, endDate)).toBe(365);
  });

  it("today returns a single day (J)", () => {
    const { startDate, endDate } = calculateDateRange('today', undefined, { closeHour: 6 });
    expect(daysBetweenInclusive(startDate, endDate)).toBe(1);
    expect(startDate.getDate()).toBe(20);
    expect(endDate.getDate()).toBe(20);
  });

  it("yesterday returns a single day (J-1)", () => {
    const { startDate, endDate } = calculateDateRange('yesterday', undefined, { closeHour: 6 });
    expect(daysBetweenInclusive(startDate, endDate)).toBe(1);
    expect(startDate.getDate()).toBe(19);
    expect(endDate.getDate()).toBe(19);
  });

  it("startDate is at 00:00:00 and endDate at 23:59:59 (boundary normalization)", () => {
    const { startDate, endDate } = calculateDateRange('last_7days', undefined, { closeHour: 6 });
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
  });
});

describe('calculateDateRange — business day awareness (closeHour)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("before closeHour, today still resolves to previous calendar day", () => {
    // 21 mai 2026, 03h00 locale, closeHour=6 → business_date = 2026-05-20
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 21, 3, 0, 0));

    expect(getCurrentBusinessDateString(6)).toBe('2026-05-20');

    const { startDate, endDate } = calculateDateRange('today', undefined, { closeHour: 6 });
    expect(startDate.getDate()).toBe(20);
    expect(endDate.getDate()).toBe(20);
  });

  it("at exact closeHour, today resolves to new calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 21, 6, 0, 0));

    expect(getCurrentBusinessDateString(6)).toBe('2026-05-21');
  });
});

describe('calculateDateRange — custom range timezone safety', () => {
  it("custom range parses YYYY-MM-DD in local time (not UTC)", () => {
    const { startDate, endDate } = calculateDateRange(
      'custom',
      { start: '2026-05-01', end: '2026-05-10' },
      { closeHour: 6 }
    );
    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(4);
    expect(startDate.getDate()).toBe(1);
    expect(endDate.getDate()).toBe(10);
    expect(daysBetweenInclusive(startDate, endDate)).toBe(10);
  });
});
