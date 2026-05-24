import { describe, it, expect } from 'vitest';
import {
  getPlan,
  hasFeature,
  isMemberLimitReached,
  PLANS,
  PLAN_ORDER,
  FEATURE_LABELS,
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

    it('starter has all features (segmentation par équipe, pas par features)', () => {
      features.forEach(f => {
        expect(hasFeature('starter', f)).toBe(true);
      });
    });

    it('pro has all features', () => {
      features.forEach(f => {
        expect(hasFeature('pro', f)).toBe(true);
      });
    });

    it('enterprise has all features', () => {
      features.forEach(f => {
        expect(hasFeature('enterprise', f)).toBe(true);
      });
    });

    it('undefined plan defaults to starter (now has all features)', () => {
      features.forEach(f => {
        expect(hasFeature(undefined, f)).toBe(true);
      });
    });
  });

  describe('isMemberLimitReached', () => {
    it('starter limit is 3 (promoteur + gérant + 1 serveur)', () => {
      expect(isMemberLimitReached('starter', 2)).toBe(false);
      expect(isMemberLimitReached('starter', 3)).toBe(true);
      expect(isMemberLimitReached('starter', 4)).toBe(true);
    });

    it('pro limit is 8', () => {
      expect(isMemberLimitReached('pro', 4)).toBe(false);
      expect(isMemberLimitReached('pro', 7)).toBe(false);
      expect(isMemberLimitReached('pro', 8)).toBe(true);
      expect(isMemberLimitReached('pro', 10)).toBe(true);
    });

    it('enterprise limit is 20', () => {
      expect(isMemberLimitReached('enterprise', 19)).toBe(false);
      expect(isMemberLimitReached('enterprise', 20)).toBe(true);
    });

    it('undefined plan defaults to starter limit (3)', () => {
      expect(isMemberLimitReached(undefined, 2)).toBe(false);
      expect(isMemberLimitReached(undefined, 3)).toBe(true);
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
    it('all plans share the same dataTier (balanced)', () => {
      expect(PLANS.starter.dataTier).toBe('balanced');
      expect(PLANS.pro.dataTier).toBe('balanced');
      expect(PLANS.enterprise.dataTier).toBe('balanced');
    });

    it('maxMembers increases with plan tier', () => {
      expect(PLANS.starter.maxMembers).toBeLessThan(PLANS.pro.maxMembers);
      expect(PLANS.pro.maxMembers).toBeLessThan(PLANS.enterprise.maxMembers);
    });

    it('all plans expose the same features (segmentation par taille d\'équipe)', () => {
      const starterFeatures = JSON.stringify(PLANS.starter.features);
      const proFeatures = JSON.stringify(PLANS.pro.features);
      const enterpriseFeatures = JSON.stringify(PLANS.enterprise.features);

      expect(proFeatures).toEqual(starterFeatures);
      expect(enterpriseFeatures).toEqual(starterFeatures);
    });

    it('enterprise label is "Max" (renommage marketing)', () => {
      expect(PLANS.enterprise.label).toBe('Max');
    });
  });
});
