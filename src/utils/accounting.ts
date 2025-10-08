// Utilitaires comptabilité

// Obtenir le début et fin de semaine calendaire (Lun-Dim)
export function getWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const current = new Date(date);
  const day = current.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Lundi = 0

  const start = new Date(current);
  start.setDate(current.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// Obtenir le début et fin de mois
export function getMonthRange(date: Date = new Date()): { start: Date; end: Date } {
  const current = new Date(date);
  const start = new Date(current.getFullYear(), current.getMonth(), 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// Format période pour affichage
export function formatPeriod(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

// Obtenir le yearMonth actuel
export function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
