import { describe, it, expect } from 'vitest';

describe('Simple Test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should validate string', () => {
    expect('hello').toBe('hello');
  });
});
