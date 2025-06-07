import { useLocalStorage } from './useLocalStorage';
import { Category } from '../types';

const defaultCategories: Category[] = [
  {
    id: '1',
    name: 'Bières',
    color: '#f59e0b',
    createdAt: new Date(),
  },
  {
    id: '2',
    name: 'Sucreries',
    color: '#ef4444',
    createdAt: new Date(),
  },
  {
    id: '3',
    name: 'Liqueurs',
    color: '#8b5cf6',
    createdAt: new Date(),
  },
  {
    id: '4',
    name: 'Vins',
    color: '#dc2626',
    createdAt: new Date(),
  },
];

export function useCategories() {
  const [categories, setCategories] = useLocalStorage<Category[]>('bar-categories', defaultCategories);

  const addCategory = (category: Omit<Category, 'id' | 'createdAt'>) => {
    const newCategory: Category = {
      ...category,
      id: Date.now().toString(),
      createdAt: new Date(),
    };
    setCategories([...categories, newCategory]);
    return newCategory;
  };

  const updateCategory = (id: string, updates: Partial<Category>) => {
    setCategories(categories.map(cat => 
      cat.id === id ? { ...cat, ...updates } : cat
    ));
  };

  const deleteCategory = (id: string) => {
    setCategories(categories.filter(cat => cat.id !== id));
  };

  return {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
  };
}