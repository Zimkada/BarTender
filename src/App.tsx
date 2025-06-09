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
import { NotificationsProvider, useNotifications } from './components/Notifications';
import { useAppContext } from './context/AppContext';
import { CartItem, Product } from './types';
import { AnimatePresence, motion } from 'framer-motion';
import { ServerManagement } from './components/ServerManagement';

function AppContent() {
  const { 
    categories, 
    addCategory,
    products,
    addProduct, 
    updateProduct, 
    decreaseStock,
    getProductsByCategory,
    addSale,
    settings, 
    updateSettings 
  } = useAppContext();
  const { showNotification } = useNotifications();
  
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showServers, setShowServers] = useState(false);
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
    
    // Add sale to history - decreaseStock is handled in the context
    addSale({
      items: cart,
      total,
      currency: settings.currency,
      serverId: 'manager',
      serverName: 'Gérant',
    });

    // Clear cart
    clearCart();
    setIsCartOpen(false);
    
    // Show success message
    showNotification('success', 'Vente enregistrée avec succès !');
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
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-yellow-200 to-amber-200"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Header
        onShowSales={() => setShowSalesHistory(true)}
        onShowSettings={() => setShowSettings(true)}
        onShowInventory={() => setShowInventory(true)}
        onShowServers={() => setShowServers(true)}
        onSwitchToServer={() => setCurrentInterface('server')}
      />
      
      <motion.main 
        className="container mx-auto px-4 py-6 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={(id) => {
            setActiveCategory(id);
            const category = categories.find(c => c.id === id);
            if (category) {
              showNotification('info', `Catégorie: ${category.name}`);
            }
          }}
          onAddCategory={() => setShowCategoryModal(true)}
        />
        
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ProductGrid
              products={currentProducts}
              onAddToCart={addToCart}
            />
          </motion.div>
        </AnimatePresence>
      </motion.main>

      <Cart
        items={cart}
        isOpen={isCartOpen}
        onToggle={() => setIsCartOpen(!isCartOpen)}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={checkout}
        onClear={clearCart}
      />
      
      <ServerManagement
        isOpen={showServers}
        onClose={() => setShowServers(false)}
      />

      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSave={(productData) => {
          addProduct(productData);
          setShowProductModal(false);
          showNotification('success', `Produit "${productData.name}" ajouté`);
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
          showNotification('success', `Catégorie "${categoryData.name}" créée`);
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
    </motion.div>
  );
}

function App() {
  return (
    <NotificationsProvider>
      <AppContent />
    </NotificationsProvider>
  );
}

export default App;