import { useState } from 'react';
import { Salary, BarMember } from '../types';
import { useLocalStorage } from './useLocalStorage';

export function useSalaries(barId: string) {
  const [salaries, setSalaries] = useLocalStorage<Salary[]>(`salaries_${barId}`, []);
  const [isLoading, setIsLoading] = useState(false);

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
      id: `sal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    setSalaries([...salaries, newSalary]);
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
