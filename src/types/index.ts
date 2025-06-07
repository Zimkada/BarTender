export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  volume: string;
  price: number; // Prix de vente
  stock: number;
  categoryId: string;
  image?: string;
  alertThreshold: number;
  createdAt: Date;
}

export interface Supply {
  id: string;
  productId: string;
  quantity: number; // Quantité totale achetée
  lotSize: number; // Quantité par lot (ex: 24 pour un casier)
  lotPrice: number; // Prix d'achat du lot
  supplier: string;
  date: Date;
  totalCost: number; // Coût total de l'approvisionnement
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  product: Product;
  quantity: number;
  returned?: number; // Quantité retournée
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled';
  tableNumber?: string;
  serverName?: string;
  date: Date;
  completedAt?: Date;
}

export interface Sale {
  id: string;
  items: CartItem[];
  total: number;
  currency: string;
  date: Date;
  orderId?: string; // Lien avec la commande si applicable
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  userRole: 'manager' | 'server';
  serverName?: string;
}