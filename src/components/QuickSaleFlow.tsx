import React, { useState, useRef, useEffect } from 'react';
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
  Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { EnhancedButton } from './EnhancedButton';
import { Product, CartItem } from '../types';
import { useViewport } from '../hooks/useViewport';

interface QuickSaleFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickSaleFlow({ isOpen, onClose }: QuickSaleFlowProps) {
  const {
    products,
    categories,
    addSale,
    decreaseStock,
    settings
  } = useAppContext();
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();
  const formatPrice = useCurrencyFormatter();
  const { isMobile } = useViewport();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customerInfo, setCustomerInfo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile'>('cash');
  const [selectedServer, setSelectedServer] = useState<string>(''); // Pour mode simplifié
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus automatique sur la recherche
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Raccourcis clavier
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Ctrl/Cmd + Enter = Finaliser vente
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCheckout();
      }
      
      // Escape = Vider panier
      if (e.key === 'Escape') {
        e.preventDefault();
        setCart([]);
      }
      
      // F1 = Focus recherche
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, cart]);

  // Produits filtrés
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.volume.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.categoryId === selectedCategory;
    return matchesSearch && matchesCategory && product.stock > 0;
  });

  // Ajout rapide au panier
  const quickAddToCart = (product: Product, quantity = 1) => {
    if (product.stock < quantity) return;

    const existingItem = cart.find(item => item.product.id === product.id);

    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + quantity, product.stock) }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity }]);
    }

    // Vider la recherche pour continuer rapidement
    setSearchTerm('');
    // Ne pas re-focus sur mobile pour éviter d'activer le clavier
    if (!isMobile) {
      searchInputRef.current?.focus();
    }
  };

  // Modification quantité
  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(newQuantity, item.product.stock) }
          : item
      ));
    }
  };

  // Calculs
  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Finaliser la vente
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    // Vérifier si un serveur doit être sélectionné
    const isSimplifiedMode = currentBar?.settings?.operatingMode === 'simplified';
    if (isSimplifiedMode && !selectedServer) {
      alert('Veuillez sélectionner le serveur qui a effectué la vente');
      return;
    }

    setIsProcessing(true);

    try {
      // Vérifier le stock une dernière fois
      for (const item of cart) {
        const currentProduct = products.find(p => p.id === item.product.id);
        if (!currentProduct || currentProduct.stock < item.quantity) {
          throw new Error(`Stock insuffisant pour ${item.product.name}`);
        }
      }

      // Créer la vente
      await addSale({
        items: cart,
        total,
        currency: settings.currency,
        assignedTo: isSimplifiedMode ? selectedServer : undefined,
      });

      // Diminuer le stock
      cart.forEach(item => {
        decreaseStock(item.product.id, item.quantity);
      });

      // Animation de succès
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setCart([]);
        setCustomerInfo('');
        setSelectedServer('');
        onClose();
      }, 2000);

    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erreur lors de la vente');
    } finally {
      setIsProcessing(false);
    }
  };

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
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap size={24} />
                  <div>
                    <h2 className="text-xl font-bold">Vente rapide</h2>
                    <p className="text-sm opacity-90">Ctrl+Enter: Finaliser | Esc: Vider | F1: Recherche</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* ==================== VERSION MOBILE (vertical stack) ==================== */}
            {isMobile ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Zone produits (scrollable) */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Recherche et filtres */}
                  <div className="space-y-4 mb-6">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Rechercher un produit..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                          selectedCategory === 'all'
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        Toutes
                      </button>
                      {categories.map(category => (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                            selectedCategory === category.id
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Liste produits - 1 colonne mobile */}
                  <div className="space-y-3 pb-24">
                    {filteredProducts.map(product => (
                      <div
                        key={product.id}
                        onClick={() => quickAddToCart(product)}
                        className="bg-white rounded-xl border border-gray-200 active:scale-[0.98] transition-transform overflow-hidden"
                      >
                        <div className="flex items-center gap-3 p-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1">
                              <h3 className="font-semibold text-gray-800 text-base truncate">{product.name}</h3>
                              <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full ml-2 ${
                                product.stock <= product.alertThreshold
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-orange-100 text-orange-600'
                              }`}>
                                {product.stock}
                              </span>
                            </div>
                            <p className="text-gray-600 text-sm mb-2">{product.volume}</p>
                            <span className="text-orange-600 font-bold text-lg">{formatPrice(product.price)}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              quickAddToCart(product, 1);
                            }}
                            className="flex-shrink-0 w-12 h-12 bg-orange-500 text-white rounded-xl flex items-center justify-center active:bg-orange-600 transition-colors"
                          >
                            <Plus size={20} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredProducts.length === 0 && (
                    <div className="text-center py-12">
                      <Search size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Aucun produit trouvé</p>
                    </div>
                  )}
                </div>

                {/* Panier sticky footer mobile */}
                {cart.length > 0 && (
                  <div className="flex-shrink-0 sticky bottom-0 bg-gradient-to-br from-yellow-50 to-amber-50 border-t-2 border-orange-300 shadow-lg">
                    <div className="p-4 space-y-3">
                      {/* Résumé panier */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={20} className="text-orange-600" />
                          <span className="font-semibold text-gray-800">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
                        </div>
                        <button
                          onClick={() => setShowCartMobile(true)}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium active:bg-orange-600"
                        >
                          Voir panier
                        </button>
                      </div>

                      {/* Total + Finaliser */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-orange-100 rounded-lg px-4 py-3">
                          <div className="text-xs text-gray-600 mb-1">Total</div>
                          <div className="text-orange-600 font-bold text-xl">{formatPrice(total)}</div>
                        </div>
                        <EnhancedButton
                          variant="success"
                          size="lg"
                          onClick={handleCheckout}
                          loading={isProcessing}
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

                {/* Modal panier détails mobile */}
                {showCartMobile && (
                  <div className="fixed inset-0 bg-black/50 z-60 flex items-end" onClick={() => setShowCartMobile(false)}>
                    <div
                      className="bg-white w-full rounded-t-3xl max-h-[80vh] flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between rounded-t-3xl">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                          <ShoppingCart size={24} className="text-orange-600" />
                          Panier ({itemCount})
                        </h3>
                        <button onClick={() => setShowCartMobile(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                          <X size={24} />
                        </button>
                      </div>

                      {/* Contenu scrollable */}
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
                                  className="w-10 h-10 bg-orange-200 text-orange-700 rounded-xl flex items-center justify-center"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="w-10 text-center text-base font-semibold">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                  className="w-10 h-10 bg-orange-200 text-orange-700 rounded-xl flex items-center justify-center"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              <span className="text-orange-600 font-bold text-base">
                                {formatPrice(item.product.price * item.quantity)}
                              </span>
                            </div>
                          </div>
                        ))}

                        <div className="pt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Mode de paiement</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { value: 'cash', label: 'Espèces', icon: '💵' },
                              { value: 'card', label: 'Carte', icon: '💳' },
                              { value: 'mobile', label: 'Mobile', icon: '📱' }
                            ].map(method => (
                              <button
                                key={method.value}
                                onClick={() => setPaymentMethod(method.value as any)}
                                className={`p-3 text-sm rounded-xl border-2 transition-colors ${
                                  paymentMethod === method.value
                                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-gray-200 bg-white text-gray-600'
                                }`}
                              >
                                <div className="text-center">
                                  <div className="text-2xl mb-1">{method.icon}</div>
                                  <div className="font-medium">{method.label}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Sélecteur serveur (mode simplifié uniquement) */}
                        {currentBar?.settings?.operatingMode === 'simplified' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <Users size={16} className="text-orange-500" />
                              Serveur qui a servi
                            </label>
                            <select
                              value={selectedServer}
                              onChange={(e) => setSelectedServer(e.target.value)}
                              className="w-full px-4 py-3 border border-orange-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-base"
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

                        <input
                          type="text"
                          placeholder="Client (optionnel)"
                          value={customerInfo}
                          onChange={(e) => setCustomerInfo(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                        />
                      </div>

                      {/* Footer sticky avec bouton Finaliser */}
                      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white space-y-3">
                        {/* Total */}
                        <div className="flex items-center justify-between bg-orange-50 rounded-xl p-4">
                          <span className="text-gray-700 font-semibold">Total</span>
                          <span className="text-orange-600 font-bold text-xl">{formatPrice(total)}</span>
                        </div>

                        {/* Bouton Finaliser */}
                        <EnhancedButton
                          variant="success"
                          size="lg"
                          onClick={() => {
                            setShowCartMobile(false);
                            handleCheckout();
                          }}
                          loading={isProcessing}
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
              /* ==================== VERSION DESKTOP (horizontal) ==================== */
              <div className="flex-1 flex overflow-hidden">
                {/* Zone produits */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {/* Recherche et filtres */}
                  <div className="space-y-4 mb-6">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Rechercher un produit (nom ou volume)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                          selectedCategory === 'all'
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Toutes
                      </button>
                      {categories.map(category => (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                            selectedCategory === category.id
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Liste produits */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredProducts.map(product => (
                      <motion.div
                        key={product.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => quickAddToCart(product)}
                        className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:border-orange-300 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-800 text-sm">{product.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            product.stock <= product.alertThreshold
                              ? 'bg-red-100 text-red-600'
                              : 'bg-orange-100 text-orange-600'
                          }`}>
                            {product.stock}
                          </span>
                        </div>
                        <p className="text-gray-600 text-xs mb-2">{product.volume}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-orange-600 font-bold">{formatPrice(product.price)}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                quickAddToCart(product, 1);
                              }}
                              className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center hover:bg-orange-600 transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {filteredProducts.length === 0 && (
                    <div className="text-center py-12">
                      <Search size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Aucun produit trouvé</p>
                    </div>
                  )}
                </div>

                {/* Panier latéral */}
                <div className="w-80 h-full bg-gradient-to-br from-yellow-50 to-amber-50 border-l border-orange-200 flex flex-col">
                {/* Header panier */}
                <div className="flex-shrink-0 p-4 border-b border-orange-200">
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
                  
                  {/* Info client */}
                  <input
                    type="text"
                    placeholder="Client (optionnel)"
                    value={customerInfo}
                    onChange={(e) => setCustomerInfo(e.target.value)}
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm bg-white"
                  />
                </div>

                {/* Items panier - scrollable */}
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
                        className="bg-white rounded-lg p-3 border border-orange-100"
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
                              className="w-6 h-6 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center text-xs hover:bg-orange-300"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                              className="w-6 h-6 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center text-xs hover:bg-orange-300"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <span className="text-orange-600 font-semibold text-sm">
                            {formatPrice(item.product.price * item.quantity)}
                          </span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {/* Footer panier - TOUJOURS VISIBLE ET FIXE EN BAS */}
                <div className="flex-shrink-0 p-4 border-t border-orange-200 space-y-3 bg-gradient-to-br from-yellow-50 to-amber-50">
                  {/* Mode de paiement */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Mode de paiement</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { value: 'cash', label: 'Espèces', icon: '💵' },
                        { value: 'card', label: 'Carte', icon: '💳' },
                        { value: 'mobile', label: 'Mobile', icon: '📱' }
                      ].map(method => (
                        <button
                          key={method.value}
                          onClick={() => setPaymentMethod(method.value as any)}
                          className={`p-1.5 text-xs rounded-lg border-2 transition-colors ${
                            paymentMethod === method.value
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-center">
                            <div className="text-base mb-0.5">{method.icon}</div>
                            <div className="text-xs">{method.label}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sélecteur serveur (mode simplifié uniquement) */}
                  {currentBar?.settings?.operatingMode === 'simplified' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                        <Users size={14} className="text-orange-500" />
                        Serveur
                      </label>
                      <select
                        value={selectedServer}
                        onChange={(e) => setSelectedServer(e.target.value)}
                        className="w-full px-3 py-2 border border-orange-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
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

                  {/* Total */}
                  <div className="bg-orange-100 rounded-lg p-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium text-sm">Total:</span>
                      <span className="text-orange-600 font-bold text-lg">{formatPrice(total)}</span>
                    </div>
                  </div>

                  {/* Bouton finaliser */}
                  <EnhancedButton
                    variant="success"
                    size="lg"
                    onClick={handleCheckout}
                    loading={isProcessing}
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