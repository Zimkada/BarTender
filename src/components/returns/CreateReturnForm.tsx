import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FormStepper } from "../ui/FormStepper";
import { Search, Minus, Plus, User as UserIcon, RotateCcw } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { useBarContext } from "../../context/BarContext";
import { useCurrencyFormatter } from "../../hooks/useBeninCurrency";
import { useFeedback } from "../../hooks/useFeedback";
import { useViewport } from "../../hooks/useViewport";
import {
  User,
  Sale,
  SaleItem,
  ReturnReason,
  ReturnReasonConfig,
} from "../../types";
import { OtherReasonDialog } from "./OtherReasonDialog";
import { Textarea } from "../ui/Textarea";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { ReturnReasonSelector } from "./ReturnReasonSelector";
import { BackButton } from "../ui/BackButton";
import { SelectionCard } from "../ui/SelectionCard";

interface CreateReturnFormProps {
  returnableSales: Sale[];
  returnReasons: Record<ReturnReason, ReturnReasonConfig>;
  onCreateReturn: (
    saleId: string,
    productId: string,
    quantity: number,
    reason: ReturnReason,
    notes?: string,
    customRefund?: boolean,
    customRestock?: boolean,
  ) => Promise<void> | void;
  onCancel: () => void;
  selectedSale: Sale | null;
  onSelectSale: (sale: Sale | null) => void;
  canReturnSale: (sale: Sale) => { allowed: boolean; reason: string };
  closeHour: number;
  consignments: any[];
}

