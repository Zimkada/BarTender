import { describe, it, expect } from 'vitest';
import {
  getPlan,
  hasFeature,
  isMemberLimitReached,
  PLANS,
  PLAN_ORDER,
  FEATURE_LABELS,
  type PlanId,
  type FeatureKey,
} from './plans';

describe('plans.ts', () => {
  describe('getPlan', () => {
    it('returns starter for undefined', () => {
      expect(getPlan(undefined)).toEqual(PLANS.starter);
    });

    it('returns starter for unknown plan', () => {
      expect(getPlan('nonexistent')).toEqual(PLANS.starter);
    });

    it('returns starter for empty string', () => {
      expect(getPlan('')).toEqual(PLANS.starter);
    });

    it('returns correct plan for each valid PlanId', () => {
      expect(getPlan('starter')).toEqual(PLANS.starter);
      expect(getPlan('pro')).toEqual(PLANS.pro);
      expect(getPlan('enterprise')).toEqual(PLANS.enterprise);
    });
  });

  describe('hasFeature', () => {
    const features: FeatureKey[] = ['accounting', 'exports', 'promotions', 'forecasting'];

    it('starter has no features', () => {
      features.forEach(f => {
        expect(hasFeature('starter', f)).toBe(false);
      });
    });

    it('pro has accounting, exports, promotions but not forecasting', () => {
      expect(hasFeature('pro', 'accounting')).toBe(true);
      expect(hasFeature('pro', 'exports')).toBe(true);
      expect(hasFeature('pro', 'promotions')).toBe(true);
      expect(hasFeature('pro', 'forecasting')).toBe(false);
    });

    it('enterprise has all features', () => {
      features.forEach(f => {
        expect(hasFeature('enterprise', f)).toBe(true);
      });
    });

    it('undefined plan defaults to starter (no features)', () => {
      features.forEach(f => {
        expect(hasFeature(undefined, f)).toBe(false);
      });
    });
  });

  describe('isMemberLimitReached', () => {
    it('starter limit is 2', () => {
      expect(isMemberLimitReached('starter', 1)).toBe(false);
      expect(isMemberLimitReached('starter', 2)).toBe(true);
      expect(isMemberLimitReached('starter', 3)).toBe(true);
    });

    it('pro limit is 8', () => {
      expect(isMemberLimitReached('pro', 4)).toBe(false);
      expect(isMemberLimitReached('pro', 5)).toBe(false);
      expect(isMemberLimitReached('pro', 8)).toBe(true);
      expect(isMemberLimitReached('pro', 10)).toBe(true);
    });

    it('enterprise limit is 20', () => {
      expect(isMemberLimitReached('enterprise', 19)).toBe(false);
      expect(isMemberLimitReached('enterprise', 20)).toBe(true);
    });

    it('undefined plan defaults to starter limit (2)', () => {
      expect(isMemberLimitReached(undefined, 1)).toBe(false);
      expect(isMemberLimitReached(undefined, 2)).toBe(true);
    });
  });

  describe('PLAN_ORDER', () => {
    it('has correct order', () => {
      expect(PLAN_ORDER).toEqual(['starter', 'pro', 'enterprise']);
    });
  });

  describe('FEATURE_LABELS', () => {
    it('has labels for all features', () => {
      expect(FEATURE_LABELS.accounting).toBeDefined();
      expect(FEATURE_LABELS.exports).toBeDefined();
      expect(FEATURE_LABELS.promotions).toBeDefined();
      expect(FEATURE_LABELS.forecasting).toBeDefined();
    });
  });

  describe('plan definitions consistency', () => {
    it('each plan has correct dataTier mapping', () => {
      expect(PLANS.starter.dataTier).toBe('lite');
      expect(PLANS.pro.dataTier).toBe('balanced');
      expect(PLANS.enterprise.dataTier).toBe('enterprise');
    });

    it('maxMembers increases with plan tier', () => {
      expect(PLANS.starter.maxMembers).toBeLessThan(PLANS.pro.maxMembers);
      expect(PLANS.pro.maxMembers).toBeLessThan(PLANS.enterprise.maxMembers);
    });

    it('higher plans include all features of lower plans', () => {
      const starterFeatures = Object.entries(PLANS.starter.features)
        .filter(([, v]) => v).map(([k]) => k);
      const proFeatures = Object.entries(PLANS.pro.features)
        .filter(([, v]) => v).map(([k]) => k);
      const enterpriseFeatures = Object.entries(PLANS.enterprise.features)
        .filter(([, v]) => v).map(([k]) => k);

      // starter features are subset of pro
      starterFeatures.forEach(f => {
        expect(proFeatures).toContain(f);
      });

      // pro features are subset of enterprise
      proFeatures.forEach(f => {
        expect(enterpriseFeatures).toContain(f);
      });
    });
  });
});
