import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Zap, X, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PaymentMethod } from './cart/PaymentMethodSelector';
import { motion, AnimatePresence } from 'framer-motion';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { Product } from '../types';
import { useViewport } from '../hooks/useViewport';
import { ProductGrid } from './ProductGrid';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { useServerMappings } from '../hooks/useServerMappings';
import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useFilteredProducts } from '../hooks/useFilteredProducts';
import { Input } from './ui/Input';
import { useCart } from '../hooks/useCart';
import { CartDrawer } from './cart/CartDrawer';
// Components for Desktop Sidebar reconstruction
import { useTickets } from '../hooks/queries/useTickets';
import { TicketsService } from '../services/supabase/tickets.service';
import { CartShared } from './cart/CartShared';
import { CartFooter } from './cart/CartFooter';
import { SelectOption } from './ui/Select';
import { generateUUID } from '../utils/crypto'; // 🛡️ Fix Bug #11
import { ConfirmationModal } from './common/ConfirmationModal'; // 🛡️ Fix Bug #3


interface QuickSaleFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickSaleFlow({ isOpen, onClose }: QuickSaleFlowProps) {
  // --- HOOKS & CONTEXTS ---
  const { currentBar, isSimplifiedMode } = useBarContext();
  const { products, categories, getProductStockInfo } = useUnifiedStock(currentBar?.id);
  const { currentSession } = useAuth();
  const { isMobile } = useViewport();
  const { createSale } = useSalesMutations(currentBar?.id || '');
  const { formatPrice } = useCurrencyFormatter();

