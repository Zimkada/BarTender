import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  X,
  Zap,
  Users,
  CreditCard,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { EnhancedButton } from './EnhancedButton';
import { Product, CartItem, Promotion } from '../types';
import { useViewport } from '../hooks/useViewport';
import { ProductGrid } from './ProductGrid';
import { PromotionsService } from '../services/supabase/promotions.service';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { useServerMappings } from '../hooks/useServerMappings';
import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { PaymentMethodSelector, PaymentMethod } from './cart/PaymentMethodSelector';
import { useFilteredProducts } from '../hooks/useFilteredProducts';
import { CartShared } from './cart/CartShared';
import { useCartLogic } from '../hooks/useCartLogic';
import { Input } from './ui/Input';
import { Select, SelectOption } from './ui/Select';

interface QuickSaleFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickSaleFlow({ isOpen, onClose }: QuickSaleFlowProps) {
  const { categories, settings } = useAppContext();
  const {
    products,
    getProductStockInfo
  } = useStockManagement();
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const { createSale } = useSalesMutations(currentBar?.id || '');

  const [cart, setCart] = useState<CartItem[]>([]);
  const { total, totalItems, calculatedItems } = useCartLogic({
    items: cart,
    barId: currentBar?.id
  });
  const itemCount = totalItems;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customerInfo, setCustomerInfo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || !currentSession || !currentBar || createSale.isPending) return;

    const isSimplifiedMode = currentBar?.settings?.operatingMode === 'simplified';
    if (isSimplifiedMode && !selectedServer) {
      alert('Veuillez sélectionner le serveur qui a effectué la vente');
      return;
    }

    try {
      // Stock check can remain
      for (const item of cart) {
        const stockInfo = getProductStockInfo(item.product.id);
        if (!stockInfo || stockInfo.availableStock < item.quantity) {
          throw new Error(`Stock disponible insuffisant pour ${item.product.name}`);
        }
      }

      const isServerRole = currentSession.role === 'serveur';

      // ✨ [CORRECTIF] Plus de calcul manuel. On utilise calculatedItems du hook.
      const saleItems = calculatedItems.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        original_unit_price: item.original_unit_price,
        discount_amount: item.discount_amount,
        promotion_id: item.promotion_id,
      }));

      // La logique de mapping des serveurs reste inchangée
      let serverId: string | undefined;
      if (isSimplifiedMode && selectedServer) {
        const serverName = selectedServer.startsWith('Moi (')
          ? (currentSession?.userName || selectedServer)
          : selectedServer;
        try {
          serverId = await ServerMappingsService.getUserIdForServerName(
            currentBar.id,
            serverName
          );
          if (!serverId) {
            const errorMessage =
              `⚠️ Erreur Critique:\n\n` +
              `Le serveur "${serverName}" n'existe pas ou n'est pas mappé.\n\n` +
              `Actions:\n` +
              `1. Créer un compte pour ce serveur en Gestion Équipe\n` +
              `2. Mapper le compte dans Paramètres > Opérationnel > Correspondance Serveurs\n` +
              `3. Réessayer la vente`;
            alert(errorMessage);
            return;
          }
        } catch (error) {
          const errorMessage =
            `❌ Impossible d'attribuer la vente:\n\n` +
            `${error instanceof Error ? error.message : 'Erreur réseau lors de la résolution du serveur'}\n\n` +
            `Réessayez ou contactez l'administrateur.`;
          alert(errorMessage);
          return;
        }
      }

      await createSale.mutateAsync({
        bar_id: currentBar.id,
        items: saleItems, // On passe les items calculés et formatés
        payment_method: paymentMethod,
        sold_by: currentSession.userId,
        server_id: serverId,
        status: isServerRole ? 'pending' : 'validated',
        customer_name: customerInfo || undefined,
        notes: isSimplifiedMode ? `Serveur: ${selectedServer}` : undefined
      });

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setCart([]);
        setCustomerInfo('');
        setSelectedServer('');
        onClose();
      }, 1000);

    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erreur lors de la vente');
    }
  }, [cart, calculatedItems, currentSession, currentBar, createSale, getProductStockInfo, paymentMethod, customerInfo, selectedServer, onClose]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCheckout();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCart([]);
      }
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, cart, handleCheckout]);


  // 1. Préparer les produits avec stock
  const productsWithStock = products.map(product => {
    const stockInfo = getProductStockInfo(product.id);
    return {
      ...product,
      stock: stockInfo?.availableStock ?? 0
    };
  });

  // 2. Utiliser le hook centralisé (qui filtre maintenant aussi sur le stock calculé)
  const filteredProducts = useFilteredProducts({
    products: productsWithStock,
    searchQuery: searchTerm,
    selectedCategory,
    onlyInStock: false // On ne filtre pas ici car le hook attend "stock" property qui est déjà settée
    // Note: Le hook filtre par default 'stock > 0' si onlyInStock est true.
    // Nos produits enrichis ont 'stock'. Donc on peut laisser le hook faire le filtrage final.
  });

  // 3. Fetch server mappings from database instead of settings
  const enableServerTracking = currentBar?.settings?.operatingMode === 'simplified';
  const { serverNames } = useServerMappings(enableServerTracking ? currentBar?.id : undefined);

  // Préparer les options pour le select serveur
  const serverOptions: SelectOption[] = [
    { value: '', label: 'Sélectionner un serveur...' },
    { value: `Moi (${currentSession?.userName})`, label: `Moi (${currentSession?.userName})` },
    ...serverNames.map(serverName => ({
      value: serverName,
      label: serverName
    }))
  ];

  // ✨ [SIMPLIFIÉ] La logique de promo est partie dans useCartLogic
  const quickAddToCart = (product: Product, quantity = 1) => {
    const stockInfo = getProductStockInfo(product.id);
    const availableStock = stockInfo?.availableStock ?? 0;
    if (availableStock < quantity) return;

    const existingItem = cart.find(item => item.product.id === product.id);
    let newCart: CartItem[];

    if (existingItem) {
      const newQuantity = Math.min(existingItem.quantity + quantity, availableStock);
      newCart = cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: newQuantity }
          : item
      );
    } else {
      newCart = [...cart, { product, quantity }];
    }

    setCart(newCart);
    setSearchTerm('');
    if (!isMobile) {
      searchInputRef.current?.focus();
    }
  };

  // ✨ [SIMPLIFIÉ] La logique de promo est partie dans useCartLogic
  const updateQuantity = (productId: string, newQuantity: number) => {
    const stockInfo = getProductStockInfo(productId);
    const availableStock = stockInfo?.availableStock ?? 0;

    if (newQuantity === 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      const item = cart.find(i => i.product.id === productId);
      if (!item) return;

      const validQuantity = Math.min(newQuantity, availableStock);
      setCart(cart.map(cartItem =>
        cartItem.product.id === productId
          ? { ...cartItem, quantity: validQuantity }
          : cartItem
      ));
    }
  };


  if (!isOpen) return null;

  // Restreindre l'accès aux serveurs en mode simplifié
  const isSimplifiedMode = currentBar?.settings?.operatingMode === 'simplified';
  const isServerRole = currentSession?.role === 'serveur';

  if (isSimplifiedMode && isServerRole) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Accès Restreint</h2>
              <p className="text-gray-600 mb-6">
                En mode simplifié, seul le gérant crée les ventes.
              </p>
              <button
                onClick={onClose}
                className="w-full bg-blue-500 text-white py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
              >
                Fermer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex"
        >
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full max-w-4xl bg-white h-full overflow-hidden flex flex-col"
          >
            <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap size={24} />
                  <div>
                    <h2 className="text-xl font-bold">Vente rapide</h2>
                    <p className="hidden lg:block text-sm opacity-90">Ctrl+Enter: Finaliser | Esc: Vider | F1: Recherche</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
                  <X size={24} />
                </button>
              </div>
            </div>

            {isMobile ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4 mb-6">
                    <Input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Rechercher un produit..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      leftIcon={<Search size={20} />}
                      size="lg"
                    />

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${selectedCategory === 'all'
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-200 text-gray-700'
                          }`}
                      >
                        Toutes
                      </button>
                      {categories.map(category => (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${selectedCategory === category.id
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-200 text-gray-700'
                            }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pb-24">
                    <ProductGrid
                      products={filteredProducts}
                      onAddToCart={(p) => quickAddToCart(p, 1)}
                    />
                  </div>

                  {filteredProducts.length === 0 && (
                    <div className="text-center py-12">
                      <Search size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Aucun produit trouvé</p>
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="flex-shrink-0 sticky bottom-0 bg-gradient-to-br from-amber-50 to-amber-50 border-t-2 border-amber-300 shadow-lg">
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={20} className="text-amber-600" />
                          <span className="font-semibold text-gray-800">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
                        </div>
                        <button
                          onClick={() => setShowCartMobile(true)}
                          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium active:bg-amber-600"
                        >
                          Voir panier
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-amber-100 rounded-lg px-4 py-3">
                          <div className="text-xs text-gray-600 mb-1">Total</div>
                          <div className="text-amber-600 font-bold text-xl">{formatPrice(total)}</div>
                        </div>
                        <EnhancedButton
                          variant="success"
                          size="lg"
                          onClick={handleCheckout}
                          loading={createSale.isPending}
                          success={showSuccess}
                          className="flex-1"
                          icon={showSuccess ? <Check size={20} /> : <CreditCard size={20} />}
                          hapticFeedback={true}
                        >
                          {showSuccess ? 'Validé !' : 'Finaliser'}
                        </EnhancedButton>
                      </div>
                    </div>
                  </div>
                )}

                {showCartMobile && (
                  <div className="fixed inset-0 bg-black/50 z-[60] flex items-end" onClick={() => setShowCartMobile(false)}>
                    <div
                      className="bg-white w-full rounded-t-3xl max-h-[80vh] flex flex-col relative z-[61]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between rounded-t-3xl">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                          <ShoppingCart size={24} className="text-amber-600" />
                          Panier ({itemCount})
                        </h3>
                        <button onClick={() => setShowCartMobile(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                          <X size={24} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        <CartShared
                          items={calculatedItems}
                          onUpdateQuantity={updateQuantity}
                          onRemoveItem={(id) => updateQuantity(id, 0)}
                          variant="mobile"
                        />

                        {currentBar?.settings?.operatingMode === 'simplified' && (
                          <div className="mt-6">
                            <Select
                              label="Serveur"
                              options={serverOptions}
                              value={selectedServer}
                              onChange={(e) => setSelectedServer(e.target.value)}
                              size="lg"
                            />
                          </div>
                        )}

                        <div className="mt-6">
                          <PaymentMethodSelector
                            value={paymentMethod}
                            onChange={setPaymentMethod}
                          />
                        </div>
                      </div>

                      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white space-y-3">
                        <div className="flex items-center justify-between bg-amber-50 rounded-xl p-4">
                          <span className="text-gray-700 font-semibold">Total</span>
                          <span className="text-amber-600 font-bold text-xl">{formatPrice(total)}</span>
                        </div>

                        <EnhancedButton
                          variant="success"
                          size="lg"
                          onClick={() => {
                            setShowCartMobile(false);
                            handleCheckout();
                          }}
                          loading={createSale.isPending}
                          success={showSuccess}
                          className="w-full"
                          icon={showSuccess ? <Check size={20} /> : <CreditCard size={20} />}
                          hapticFeedback={true}
                        >
                          {showSuccess ? 'Vente finalisée !' : 'Finaliser la vente'}
                        </EnhancedButton>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto">
                  <div className="space-y-4 mb-6">
                    <Input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Rechercher un produit (nom ou volume)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      leftIcon={<Search size={20} />}
                      size="lg"
                    />

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${selectedCategory === 'all'
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                      >
                        Toutes
                      </button>
                      {categories.map(category => (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${selectedCategory === category.id
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ProductGrid
                    products={filteredProducts}
                    onAddToCart={(p) => quickAddToCart(p, 1)}
                  />

                  {filteredProducts.length === 0 && (
                    <div className="text-center py-12">
                      <Search size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Aucun produit trouvé</p>
                    </div>
                  )}
                </div>

                <div className="w-80 h-full bg-gradient-to-br from-amber-50 to-amber-50 border-l border-amber-200 flex flex-col">
                  <div className="flex-shrink-0 p-4 border-b border-amber-200">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <ShoppingCart size={20} />
                        Panier ({itemCount})
                      </h3>
                      {cart.length > 0 && (
                        <button
                          onClick={() => setCart([])}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Vider
                        </button>
                      )}
                    </div>

                    <Input
                      type="text"
                      placeholder="Client (optionnel)"
                      value={customerInfo}
                      onChange={(e) => setCustomerInfo(e.target.value)}
                      size="sm"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                    {cart.length === 0 ? (
                      <div className="text-center py-8">
                        <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-sm">Panier vide</p>
                      </div>
                    ) : (
                      <CartShared
                        items={calculatedItems}
                        onUpdateQuantity={updateQuantity}
                        onRemoveItem={(id) => updateQuantity(id, 0)}
                        variant="desktop"
                      />
                    )}
                  </div>

                  <div className="flex-shrink-0 p-4 border-t border-amber-200 space-y-3 bg-gradient-to-br from-amber-50 to-amber-50">

                    {currentBar?.settings?.operatingMode === 'simplified' && (
                      <Select
                        label="Serveur"
                        options={serverOptions}
                        value={selectedServer}
                        onChange={(e) => setSelectedServer(e.target.value)}
                        size="sm"
                        leftIcon={<Users size={14} className="text-amber-500" />}
                      />
                    )}

                    <PaymentMethodSelector
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      className="mb-2"
                    />

                    <div className="bg-amber-100 rounded-lg p-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 font-medium text-sm">Total:</span>
                        <span className="text-amber-600 font-bold text-lg">{formatPrice(total)}</span>
                      </div>
                    </div>

                    <EnhancedButton
                      variant="success"
                      size="lg"
                      onClick={handleCheckout}
                      loading={createSale.isPending}
                      success={showSuccess}
                      disabled={cart.length === 0}
                      className="w-full"
                      icon={showSuccess ? <Check size={20} /> : <CreditCard size={20} />}
                      hapticFeedback={true}
                    >
                      {showSuccess ? 'Vente finalisée !' : 'Finaliser la vente'}
                    </EnhancedButton>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
