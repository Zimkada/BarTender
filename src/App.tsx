import React, { useState } from 'react';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ProductGrid } from './components/ProductGrid';
import { Cart } from './components/Cart';
import { ProductModal } from './components/ProductModal';
import { CategoryModal } from './components/CategoryModal';
import { SalesHistory } from './components/SalesHistory';
import { Inventory } from './components/Inventory';
import { Settings } from './components/Settings';
import { ServerInterface } from './components/ServerInterface';
import { RoleSelector } from './components/RoleSelector';
import { useCategories } from './hooks/useCategories';
import { useProducts } from './hooks/useProducts';
import { useSales } from './hooks/useSales';
import { useSettings } from './hooks/useSettings';
import { CartItem, Product } from './types';

function App() {
  const { categories, addCategory } = useCategories();
  const { getProductsByCategory, addProduct, updateProduct, decreaseStock } = useProducts();
  const { addSale } = useSales();
  const { settings, updateSettings } = useSettings();
  
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentInterface, setCurrentInterface] = useState<'selector' | 'manager' | 'server'>('selector');

  const currentProducts = getProductsByCategory(activeCategory);

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity === 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const checkout = () => {
    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    
    // Decrease stock for each item
    cart.forEach(item => {
      decreaseStock(item.product.id, item.quantity);
    });

    // Add sale to history
    addSale({
      items: cart,
      total,
      currency: settings.currency,
    });

    // Clear cart
    clearCart();
    setIsCartOpen(false);
    
    // Show success message
    alert('Vente enregistrée avec succès !');
  };

  const handleRoleSelection = (role: 'manager' | 'server') => {
    updateSettings({ userRole: role });
    setCurrentInterface(role);
  };

  if (currentInterface === 'selector') {
    return <RoleSelector onSelectRole={handleRoleSelection} />;
  }

  if (currentInterface === 'server') {
    return (
      <ServerInterface 
        onSwitchToManager={() => setCurrentInterface('manager')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Header
        onShowSales={() => setShowSalesHistory(true)}
        onShowSettings={() => setShowSettings(true)}
        onShowInventory={() => setShowInventory(true)}
        onSwitchToServer={() => setCurrentInterface('server')}
      />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onAddCategory={() => setShowCategoryModal(true)}
        />
        
        <ProductGrid
          products={currentProducts}
          onAddToCart={addToCart}
        />
      </main>

      <Cart
        items={cart}
        isOpen={isCartOpen}
        onToggle={() => setIsCartOpen(!isCartOpen)}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={checkout}
        onClear={clearCart}
      />

      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSave={(productData) => {
          addProduct(productData);
          setShowProductModal(false);
        }}
        categories={categories}
      />

      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSave={(categoryData) => {
          const newCategory = addCategory(categoryData);
          setActiveCategory(newCategory.id);
          setShowCategoryModal(false);
        }}
      />

      <SalesHistory
        isOpen={showSalesHistory}
        onClose={() => setShowSalesHistory(false)}
      />

      <Inventory
        isOpen={showInventory}
        onClose={() => setShowInventory(false)}
      />

      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default App;