  // --- LOCAL STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // UX State
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false); // 🛡️ Fix Bug #3

  // Desktop Specific State (Simplified Mode)
  const [selectedServerDesktop, setSelectedServerDesktop] = useState('');
  const [paymentMethodDesktop, setPaymentMethodDesktop] = useState<PaymentMethod>('cash');
  const [selectedBonDesktop, setSelectedBonDesktop] = useState(''); // NEW: Bon support
  const [showSuccessDesktop, setShowSuccessDesktop] = useState(false);

  // --- TICKETS (BONS) ---
  const { tickets: ticketsWithSummary, refetchTickets } = useTickets(currentBar?.id);

  const handleCreateBon = async (tableNumber?: number, customerName?: string) => {
    if (!currentBar || !currentSession) return;
    try {
      let serverIdToAssign: string | undefined = undefined;

      if (selectedServerDesktop) {
        if (selectedServerDesktop.startsWith('Moi (')) {
          serverIdToAssign = currentSession.userId;
        } else {
          // Résolution de l'ID pour un serveur tiers en mode simplifié
          serverIdToAssign = (await ServerMappingsService.getUserIdForServerName(
            currentBar.id,
            selectedServerDesktop
          )) || undefined;
        }
      }

      const ticket = await TicketsService.createTicket(
        currentBar.id,
        currentSession.userId,
        undefined,
        serverIdToAssign,
        currentBar.closingHour,
        tableNumber,
        customerName
      );
      await refetchTickets();
      setSelectedBonDesktop(ticket.id);
      toast.success("Nouveau bon créé !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la création du bon");
    }
  };


  // --- NEW: USE CART HOOK (Local Mode) ---
  const {
    cart,           // raw items
    items,          // calculated items (with prices/promos)
    total,
    totalItems,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart
  } = useCart({ barId: currentBar?.id });

  // --- SEARCH & CATEGORY FILTER ---

  // 1. Enrich products with stock info FIRST
  const productsWithStock = products.map(product => {
    const stockInfo = getProductStockInfo(product.id);
    return {
      ...product,
      stock: stockInfo?.availableStock ?? 0
    };
  });

  // 2. Filter products based on search & category
  const filteredProducts = useFilteredProducts({
    products: productsWithStock,
    searchQuery: searchTerm,
    selectedCategory,
    onlyInStock: false
  });

  // --- CHECKOUT LOGIC ---
  const handleCheckout = useCallback(async (assignedServerName?: string, paymentMethod: PaymentMethod = 'cash', ticketId?: string) => {
    if (cart.length === 0 || !currentSession || !currentBar) return;

    // 1. Resolve Server ID (if Simplified Mode)
    let serverId: string | undefined;

    if (isSimplifiedMode && assignedServerName) {
      try {
        const serverNameToCheck = assignedServerName.startsWith('Moi (')
          ? (currentSession?.userName || assignedServerName)
          : assignedServerName;

        serverId = (await ServerMappingsService.getUserIdForServerName(
          currentBar.id,
          serverNameToCheck
        )) || undefined;

        if (!serverId) {
          toast.error(`Serveur inconnu: ${serverNameToCheck}`); // 🛡️ Fix Bug #2
          return;
        }
      } catch (e) {
        console.error(e);
        toast.error('Erreur lors de la résolution du serveur'); // 🛡️ Fix Bug #2
        return;
      }
    }

    try {
      // 2. Map items to SaleItem format (using calculated values from hook)
      const saleItems = items.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        original_unit_price: item.original_unit_price,
        discount_amount: item.discount_amount,
        promotion_id: item.promotion_id
      }));

      // 3. Create Sale
      await createSale.mutateAsync({
        barId: currentBar.id,
        items: saleItems,
        paymentMethod,
        serverId,
        ticketId: ticketId || undefined, // 🛡️ Fix: Liaison bon/ticket
        status: (currentSession.role === 'serveur') ? 'pending' : 'validated',
        notes: isSimplifiedMode ? `Serveur: ${assignedServerName}` : undefined,
        idempotencyKey: generateUUID() // 🛡️ Fix Bug #11 : Clé stable pour déduction stock optimiste
      });

      // 4. Success & Reset
      setShowSuccessDesktop(true); // For desktop visual feedback
      setTimeout(() => {
        setShowSuccessDesktop(false);
        clearCart();
        setSearchTerm('');
        setIsCartDrawerOpen(false); // Close mobile drawer if open
        if (isMobile) {
          // Optional: Close main modal on mobile? No, let user continue selling.
          // onClose();
        } else {
          setSelectedServerDesktop(''); // Reset server choice
          setSelectedBonDesktop(''); // Reset bon choice
        }
      }, 1000);

    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erreur vente'); // 🛡️ Fix Bug #2
    }
  }, [cart, items, currentSession, currentBar, isSimplifiedMode, createSale, clearCart, isMobile]);


  // --- HELPERS ---
  const handleAddToCart = (product: Product) => {
    // Stock check performed inside ProductCard via disabled state, 
    // but double check here doesn't hurt.
    const stockInfo = getProductStockInfo(product.id);
    if ((stockInfo?.availableStock ?? 0) <= 0) return;

    addToCart(product);
    setSearchTerm('');
    if (!isMobile) searchInputRef.current?.focus();
  };

  const { serverNames } = useServerMappings(isSimplifiedMode ? currentBar?.id : undefined);

  // Desktop Server Options
  const serverOptions: SelectOption[] = [
    { value: '', label: 'Sélectionner un serveur...' },
    ...(currentSession?.userName ? [{ value: `Moi (${currentSession.userName})`, label: `Moi (${currentSession.userName})` }] : []),
    ...serverNames.map(name => ({ value: name, label: name }))
  ];

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchTerm) setSearchTerm('');
        else if (cart.length > 0) {
          if (!showClearCartConfirm) setShowClearCartConfirm(true); // 🛡️ Fix Bug #3
        } else {
          onClose();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleCheckout(selectedServerDesktop, paymentMethodDesktop, selectedBonDesktop || undefined);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, searchTerm, cart, handleCheckout, selectedServerDesktop, paymentMethodDesktop, showClearCartConfirm]);


  if (!isOpen) return null;

  // ACCESS CHECK
  if (isSimplifiedMode && currentSession?.role === 'serveur') {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-0 sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gray-50 w-full h-full sm:h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-w-7xl mx-auto border border-gray-200"
          >
            {/* --- HEADER --- */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary/10 p-2 rounded-lg text-brand-primary">
                  <Zap size={20} fill="currentColor" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 leading-tight">Vente Rapide</h2>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            {/* --- BODY --- */}
            <div className="flex flex-1 overflow-hidden">

              {/* LEFT: PRODUCTS GRID (Expanded on Mobile) */}
              <div className="flex-1 flex flex-col min-w-0 bg-gray-50/50 relative">
                {/* Search Toolbar */}
                <div className="p-4 bg-white border-b border-gray-200 shadow-sm space-y-3 z-10">
                  <Input
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Rechercher (nom, volume)..."
                    leftIcon={<Search size={18} className="text-gray-400" />}
                    size="lg"
                  />

                  {/* Categories Pills */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${selectedCategory === 'all'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      Tout
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${selectedCategory === cat.id
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ backgroundColor: cat.color }}></span>
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid Content */}
                <div className="flex-1 overflow-y-auto p-4 pb-24">
                  <ProductGrid
                    products={filteredProducts}
                    onAddToCart={handleAddToCart}
                  />
                  {filteredProducts.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60 mt-10">
                      <Search size={48} strokeWidth={1} />
                      <p className="mt-2 font-medium">Aucun résultat</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: CART (Desktop Sidebar) */}
              {!isMobile && (
                <div className="w-[400px] border-l border-gray-200 bg-white flex flex-col shadow-xl z-20 shrink-0">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                      <ShoppingCart className="text-brand-primary" size={20} />
                      Panier
                      <span className="bg-brand-primary/10 text-brand-primary text-xs px-2 py-0.5 rounded-full">{totalItems}</span>
                    </h3>
                    {cart.length > 0 && (
                      <button
                        onClick={() => setShowClearCartConfirm(true)} // 🛡️ Fix Bug #3
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                    <CartShared
                      items={items}
                      onUpdateQuantity={updateQuantity}
                      onRemoveItem={removeFromCart}
                      variant="desktop"
                      showTotalReductions={true}
                      maxStockLookup={(id) => getProductStockInfo(id)?.availableStock ?? Infinity} // 🛡️ Fix Force Sale
                    />
                    {items.length === 0 && (
                      <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm">
                        <ShoppingCart size={32} className="opacity-20 mb-2" />
                        <p>Panier vide</p>
                      </div>
                    )}
                  </div>
                  {/* Footer Actions */}
                  <div className="p-4 border-t border-gray-100 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <CartFooter
                      total={total}
                      isSimplifiedMode={isSimplifiedMode}
                      serverOptions={serverOptions}
                      selectedServer={selectedServerDesktop}
                      onServerChange={setSelectedServerDesktop}
                      paymentMethod={paymentMethodDesktop}
                      onPaymentMethodChange={setPaymentMethodDesktop}

                      // BONS PROPS
                      bonOptions={[
                        { value: '', label: 'Aucun (Encaissement direct)' },
                        ...(ticketsWithSummary || []).map(t => ({
                          value: t.id,
                          label: `Table ${t.tableNumber || '?'} - ${t.customerName || 'Client'}`
                        }))
                      ]}
                      selectedBon={selectedBonDesktop}
                      onBonChange={setSelectedBonDesktop}
                      onCreateBon={handleCreateBon}

                      onCheckout={() => handleCheckout(selectedServerDesktop, paymentMethodDesktop, selectedBonDesktop || undefined)}
                      onClear={() => setShowClearCartConfirm(true)}
                      isLoading={createSale.isPending}
                      showSuccess={showSuccessDesktop}
                      hasItems={cart.length > 0}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* --- MOBILE FOOTER & DRAWER --- */}
            {isMobile && (
              <>
                {/* Access Bar */}
                <AnimatePresence>
                  {cart.length > 0 && (
                    <motion.div
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      exit={{ y: 100 }}
                      className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-30"
                    >
                      <button
                        onClick={() => setIsCartDrawerOpen(true)}
                        className="w-full bg-brand-gradient text-white h-14 rounded-xl font-bold flex justify-between px-6 items-center shadow-lg shadow-brand/30 active:scale-95 transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-white/20 px-3 py-1 rounded text-sm font-mono">{totalItems}</div>
                          <span className="text-sm uppercase tracking-wide opacity-90">Voir Panier</span>
                        </div>
                        <span className="text-xl font-mono">{formatPrice(total)}</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Drawer Overlay */}
                <CartDrawer
                  isOpen={isCartDrawerOpen}
                  onClose={() => setIsCartDrawerOpen(false)}
                  items={items}
                  total={total}
                  onUpdateQuantity={updateQuantity}
                  onRemoveItem={removeFromCart}
                  onClear={() => setShowClearCartConfirm(true)}
                  onCheckout={handleCheckout}
                  isSimplifiedMode={isSimplifiedMode}
                  serverNames={serverNames}
                  currentServerName={currentSession?.userName}
                  isLoading={createSale.isPending}
                  maxStockLookup={(id) => getProductStockInfo(id)?.availableStock ?? Infinity} // 🛡️ Fix Force Sale
                />
              </>
            )}

            {/* 🛡️ Fix Bug #3 : Confirmation Modal Integration */}
            <ConfirmationModal
              isOpen={showClearCartConfirm}
              onClose={() => setShowClearCartConfirm(false)}
              onConfirm={() => {
                clearCart();
                setShowClearCartConfirm(false);
              }}
              title="Vider le panier ?"
              message="Êtes-vous sûr de vouloir supprimer tous les articles du panier ? Cette action est irréversible."
              confirmLabel="Vider"
              isDestructive={true}
            />

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
