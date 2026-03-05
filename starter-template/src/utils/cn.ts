/**
 * cn() — Fusion de classes Tailwind
 *
 * Combine clsx (logique conditionnelle) + tailwind-merge (déduplication Tailwind).
 *
 * Usage :
 *   cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6') → 'py-2 bg-blue-500 px-6'
 *
 * Dépendances : `npm install clsx tailwind-merge`
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
