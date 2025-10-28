import React, { useState, useMemo } from 'react';
import { CategoryTabs } from './CategoryTabs';
import { ProductGrid } from './ProductGrid';
import { ServerCart } from './ServerCart';
import { PendingOrders } from './PendingOrders';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useAuth } from '../context/AuthContext';
import { CartItem, Product } from '../types';
import { Users } from 'lucide-react';

interface ServerInterfaceProps {
  onSwitchToManager: () => void;
}

export function ServerInterface({ onSwitchToManager }: ServerInterfaceProps) {
  const { categories, addSale, settings } = useAppContext();
  const {
    products,
    decreasePhysicalStock,
    getProductStockInfo
  } = useStockManagement();
  const { currentSession } = useAuth();

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState('');
  const [showPendingOrders, setShowPendingOrders] = useState(false);

  const currentProducts = useMemo(() => {
    return products.filter(product => product.categoryId === activeCategory);
  }, [products, activeCategory]);

  const addToCart = (product: Product) => {
    const stockInfo = getProductStockInfo(product.id);
    const availableStock = stockInfo?.availableStock ?? 0;
    const physicalStock = stockInfo?.physicalStock ?? 0;

    if (availableStock === 0) {
      alert('❌ Stock disponible épuisé');
      return;
    }
    
    if (physicalStock <= product.alertThreshold && physicalStock > 0) {
      if (!confirm(`⚠️ Stock physique critique (${physicalStock} restants). Continuer ?`)) {
        return;
      }
    }
    
    const existingItem = cart.find(item => item.product.id === product.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, availableStock) }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    const stockInfo = getProductStockInfo(productId);
    const availableStock = stockInfo?.availableStock ?? 0;

    if (quantity === 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(quantity, availableStock) }
          : item
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setTableNumber('');
  };

  const launchOrder = () => {
    if (cart.length === 0 || !currentSession) return;

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

    const isServerRole = currentSession.role === 'serveur';
    const isManagerOrPromoter = currentSession.role === 'gerant' || currentSession.role === 'promoteur';

    if (isServerRole) {
      addSale({
        items: cart,
        total,
        currency: settings.currency,
        status: 'pending',
        createdBy: currentSession.userId,
        createdAt: new Date(),
        tableNumber: tableNumber || undefined,
      });
    } else if (isManagerOrPromoter) {
      addSale({
        items: cart,
        total,
        currency: settings.currency,
        status: 'validated',
        createdBy: currentSession.userId,
        validatedBy: currentSession.userId,
        createdAt: new Date(),
        validatedAt: new Date(),
        tableNumber: tableNumber || undefined,
      });

      cart.forEach(item => {
        decreasePhysicalStock(item.product.id, item.quantity);
      });
    } else {
      console.error('Rôle utilisateur non reconnu:', currentSession.role);
      alert('Erreur: Rôle utilisateur non valide');
      return;
    }

    clearCart();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-orange-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Interface Serveur</h1>
            <p className="text-gray-600 text-sm">
              Serveur: <span className="text-orange-600 font-semibold">{currentSession?.userName || 'Non défini'}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPendingOrders(true)}
              className="px-4 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
            >
              Commandes en attente
            </button>
            <button
              onClick={onSwitchToManager}
              className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-medium hover:bg-amber-200 transition-colors"
            >
              Mode Gérant
            </button>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="bg-white/60 backdrop-blur-sm border border-orange-100 rounded-2xl p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Users size={16} className="text-orange-500" />
            Numéro de table (optionnel)
          </label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            className="w-full max-w-xs px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
            placeholder="ex: Table 5"
          />
        </div>

        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
        
        <ProductGrid
          products={currentProducts}
          onAddToCart={addToCart}
        />
      </main>

      <ServerCart
        items={cart}
        tableNumber={tableNumber}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onLaunchOrder={launchOrder}
        onClear={clearCart}
      />

      <PendingOrders
        isOpen={showPendingOrders}
        onClose={() => setShowPendingOrders(false)}
      />
    </div>
  );
}
