import React, { useState, useMemo } from 'react';
import { CategoryTabs } from './CategoryTabs';
import { ProductGrid } from './ProductGrid';
import { ServerCart } from './ServerCart';
import { PendingOrders } from './PendingOrders';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useAuth } from '../context/AuthContext';
import { CartItem, Product } from '../types';
import { Users, Gift } from 'lucide-react';
import { PromotionsManager } from './promotions/PromotionsManager';
import { PaymentMethod } from './cart/PaymentMethodSelector';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Card } from './ui/Card';

interface ServerInterfaceProps {
  onSwitchToManager: () => void;
}

export function ServerInterface({ onSwitchToManager }: ServerInterfaceProps) {
  const { categories, addSale, settings } = useAppContext();
  const {
    products,
    getProductStockInfo
  } = useStockManagement();
  const { currentSession } = useAuth();

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState('');
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [showPromotionsManager, setShowPromotionsManager] = useState(false);

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

  const launchOrder = (paymentMethod: PaymentMethod = 'cash') => {
    if (cart.length === 0 || !currentSession) return;

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

    // Mapper les items du panier vers le format SaleItem
    const saleItems = cart.map(item => ({
      product_id: item.product.id,
      product_name: item.product.name,
      product_volume: item.product.volume,
      quantity: item.quantity,
      unit_price: item.product.price,
      total_price: item.product.price * item.quantity
    }));

    const isServerRole = currentSession.role === 'serveur';
    const isManagerOrPromoter = currentSession.role === 'gerant' || currentSession.role === 'promoteur';

    if (isServerRole) {
      addSale({
        items: saleItems,
        total,
        currency: settings.currency,
        status: 'pending',
        assignedTo: currentSession.userName, // Le serveur s'assigne la vente
        tableNumber: tableNumber || undefined,
        paymentMethod,
      });
    } else if (isManagerOrPromoter) {
      addSale({
        items: saleItems,
        total,
        currency: settings.currency,
        status: 'validated',
        createdBy: currentSession.userId,
        validatedBy: currentSession.userId,
        createdAt: new Date(),
        validatedAt: new Date(),
        tableNumber: tableNumber || undefined,
        paymentMethod,
      });
    } else {
      console.error('Rôle utilisateur non reconnu:', currentSession.role);
      alert('Erreur: Rôle utilisateur non valide');
      return;
    }

    clearCart();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-amber-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Interface Serveur</h1>
            <p className="text-gray-600 text-sm">
              Serveur: <span className="text-amber-600 font-semibold">{currentSession?.userName || 'Non défini'}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
                onClick={() => setShowPromotionsManager(true)}
                variant="secondary"
                className="bg-purple-100 text-purple-700 hover:bg-purple-200"
            >
                <Gift size={18} className="mr-2" />
                Promotions
            </Button>
            <Button onClick={() => setShowPendingOrders(true)}>
                Commandes en attente
            </Button>
            <Button
                onClick={onSwitchToManager}
                variant="secondary"
            >
                Mode Gérant
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card variant="elevated" padding="sm" className="bg-white/60 backdrop-blur-sm border-amber-100 rounded-2xl">
          <Label htmlFor="tableNumber">Numéro de table (optionnel)</Label>
          <Input
            id="tableNumber"
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="ex: Table 5"
            leftIcon={<Users size={16} className="text-amber-500" />}
            className="mt-2 max-w-xs"
          />
        </Card>

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

      <PromotionsManager
        isOpen={showPromotionsManager}
        onClose={() => setShowPromotionsManager(false)}
      />
    </div>
  );
}
