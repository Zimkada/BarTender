import { useState } from 'react';
import { Salary, BarMember } from '../types';
import { useDataStore } from './useDataStore';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';

export function useSalaries(barId: string) {
  const [salaries, setSalaries] = useDataStore<Salary[]>(`salaries_${barId}`, []);
  const [isLoading, setIsLoading] = useState(false);
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();

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

    // 2. Enqueue pour sync
    if (currentBar && currentSession) {
      import('../services/SyncQueue').then(({ syncQueue }) => {
        syncQueue.enqueue('ADD_SALARY', newSalary, currentBar.id, currentSession.userId);
      });
    }

    return newSalary;
  };

  // Supprimer un salaire
  const deleteSalary = (salaryId: string) => {
    setSalaries(salaries.filter(sal => sal.id !== salaryId));
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
    isLoading,
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
