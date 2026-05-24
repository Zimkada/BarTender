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
    const nextPlan = plan.id === 'starter' ? 'Pro' : plan.id === 'pro' ? 'Max' : null;
    if (nextPlan) {
      return `Votre équipe grandit ! Pour ajouter une personne de plus, passez à la formule ${nextPlan}. Contactez votre administrateur.`;
    }
    return `Votre équipe a atteint ${plan.maxMembers} personnes. Pour étendre votre équipe au-delà, contactez-nous pour une formule sur mesure.`;
  }, [canAddMember, plan.maxMembers, plan.id]);

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
