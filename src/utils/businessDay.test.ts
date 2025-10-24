import { getBusinessDay, getCurrentBusinessDay, isSameDay } from './businessDay';

describe('businessDay utils', () => {
  describe('getBusinessDay', () => {
    it('should return same day if time is after close hour', () => {
      // 04/10 à 23h avec clôture à 6h → journée commerciale 04/10
      const date = new Date('2025-10-04T23:00:00');
      const closeHour = 6;
      const businessDay = getBusinessDay(date, closeHour);

      expect(businessDay.getDate()).toBe(4);
      expect(businessDay.getMonth()).toBe(9); // Octobre = 9 (0-indexed)
    });

    it('should return previous day if time is before close hour', () => {
      // 05/10 à 02h avec clôture à 6h → journée commerciale 04/10
      const date = new Date('2025-10-05T02:00:00');
      const closeHour = 6;
      const businessDay = getBusinessDay(date, closeHour);

      expect(businessDay.getDate()).toBe(4);
      expect(businessDay.getMonth()).toBe(9);
    });

    it('should handle exact close hour correctly', () => {
      // 05/10 à 06h pile avec clôture à 6h → journée commerciale 05/10 (nouvelle journée)
      const date = new Date('2025-10-05T06:00:00');
      const closeHour = 6;
      const businessDay = getBusinessDay(date, closeHour);

      expect(businessDay.getDate()).toBe(5);
    });

    it('should handle midnight correctly', () => {
      // 05/10 à 00h avec clôture à 6h → journée commerciale 04/10
      const date = new Date('2025-10-05T00:00:00');
      const closeHour = 6;
      const businessDay = getBusinessDay(date, closeHour);

      expect(businessDay.getDate()).toBe(4);
    });

    it('should work with different close hours', () => {
      // Test avec clôture à 4h
      const date = new Date('2025-10-05T03:00:00');
      const closeHour = 4;
      const businessDay = getBusinessDay(date, closeHour);

      expect(businessDay.getDate()).toBe(4);
    });
  });

  describe('getCurrentBusinessDay', () => {
    it('should return a valid date', () => {
      const closeHour = 6;
      const currentBusinessDay = getCurrentBusinessDay(closeHour);

      expect(currentBusinessDay).toBeInstanceOf(Date);
      expect(currentBusinessDay.getHours()).toBe(0);
      expect(currentBusinessDay.getMinutes()).toBe(0);
      expect(currentBusinessDay.getSeconds()).toBe(0);
    });
  });

  describe('isSameDay', () => {
    it('should return true for same day', () => {
      const date1 = new Date('2025-10-04T10:00:00');
      const date2 = new Date('2025-10-04T15:00:00');

      expect(isSameDay(date1, date2)).toBe(true);
    });

    it('should return false for different days', () => {
      const date1 = new Date('2025-10-04T10:00:00');
      const date2 = new Date('2025-10-05T10:00:00');

      expect(isSameDay(date1, date2)).toBe(false);
    });

    it('should return false for different months', () => {
      const date1 = new Date('2025-10-31T10:00:00');
      const date2 = new Date('2025-11-01T10:00:00');

      expect(isSameDay(date1, date2)).toBe(false);
    });

    it('should return false for different years', () => {
      const date1 = new Date('2025-12-31T23:59:59');
      const date2 = new Date('2026-01-01T00:00:00');

      expect(isSameDay(date1, date2)).toBe(false);
    });
  });
});
