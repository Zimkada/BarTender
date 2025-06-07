import { useLocalStorage } from './useLocalStorage';
import { Product } from '../types';

const defaultProducts: Product[] = [
  {
    id: '1',
    name: 'Beaufort',
    volume: '33cl',
    price: 500,
    stock: 24,
    categoryId: '1',
    alertThreshold: 10,
    createdAt: new Date(),
  },
  {
    id: '2',
    name: 'Beaufort',
    volume: '50cl',
    price: 650,
    stock: 12,
    categoryId: '1',
    alertThreshold: 8,
    createdAt: new Date(),
  },
  {
    id: '3',
    name: 'Coca Cola',
    volume: '33cl',
    price: 300,
    stock: 48,
    categoryId: '2',
    alertThreshold: 15,
    createdAt: new Date(),
  },
  {
    id: '4',
    name: 'Castel',
    volume: '50cl',
    price: 600,
    stock: 18,
    categoryId: '1',
    alertThreshold: 10,
    createdAt: new Date(),
  },
  {
    id: '5',
    name: 'Johnny Walker',
    volume: '75cl',
    price: 10000,
    stock: 3,
    categoryId: '3',
    alertThreshold: 2,
    createdAt: new Date(),
  },
  {
    id: '6',
    name: 'Mouton Cadet',
    volume: '75cl',
    price: 12000,
    stock: 5,
    categoryId: '4',
    alertThreshold: 2,
    createdAt: new Date(),
  },
];

export function useProducts() {
  const [products, setProducts] = useLocalStorage<Product[]>('bar-products', defaultProducts);

  const addProduct = (product: Omit<Product, 'id' | 'createdAt'>) => {
    const newProduct: Product = {
      ...product,
      id: Date.now().toString(),
      createdAt: new Date(),
    };
    setProducts([...products, newProduct]);
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(products.map(product => 
      product.id === id ? { ...product, ...updates } : product
    ));
  };

  const deleteProduct = (id: string) => {
    setProducts(products.filter(product => product.id !== id));
  };

  const decreaseStock = (id: string, quantity: number) => {
    setProducts(products.map(product => 
      product.id === id ? { ...product, stock: Math.max(0, product.stock - quantity) } : product
    ));
  };

  const increaseStock = (id: string, quantity: number) => {
    setProducts(products.map(product => 
      product.id === id ? { ...product, stock: product.stock + quantity } : product
    ));
  };

  const getProductsByCategory = (categoryId: string) => {
    return products
      .filter(product => product.categoryId === categoryId)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  };

  const getLowStockProducts = () => {
    return products.filter(product => product.stock <= product.alertThreshold);
  };

  const getProductById = (id: string) => {
    return products.find(product => product.id === id);
  };

  return {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    decreaseStock,
    increaseStock,
    getProductsByCategory,
    getLowStockProducts,
    getProductById,
  };
}