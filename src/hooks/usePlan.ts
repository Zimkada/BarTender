// usePlan.ts — Hook pour accéder au plan du bar courant et vérifier les limites
// Expose : plan, canAddMember, hasFeature, memberLimitMessage

import { useMemo } from 'react';
import { useBarContext } from '../context/BarContext';
import { getPlan, hasFeature as checkFeature, isMemberLimitReached, type PlanDefinition, type FeatureKey } from '../config/plans';

export function usePlan() {
  const { currentBar, barMembers } = useBarContext();

  const plan: PlanDefinition = useMemo(() => {
    return getPlan(currentBar?.settings?.plan);
  }, [currentBar?.settings?.plan]);

  const activeMemberCount = useMemo(() => {
    if (!Array.isArray(barMembers)) return 0;
    return barMembers.filter(m => m.isActive !== false).length;
  }, [barMembers]);

  const canAddMember = useMemo(() => {
    return !isMemberLimitReached(plan.id, activeMemberCount);
  }, [plan.id, activeMemberCount]);

  const memberLimitMessage = useMemo(() => {
    if (canAddMember) return null;
    return `Limite atteinte : ${plan.maxMembers} membre${plan.maxMembers > 1 ? 's' : ''} max (plan ${plan.label}). Contactez l'administrateur pour passer au plan supérieur.`;
  }, [canAddMember, plan.maxMembers, plan.label]);

  const hasFeature = useMemo(() => {
    return (feature: FeatureKey) => checkFeature(plan.id, feature);
  }, [plan.id]);

  return {
    plan,
    activeMemberCount,
    canAddMember,
    memberLimitMessage,
    hasFeature,
  };
}
