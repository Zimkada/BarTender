import { useEffect } from 'react';
import { Salary, BarMember } from '../types';
import { useDataStore } from './useDataStore';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../utils/errorHandler';
import type { AddSalaryPayload } from '../types/sync';

export function useSalaries(barId: string) {
  const [salaries, setSalaries] = useDataStore<Salary[]>(`salaries_${barId}`, []);
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();

  // Hydration depuis la DB au montage (ou changement de bar)
  // Merge : DB = source de vérité pour les salaires synchronisés
  // Les salaires locaux (sal_xxx) non encore synchronisés sont préservés
  useEffect(() => {
    if (!barId) return;

    supabase
      .from('salaries')
      .select('id, bar_id, member_id, amount, period, paid_at, created_by, created_at')
      .eq('bar_id', barId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;

        const dbSalaries: Salary[] = data.map(row => ({
          id: row.id,
          barId: row.bar_id,
          memberId: row.member_id,
          amount: row.amount,
          period: row.period,
          paidAt: new Date(row.paid_at),
          createdBy: row.created_by,
          createdAt: new Date(row.created_at),
        }));

        setSalaries(prev => {
          // Conserver uniquement les salaires locaux non encore synchronisés
          const localOnly = prev.filter(s =>
            s.id.startsWith('sal_') &&
            !dbSalaries.some(db => db.memberId === s.memberId && db.period === s.period)
          );
          return [...dbSalaries, ...localOnly];
        });
      });
  }, [barId]);

  // Ajouter un salaire
  const addSalary = (salary: Omit<Salary, 'id' | 'createdAt'>) => {
    // Vérifier si un salaire existe déjà pour ce membre et cette période
    const existing = salaries.find(
      s => s.memberId === salary.memberId && s.period === salary.period
    );

    if (existing) {
      throw new Error('Un salaire a déjà été enregistré pour ce membre et cette période');
    }

    const newSalary: Salary = {
      ...salary,
      id: `sal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date(),
    };

    // 1. Optimistic update
    setSalaries([...salaries, newSalary]);

    // 2. Enqueue pour sync (System A - Modern)
    if (currentBar && currentSession) {
      import('../services/offlineQueue').then(({ offlineQueue }) => {
        // ✅ Mapping type-safe : Frontend (camelCase) -> DB (snake_case)
        const payload: AddSalaryPayload = {
          bar_id: currentBar.id,
          member_id: newSalary.memberId,
          amount: newSalary.amount,
          period: newSalary.period,
          paid_at: newSalary.paidAt.toISOString(),
          created_by: currentSession.userId,
          created_at: newSalary.createdAt.toISOString(),
        };

        offlineQueue.addOperation('ADD_SALARY', payload, currentBar.id, currentSession.userId);
      });
    }

    return newSalary;
  };

  // Supprimer un salaire
  // Stratégie : delete par (bar_id, member_id, period) — seule clé disponible
  // sans UUID Supabase (les IDs locaux sal_xxx ne sont pas des UUIDs DB).
  // Edge case : si le salaire n'a pas encore été synchronisé (ADD_SALARY en queue),
  // ce DELETE ne trouvera aucune ligne — l'opération ADD_SALARY persistera ensuite.
  // Ce cas est rare (delete immédiat après add offline) et acceptable.
  const deleteSalary = async (salaryId: string) => {
    const salary = salaries.find(s => s.id === salaryId);

    // 1. Suppression locale immédiate (optimistic)
    setSalaries(salaries.filter(sal => sal.id !== salaryId));

    // 2. Persistance en DB avec rollback sur erreur
    if (salary && currentBar) {
      const { error } = await supabase
        .from('salaries')
        .delete()
        .eq('bar_id', currentBar.id)
        .eq('member_id', salary.memberId)
        .eq('period', salary.period);

      if (error) {
        // Rollback : restaurer le salaire supprimé localement
        setSalaries(prev => [...prev, salary]);
        throw new Error(getErrorMessage(error));
      }
    }
  };

  // Obtenir les salaires d'un membre
  const getMemberSalaries = (memberId: string) => {
    return salaries
      .filter(sal => sal.memberId === memberId)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  };

  // Obtenir le salaire d'un membre pour une période
  const getSalaryForPeriod = (memberId: string, period: string) => {
    return salaries.find(sal => sal.memberId === memberId && sal.period === period);
  };

  // Calculer le total des salaires pour une période (mois)
  const getTotalSalariesForMonth = (yearMonth: string) => {
    return salaries
      .filter(sal => sal.period === yearMonth)
      .reduce((sum, sal) => sum + sal.amount, 0);
  };

  // Calculer le total des salaires entre deux dates
  const getTotalSalaries = (startDate: Date, endDate: Date) => {
    return salaries
      .filter(sal => {
        const salDate = new Date(sal.paidAt);
        return salDate >= startDate && salDate <= endDate;
      })
      .reduce((sum, sal) => sum + sal.amount, 0);
  };

  // Obtenir les salaires par période
  const getSalariesByPeriod = () => {
    const byPeriod: Record<string, { amount: number; count: number; salaries: Salary[] }> = {};

    salaries.forEach(sal => {
      if (!byPeriod[sal.period]) {
        byPeriod[sal.period] = {
          amount: 0,
          count: 0,
          salaries: [],
        };
      }

      byPeriod[sal.period].amount += sal.amount;
      byPeriod[sal.period].count += 1;
      byPeriod[sal.period].salaries.push(sal);
    });

    return byPeriod;
  };

  // Obtenir les membres non payés pour une période
  const getUnpaidMembers = (members: BarMember[], period: string) => {
    return members.filter(member => {
      const salary = getSalaryForPeriod(member.id, period);
      return !salary && member.isActive;
    });
  };

  return {
    salaries,
    addSalary,
    deleteSalary,
    getMemberSalaries,
    getSalaryForPeriod,
    getTotalSalariesForMonth,
    getTotalSalaries,
    getSalariesByPeriod,
    getUnpaidMembers,
  };
}
