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
import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { PaymentMethodSelector, PaymentMethod } from './cart/PaymentMethodSelector';
import { useFilteredProducts } from '../hooks/useFilteredProducts';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customerInfo, setCustomerInfo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      loadActivePromotions();
    }
  }, [isOpen]);

  const loadActivePromotions = async () => {
    if (!currentBar?.id) return;
    try {
      const promos = await PromotionsService.getActivePromotions(currentBar.id);
      setActivePromotions(promos);
    } catch (error) {
      console.error('Erreur chargement promotions:', error);
    }
  };

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || !currentSession || !currentBar || createSale.isPending) return;

    const isSimplifiedMode = currentBar?.settings?.operatingMode === 'simplified';
    if (isSimplifiedMode && !selectedServer) {
      alert('Veuillez sélectionner le serveur qui a effectué la vente');
      return;
    }

    try {
      for (const item of cart) {
        const stockInfo = getProductStockInfo(item.product.id);
        if (!stockInfo || stockInfo.availableStock < item.quantity) {
          throw new Error(`Stock disponible insuffisant pour ${item.product.name}`);
        }
      }

      const isServerRole = currentSession.role === 'serveur';

      const saleItems = cart.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price - ((item.discountAmount || 0) / item.quantity),
        total_price: (item.product.price * item.quantity) - (item.discountAmount || 0),
        original_unit_price: item.product.price,
        discount_amount: item.discountAmount || 0,
        promotion_id: item.promotionId
      }));

      await createSale.mutateAsync({
        bar_id: currentBar.id,
        items: saleItems,
        payment_method: paymentMethod,
        sold_by: currentSession.userId,
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
  }, [cart, currentSession, currentBar, createSale, getProductStockInfo, paymentMethod, customerInfo, selectedServer, onClose]);

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

  const calculateItemWithPromo = (product: Product, quantity: number): CartItem => {
    const applicablePromos = activePromotions.filter(p =>
      p.targetType === 'all' ||
      (p.targetType === 'product' && p.targetProductIds?.includes(product.id)) ||
      (p.targetType === 'category' && p.targetCategoryIds?.includes(product.categoryId))
    );

    const priceInfo = PromotionsService.calculateBestPrice(
      product,
      quantity,
      applicablePromos
    );

    return {
      product,
      quantity,
      originalPrice: product.price,
      discountAmount: priceInfo.discount,
      promotionId: priceInfo.appliedPromotion?.id
    };
  };

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
          ? calculateItemWithPromo(product, newQuantity)
          : item
      );
    } else {
      newCart = [...cart, calculateItemWithPromo(product, quantity)];
    }

    setCart(newCart);
    setSearchTerm('');
    if (!isMobile) {
      searchInputRef.current?.focus();
    }
  };

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
          ? calculateItemWithPromo(cartItem.product, validQuantity)
          : cartItem
      ));
    }
  };

  const total = cart.reduce((sum, item) => {
    const itemTotal = (item.product.price * item.quantity) - (item.discountAmount || 0);
    return sum + itemTotal;
  }, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!isOpen) return null;

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
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Rechercher un produit..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>

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
                        {cart.map(item => (
                          <div key={item.product.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-800 text-base">{item.product.name}</h4>
                                <p className="text-gray-600 text-sm">{item.product.volume}</p>
                              </div>
                              <button
                                onClick={() => updateQuantity(item.product.id, 0)}
                                className="text-red-500 p-1"
                              >
                                <X size={20} />
                              </button>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                  className="w-10 h-10 bg-amber-200 text-amber-700 rounded-xl flex items-center justify-center"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="w-10 text-center text-base font-semibold">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                  className="w-10 h-10 bg-amber-200 text-amber-700 rounded-xl flex items-center justify-center"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>
                            <div className="text-right">
                              {item.discountAmount && item.discountAmount > 0 && (
                                <div className="text-xs text-gray-400 line-through">
                                  {formatPrice(item.product.price * item.quantity)}
                                </div>
                              )}
                              <div className="text-lg font-bold text-amber-600">
                                {formatPrice((item.product.price * item.quantity) - (item.discountAmount || 0))}
                              </div>
                            </div>
                          </div>
                        ))}

                        {currentBar?.settings?.enableServerTracking && (
                          <div className="mt-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Serveur
                            </label>
                            <select
                              value={selectedServer}
                              onChange={(e) => setSelectedServer(e.target.value)}
                              className="w-full px-4 py-3 border border-amber-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                            >
                              <option value="">Sélectionner un serveur...</option>
                              <option value={`Moi (${currentSession?.userName})`}>
                                Moi ({currentSession?.userName})
                              </option>
                              {currentBar?.settings?.serversList?.map((serverName) => (
                                <option key={serverName} value={serverName}>
                                  {serverName}
                                </option>
                              ))}
                            </select>
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
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Rechercher un produit (nom ou volume)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>

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

                    <input
                      type="text"
                      placeholder="Client (optionnel)"
                      value={customerInfo}
                      onChange={(e) => setCustomerInfo(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                    {cart.length === 0 ? (
                      <div className="text-center py-8">
                        <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-sm">Panier vide</p>
                      </div>
                    ) : (
                      cart.map(item => (
                        <motion.div
                          key={item.product.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="bg-white rounded-lg p-3 border border-amber-100"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-800 text-sm">{item.product.name}</h4>
                              <p className="text-gray-600 text-xs">{item.product.volume}</p>
                            </div>
                            <button
                              onClick={() => updateQuantity(item.product.id, 0)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                className="w-6 h-6 bg-amber-200 text-amber-700 rounded-full flex items-center justify-center text-xs hover:bg-amber-300"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                className="w-6 h-6 bg-amber-200 text-amber-700 rounded-full flex items-center justify-center text-xs hover:bg-amber-300"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <div className="text-right">
                              {item.discountAmount && item.discountAmount > 0 && (
                                <div className="text-xs text-gray-400 line-through mb-0.5">
                                  {formatPrice(item.product.price * item.quantity)}
                                </div>
                              )}
                              <span className={`${item.discountAmount ? 'text-green-600' : 'text-amber-600'} font-bold text-sm`}>
                                {formatPrice((item.product.price * item.quantity) - (item.discountAmount || 0))}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>

                  <div className="flex-shrink-0 p-4 border-t border-amber-200 space-y-3 bg-gradient-to-br from-amber-50 to-amber-50">

                    {currentBar?.settings?.operatingMode === 'simplified' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                          <Users size={14} className="text-amber-500" />
                          Serveur
                        </label>
                        <select
                          value={selectedServer}
                          onChange={(e) => setSelectedServer(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        >
                          <option value="">Sélectionner...</option>
                          <option value={`Moi (${currentSession?.userName})`}>
                            Moi ({currentSession?.userName})
                          </option>
                          {currentBar?.settings?.serversList?.map((serverName) => (
                            <option key={serverName} value={serverName}>
                              {serverName}
                            </option>
                          ))}
                        </select>
                      </div>
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