export function CreateReturnForm({
  returnableSales,
  returnReasons,
  onCreateReturn,
  onCancel,
  selectedSale,
  onSelectSale,
  canReturnSale,

  consignments,
}: CreateReturnFormProps) {
  const { getReturnsBySale, products } = useAppContext();
  const { barMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { showError } = useFeedback();
  const { isMobile } = useViewport();

  const users: User[] = barMembers
    .map((m) => m.user)
    .filter((u): u is User => u !== undefined);

  const [selectedProduct, setSelectedProduct] = useState<SaleItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason>("defective");
  const [notes, setNotes] = useState("");
  const [showOtherReasonDialog, setShowOtherReasonDialog] = useState(false);
  const [filterSeller, setFilterSeller] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");


  const getAlreadyReturned = (productId: string): number => {
    if (!selectedSale) return 0;
    return getReturnsBySale(selectedSale.id)
      .filter((r) => r.productId === productId && r.status !== "rejected")
      .reduce((sum, r) => sum + r.quantityReturned, 0);
  };

  const getAlreadyConsigned = (productId: string): number => {
    if (!selectedSale) return 0;
    return consignments
      .filter(
        (c) =>
          c.saleId === selectedSale.id &&
          c.productId === productId &&
          c.status === "active",
      )
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  const availableQty = selectedProduct
    ? (() => {
      const productId = selectedProduct.product_id;
      if (!productId) return 0;
      return (
        selectedProduct.quantity -
        getAlreadyReturned(productId) -
        getAlreadyConsigned(productId)
      );
    })()
    : 0;

  const filteredSales = useMemo(() => {
    let filtered = returnableSales;

    if (filterSeller !== "all") {
      filtered = filtered.filter((sale) => sale.soldBy === filterSeller);
    }

    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase();
      filtered = filtered.filter((sale) =>
        sale.items.some((item) =>
          item.product_name.toLowerCase().includes(lowerTerm),
        ),
      );
    }

    return filtered.sort((a, b) => {
      const dateA = new Date(a.validatedAt || a.createdAt);
      const dateB = new Date(b.validatedAt || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [returnableSales, filterSeller, searchTerm]);

  const sellersWithSales = useMemo(() => {
    if (!Array.isArray(returnableSales) || !Array.isArray(users)) return [];
    const serverIds = new Set(
      returnableSales.map((sale) => sale.soldBy).filter(Boolean),
    );
    return users.filter((user) => serverIds.has(user.id));
  }, [returnableSales, users]);

  const handleSubmit = async () => {
    if (!selectedSale || !selectedProduct) return;

    const productId = selectedProduct.product_id;
    if (!productId) {
      showError("Produit invalide");
      return;
    }

    if (reason === "other") {
      setShowOtherReasonDialog(true);
      return;
    }

    await onCreateReturn(
      selectedSale.id,
      productId,
      quantity,
      reason,
      notes || undefined,
    );
  };

  const handleOtherReasonConfirm = async (
    customRefund: boolean,
    customRestock: boolean,
    customNotes: string,
  ) => {
    if (!selectedSale || !selectedProduct) return;

    const productId = selectedProduct.product_id;
    if (!productId) {
      showError("Produit invalide");
      return;
    }

    setShowOtherReasonDialog(false);
    await onCreateReturn(
      selectedSale.id,
      productId,
      quantity,
      reason,
      customNotes,
      customRefund,
      customRestock,
    );
  };

  const currentStep = !selectedSale ? 1 : !selectedProduct ? 2 : 3;

  return (
    <>
      <OtherReasonDialog
        isOpen={showOtherReasonDialog}
        onConfirm={handleOtherReasonConfirm}
        onCancel={() => setShowOtherReasonDialog(false)}
      />

      <div className="flex flex-col h-full">
        <FormStepper
          steps={[
            { label: "Choix Vente" },
            { label: "Choix Produit" },
            { label: "Validation" }
          ]}
          currentStep={currentStep}
        />

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!selectedSale ? (
              /* Étape 1 : Choix de la Vente */
              <motion.div
                key="step-sales"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">
                    1. Sélectionner une vente
                  </h3>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10"
                      size={16}
                      strokeWidth={2.5}
                    />
                    <input
                      type="text"
                      placeholder={isMobile ? "Rechercher vente ou produit" : "Rechercher une vente ou un produit..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 h-11 border border-gray-200 rounded-xl bg-white text-sm focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all outline-none"
                    />
                  </div>

                  {sellersWithSales.length > 1 && (
                    <div className="w-full sm:w-64">
                      <Select
                        options={[
                          { value: "all", label: "Tous les vendeurs" },
                          ...sellersWithSales.map((seller) => ({
                            value: seller.id,
                            label: seller.name,
                          })),
                        ]}
                        value={filterSeller}
                        onChange={(e) => setFilterSeller(e.target.value)}
                        className="bg-white border-gray-200 h-11 rounded-xl text-sm"
                      />
                    </div>
                  )}
                </div>

                {filteredSales.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <p className="text-gray-500">
                      {returnableSales.length === 0
                        ? "Aucune vente dans la journée commerciale actuelle"
                        : "Aucune vente trouvée"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
                    {filteredSales.map((sale) => {
                      const returnCheck = canReturnSale(sale);
                      const serverUserId = sale.soldBy;
                      const serverUser = serverUserId
                        ? users.find((u) => u.id === serverUserId)
                        : undefined;
                      const productPreview = sale.items
                        .map((i) => `${i.quantity}x ${i.product_name}`)
                        .join(", ");

                      return (
                        <SelectionCard
                          key={sale.id}
                          onClick={() => returnCheck.allowed && onSelectSale(sale)}
                          status={returnCheck.allowed ? 'default' : 'error'}
                          statusText={!returnCheck.allowed ? returnCheck.reason : undefined}

                          className="group"
                        >
                          <div className="space-y-3">
                            {/* Top Row: Server & Time */}
                            <div className="flex items-center justify-between">
                              {serverUser ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
                                    <UserIcon size={12} className="text-brand-primary" />
                                  </div>
                                  <span
                                    className="font-black text-xs uppercase tracking-tight"
                                    style={{
                                      background: 'var(--brand-gradient)',
                                      WebkitBackgroundClip: 'text',
                                      WebkitTextFillColor: 'transparent'
                                    }}
                                  >
                                    {serverUser.name}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs font-bold text-gray-400">Vendeur inconnu</div>
                              )}
                              <span className="text-[10px] font-bold text-gray-400">
                                {new Date(
                                  sale.validatedAt || sale.createdAt,
                                ).toLocaleTimeString("fr-FR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {/* Middle: Returns Hero - Product List */}
                            <div
                              className="text-xs text-gray-900 font-black line-clamp-2 leading-relaxed bg-gray-50/30 p-2.5 rounded-lg border border-gray-100"
                              title={productPreview}
                            >
                              {productPreview}
                            </div>

                            {/* Bottom: ID & Price */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                #{sale.id.slice(-4).toUpperCase()}
                              </span>
                              <span className="text-[11px] font-bold text-gray-900">
                                {formatPrice(sale.total)}
                              </span>
                            </div>
                          </div>
                        </SelectionCard>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : !selectedProduct ? (
              /* Étape 2 : Choix du Produit dans la vente */
              <motion.div
                key="step-products"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3">
                  <BackButton
                    onClick={() => {
                      onSelectSale(null);
                      setSelectedProduct(null);
                    }}
                  />
                  <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">2. Choisir le produit</h3>
                </div>



                <div className="space-y-2">

                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Sélectionner un produit à retourner
                  </label>
                  <div className="space-y-2">
                    {selectedSale.items.map((item: SaleItem, index: number) => {
                      const productId = item.product_id;
                      const productName = item.product_name;
                      const productVolume = item.product_volume || "";
                      const productPrice = item.unit_price;

                      const alreadyReturned = getAlreadyReturned(productId);
                      const alreadyConsigned = getAlreadyConsigned(productId);
                      const available =
                        item.quantity - alreadyReturned - alreadyConsigned;
                      const isFullyUnavailable = available <= 0;

                      return (
                        <SelectionCard
                          key={index}
                          onClick={() =>
                            !isFullyUnavailable && setSelectedProduct(item)
                          }
                          status={isFullyUnavailable ? 'disabled' : 'default'}
                          statusText={isFullyUnavailable ? 'Déjà retourné' : undefined}
                          priceDisplay={
                            <span className="text-sm font-black text-gray-900 font-mono">
                              {formatPrice(productPrice)}
                            </span>
                          }
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-black text-gray-900 text-sm tracking-tight uppercase">
                                {productName}
                              </span>
                              {productVolume && (
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                  {productVolume}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Dispo:</span>
                                <span
                                  className="text-xs font-black"
                                  style={{
                                    background: 'var(--brand-gradient)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent'
                                  }}
                                >
                                  {available}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-300 font-medium">|</span>
                              <span className="text-[10px] text-gray-400 font-bold uppercase">
                                Vendu: {item.quantity}
                              </span>
                            </div>
                          </div>
                        </SelectionCard>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Étape 3 : Configuration du retour */
              <motion.div
                key="step-details"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3">
                  <BackButton
                    onClick={() => setSelectedProduct(null)}
                  />
                  <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">3. Détails du retour</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  {/* Left Column: Form Controls Card */}
                  <div className="lg:col-span-2 space-y-8 p-6 sm:p-8 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    {/* Product Header in Card */}
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden flex-shrink-0">
                        {products.find(p => p.id === selectedProduct.product_id)?.image ? (
                          <img
                            src={products.find(p => p.id === selectedProduct.product_id)?.image}
                            alt={selectedProduct.product_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl">📦</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest leading-none mb-1">Article à traiter</p>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                          {selectedProduct.product_name}
                        </h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      {/* 1. Quantity Selector */}
                      <div>
                        <Label className="text-[10px] uppercase font-black text-gray-400 mb-4 block tracking-[0.2em]">
                          1. Quantité à retourner
                        </Label>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-3 bg-white p-2 rounded-[2.5rem] border-2 border-brand-primary/10 shadow-xl shadow-brand-primary/5">
                            <button
                              type="button"
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                              className="w-12 h-12 flex items-center justify-center bg-black rounded-full text-white hover:bg-brand-primary transition-all active:scale-90 shadow-lg disabled:opacity-20 border-none"
                              disabled={quantity <= 1}
                            >
                              <Minus size={22} strokeWidth={4} />
                            </button>

                            <div className="w-20 text-center select-none">
                              <span
                                className="text-4xl font-black font-mono tracking-tighter block"
                                style={{
                                  background: 'var(--brand-gradient)',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  filter: 'drop-shadow(0 2px 4px rgba(var(--brand-rgb), 0.15))'
                                }}
                              >
                                {quantity}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setQuantity(Math.min(availableQty, quantity + 1))}
                              className="w-12 h-12 flex items-center justify-center bg-black rounded-full text-white hover:bg-brand-primary transition-all active:scale-90 shadow-lg disabled:opacity-20 border-none"
                              disabled={quantity >= availableQty}
                            >
                              <Plus size={22} strokeWidth={4} />
                            </button>
                          </div>

                          <div className="hidden sm:flex flex-col">
                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Capacité</span>
                            <span className="text-xs font-black text-gray-500 uppercase">{availableQty} unités</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Reason Selector */}
                      <div>
                        <Label className="text-[10px] uppercase font-black text-gray-400 mb-4 block tracking-[0.2em]">
                          2. Motif du retour
                        </Label>
                        <ReturnReasonSelector
                          reasons={returnReasons}
                          selectedReason={reason}
                          onSelect={(r) => setReason(r)}
                        />
                      </div>

                      {/* 3. Notes */}
                      <div>
                        <Label htmlFor="returnNotes" className="text-[10px] uppercase font-black text-gray-400 mb-3 block tracking-[0.2em]">
                          3. Précisions (Optionnel)
                        </Label>
                        <Textarea
                          id="returnNotes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="rounded-2xl border-brand-primary/10 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/5 text-sm bg-gray-50/50 focus:bg-white transition-all resize-none shadow-none outline-none"
                          placeholder="Ex: Bouteille cassée, erreur de saisie..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Modern Summary Panel as a Floating Card */}
                  <div className="lg:col-span-1 p-8 bg-white rounded-3xl border border-brand-primary/20 shadow-xl shadow-brand-primary/5 relative overflow-hidden flex flex-col justify-between min-h-[500px]">
                    {/* Elite Accent Bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary" />

                    <div className="space-y-8 relative z-10">
                      <div>
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6">Validation Finale</h4>

                        <div className="space-y-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Quantité</span>
                            <span className="font-black text-gray-900">{quantity} unités</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Unitaire</span>
                            <span className="font-mono font-black text-gray-900">{formatPrice(selectedProduct.unit_price)}</span>
                          </div>
                          <div className="pt-4 border-t border-gray-200/50 flex flex-col items-end">
                            <span className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">Total à rembourser</span>
                            <span className="text-3xl font-black text-gray-900 font-mono tracking-tighter">
                              {formatPrice(quantity * selectedProduct.unit_price)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Impact Inventaire</p>
                        <div className={`flex items-center gap-3 p-4 rounded-2xl border ${reason === 'defective' || reason === 'expired'
                          ? "bg-red-50 text-red-600 border-red-100"
                          : "bg-emerald-50 text-emerald-600 border-emerald-100"
                          }`}>
                          <span className="text-xl">
                            {reason === 'defective' || reason === 'expired' ? "⚠️" : "🔄"}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-tight leading-tight">
                            {reason === 'defective' && "Perte: Pas de remise en stock"}
                            {reason === 'wrong_item' && "Correction: Remis en stock"}
                            {reason === 'customer_change' && "Client: Remis en stock"}
                            {reason === 'expired' && "Périmé: Pas de remise en stock"}
                            {reason === 'other' && "Audit requis"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-8 relative z-10">
                      <motion.button
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSubmit}
                        disabled={!reason}
                        className="w-full py-4 rounded-2xl font-black text-white shadow-xl shadow-brand-primary/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-xs"
                        style={{ background: 'var(--brand-gradient)' }}
                      >
                        <RotateCcw size={18} strokeWidth={3} />
                        Confirmer le retour
                      </motion.button>

                      <button
                        onClick={onCancel}
                        className="w-full py-2 text-gray-400 font-black text-[9px] uppercase tracking-[0.3em] hover:text-red-500 transition-colors"
                      >
                        Annuler l'opération
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div >
    </>
  );
}
