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
  returned?: number;
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
  serverId: string;      
  serverName: string;     
  date: Date;
  completedAt?: Date;
  modifiedBy?: string;     
}

export interface Sale {
  id: string;
  items: CartItem[];
  total: number;
  currency: string;
  date: Date;
  orderId?: string;
  serverId: string;   
  serverName: string;      
  processedBy?: string;   
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  userRole: 'manager' | 'server';
  serverName?: string;
}

export interface Server {
  id: string;
  name: string;
  phone: string;
  email?: string;
  age: number;
  parentContact: string;
  startDate: string;
  isActive: boolean;
  createdAt: Date;
  lastActiveAt?: Date;
}

export interface ServerSession {
  serverId: string;
  serverName: string;
  loginTime: Date;
}

