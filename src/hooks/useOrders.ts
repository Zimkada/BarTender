import { useLocalStorage } from './useLocalStorage';
import { Order, OrderItem } from '../types';

export function useOrders() {
  const [orders, setOrders] = useLocalStorage<Order[]>('bar-orders', []);

  const addOrder = (order: Omit<Order, 'id' | 'date' | 'status'>) => {
    const newOrder: Order = {
      ...order,
      id: Date.now().toString(),
      date: new Date(),
      status: 'pending',
    };
    setOrders([newOrder, ...orders]);
    return newOrder;
  };

  const updateOrderStatus = (orderId: string, status: Order['status']) => {
    setOrders(orders.map(order => 
      order.id === orderId 
        ? { 
            ...order, 
            status,
            completedAt: status === 'completed' ? new Date() : order.completedAt
          }
        : order
    ));
  };

  const returnOrderItem = (orderId: string, productId: string, returnQuantity: number) => {
    setOrders(orders.map(order => {
      if (order.id !== orderId) return order;
      
      const updatedItems = order.items.map(item => {
        if (item.product.id !== productId) return item;
        
        const currentReturned = item.returned || 0;
        const newReturned = Math.min(currentReturned + returnQuantity, item.quantity);
        
        return { ...item, returned: newReturned };
      });
      
      // Recalculer le total
      const newTotal = updatedItems.reduce((sum, item) => {
        const effectiveQuantity = item.quantity - (item.returned || 0);
        return sum + (item.product.price * effectiveQuantity);
      }, 0);
      
      return { ...order, items: updatedItems, total: newTotal };
    }));
  };

  const getPendingOrders = () => {
    return orders.filter(order => order.status === 'pending');
  };

  const getTodayOrders = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return orders.filter(order => {
      const orderDate = new Date(order.date);
      return orderDate >= today && orderDate < tomorrow;
    });
  };

  return {
    orders,
    addOrder,
    updateOrderStatus,
    returnOrderItem,
    getPendingOrders,
    getTodayOrders,
  };
}