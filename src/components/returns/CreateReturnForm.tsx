import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FormStepper } from "../ui/FormStepper";
import { Search, Minus, Plus, User as UserIcon, RotateCcw } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { Product } from "../../types";
import { SwapProductSelector } from "./SwapProductSelector";
import { useBarContext } from "../../context/BarContext";
import { useCurrencyFormatter } from "../../hooks/useBeninCurrency";
import { useFeedback } from "../../hooks/useFeedback";
import { useViewport } from "../../hooks/useViewport";
import { useUnifiedStock } from "../../hooks/pivots/useUnifiedStock";
import {
  User,
  Sale,
  SaleItem,
  ReturnReason,
  ReturnReasonConfig,
  type Consignment,
  type Return,
} from "../../types";
import type { UnifiedReturn } from "../../hooks/pivots/useUnifiedReturns";
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
  consignments: Consignment[];
  getReturnsBySale: (saleId: string) => Array<Return | UnifiedReturn>;
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
  getReturnsBySale,
}: CreateReturnFormProps) {
  const { currentBar } = useBarContext();
  const { products } = useUnifiedStock(currentBar?.id);
  const { provideExchange } = useAppContext();
  const { barMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { showError, showSuccess } = useFeedback();
  const { isMobile } = useViewport();

  const users: User[] = barMembers
    .map((m) => m.user)
    .filter((u): u is User => u !== undefined);

  const [selectedProduct, setSelectedProduct] = useState<SaleItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason>("wrong_item");
  const [notes, setNotes] = useState("");
  const [showOtherReasonDialog, setShowOtherReasonDialog] = useState(false);
  const [filterSeller, setFilterSeller] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [swapProduct, setSwapProduct] = useState<Product | null>(null);
  const [isSelectingSwapProduct, setIsSelectingSwapProduct] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // 🛡️ Verrouillage UI


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
    if (!selectedSale || !selectedProduct || isSubmitting) return;

    const productId = selectedProduct.product_id;
    if (!productId) {
      showError("Produit invalide");
      return;
    }

    if (reason === "other") {
      setShowOtherReasonDialog(true);
      return;
    }

    // ✨ Échange Produit : Si échange mais pas encore de produit choisi
    if (reason === "exchange" && !swapProduct) {
      setIsSelectingSwapProduct(true);
      return;
    }

    if (reason === "exchange" && swapProduct) {
      console.log('[CreateReturnForm] 🔄 EXCHANGE FLOW STARTED', {
        selectedSale: selectedSale.id,
        selectedProduct: selectedProduct.product_id,
        swapProduct: swapProduct.id,
        quantity,
        reason
      });

      setIsSubmitting(true); // 🛡️ Verrouillage
      try {
        console.log('[CreateReturnForm] Calling provideExchange...');
        await provideExchange({
          saleId: selectedSale.id,
          productId: selectedProduct.product_id,
          productName: selectedProduct.product_name,
          productVolume: selectedProduct.product_volume || "",
          quantitySold: selectedProduct.quantity,
          quantityReturned: quantity,
          reason: "exchange",
          notes: notes || undefined,
          returnedAt: new Date(),
          refundAmount: quantity * selectedProduct.unit_price,
          isRefunded: false,
          autoRestock: true,
          manualRestockRequired: false,
        }, swapProduct, selectedSale.ticketId || (selectedSale as Sale & { ticket_id?: string }).ticket_id); // ✅ Pass ticketId for chaining
        console.log('[CreateReturnForm] ✅ Exchange SUCCESS');
        showSuccess("✨ Échange Produit effectué avec succès !");
        onCancel(); // Close form on success
      } catch (err) {
        console.error('[CreateReturnForm] ❌ Exchange FAILED:', err);
        console.error('[CreateReturnForm] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
        showError("Erreur lors de l'échange. Veuillez réessayer.");
        // Ne PAS fermer le formulaire pour permettre une nouvelle tentative
      } finally {
        setIsSubmitting(false); // 🛡️ Déverrouillage
        console.log('[CreateReturnForm] Exchange flow ended');
      }
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
      <AnimatePresence>
        {isSelectingSwapProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[1000] bg-gray-900/50 p-4 sm:p-8 flex items-center justify-center"
          >
            <div className="w-full max-w-4xl h-[80vh]">
              <SwapProductSelector
                onSelect={(product) => {
                  setSwapProduct(product);
                  setIsSelectingSwapProduct(false);
                }}
                onCancel={() => setIsSelectingSwapProduct(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <h3 className="text-h3 text-foreground">1. Sélectionner une vente</h3>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder={isMobile ? "Rechercher vente ou produit" : "Rechercher une vente ou un produit…"}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input-token w-full pl-9 pr-3 h-11 border border-border rounded-xl bg-muted focus:bg-card text-body-sm"
                    />
                  </div>

                  {sellersWithSales.length > 1 && (
                    <div className="w-full sm:w-56">
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
                        className="bg-muted border-border h-11 rounded-xl text-body-sm text-foreground"
                      />
                    </div>
                  )}
                </div>

                {filteredSales.length === 0 ? (
                  <div className="text-center py-10 bg-muted rounded-xl border border-dashed border-border">
                    <p className="text-body-sm text-muted-foreground">
                      {returnableSales.length === 0
                        ? "Aucune vente dans la journée commerciale actuelle"
                        : "Aucune vente trouvée"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
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
                          <div className="space-y-2.5">
                            {/* Top Row: Server & Time */}
                            <div className="flex items-center justify-between gap-2">
                              {serverUser ? (
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-full bg-brand-subtle flex items-center justify-center flex-shrink-0">
                                    <UserIcon size={12} className="text-brand-primary" />
                                  </div>
                                  <span className="text-caption font-semibold text-brand-primary truncate">
                                    {serverUser.name}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-caption text-muted-foreground">Vendeur inconnu</div>
                              )}
                              <span className="text-micro text-muted-foreground tabular-nums flex-shrink-0">
                                {new Date(
                                  sale.validatedAt || sale.createdAt,
                                ).toLocaleTimeString("fr-FR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {/* Middle: Product List */}
                            <div
                              className="text-caption text-foreground/80 font-medium line-clamp-2 leading-relaxed bg-muted p-2.5 rounded-lg border border-border"
                              title={productPreview}
                            >
                              {productPreview}
                            </div>

                            {/* Bottom: ID & Price */}
                            <div className="flex items-center justify-between pt-0.5">
                              <span className="text-micro text-muted-foreground">
                                #{sale.id.slice(-4).toUpperCase()}
                              </span>
                              <span className="text-caption font-semibold text-foreground tabular-nums">
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <div className="flex items-center gap-3">
                  <BackButton
                    onClick={() => {
                      onSelectSale(null);
                      setSelectedProduct(null);
                    }}
                  />
                  <h3 className="text-h3 text-foreground">2. Choisir le produit</h3>
                </div>

                <div className="space-y-3">
                  <label className="block text-micro text-muted-foreground">
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
                            <span className="text-body-sm font-semibold text-foreground tabular-nums">
                              {formatPrice(productPrice)}
                            </span>
                          }
                        >
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-body-sm font-semibold text-foreground">
                                {productName}
                              </span>
                              {productVolume && (
                                <span className="text-micro text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {productVolume}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-caption">
                              <span className="text-muted-foreground">Disponible</span>
                              <span className="font-semibold text-brand-primary tabular-nums">{available}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground">Vendu <span className="font-medium text-foreground/70 tabular-nums">{item.quantity}</span></span>
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <div className="flex items-center gap-3">
                  <BackButton onClick={() => setSelectedProduct(null)} />
                  <h3 className="text-h3 text-foreground">3. Détails du retour</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  {/* Left Column: Form Controls */}
                  <div className="lg:col-span-2 space-y-6 p-5 sm:p-6 bg-card rounded-2xl border border-border shadow-sm">
                    {/* Product Header */}
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center border border-border overflow-hidden flex-shrink-0">
                        {products.find(p => p.id === selectedProduct.product_id)?.image ? (
                          <img
                            src={products.find(p => p.id === selectedProduct.product_id)?.image}
                            alt={selectedProduct.product_name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-xl">📦</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-micro text-muted-foreground">Article à traiter</p>
                        <h4 className="text-body-sm font-semibold text-foreground truncate">
                          {selectedProduct.product_name}
                        </h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      {/* 1. Quantity Selector */}
                      <div>
                        <Label className="text-micro text-muted-foreground mb-3 block">
                          1. Quantité à retourner
                        </Label>
                        <div className="flex items-center gap-5">
                          <div className="flex items-center gap-2 bg-muted p-1.5 rounded-full border border-border">
                            <button
                              type="button"
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                              className="w-10 h-10 flex items-center justify-center bg-card rounded-full text-foreground/80 hover:text-brand-primary hover:border-brand-primary border border-border transition-colors disabled:opacity-30 disabled:hover:text-foreground/80 disabled:hover:border-border"
                              disabled={quantity <= 1}
                            >
                              <Minus size={16} />
                            </button>

                            <div className="w-14 text-center select-none">
                              <span className="text-h2 font-semibold text-foreground tabular-nums">
                                {quantity}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setQuantity(Math.min(availableQty, quantity + 1))}
                              className="w-10 h-10 flex items-center justify-center bg-card rounded-full text-foreground/80 hover:text-brand-primary hover:border-brand-primary border border-border transition-colors disabled:opacity-30 disabled:hover:text-foreground/80 disabled:hover:border-border"
                              disabled={quantity >= availableQty}
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <div className="hidden sm:flex flex-col">
                            <span className="text-micro text-muted-foreground">Capacité</span>
                            <span className="text-caption font-medium text-foreground/80 tabular-nums">{availableQty} unités</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Reason Selector */}
                      <div>
                        <Label className="text-micro text-muted-foreground mb-3 block">
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
                        <Label htmlFor="returnNotes" className="text-micro text-muted-foreground mb-2 block">
                          3. Précisions (optionnel)
                        </Label>
                        <Textarea
                          id="returnNotes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="rounded-xl border-border focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 text-body-sm text-foreground placeholder:text-muted-foreground bg-muted focus:bg-card transition-colors resize-none outline-none"
                          placeholder="Ex : bouteille cassée, erreur de saisie…"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Summary Panel */}
                  <div className="lg:col-span-1 p-6 bg-card rounded-2xl border border-border shadow-sm relative flex flex-col justify-between min-h-[480px]">
                    {/* Accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary rounded-l-2xl" />

                    <div className="space-y-6">
                      <div>
                        <h4 className="text-micro text-muted-foreground mb-4">Validation finale</h4>

                        <div className="space-y-3 bg-muted p-4 rounded-xl border border-border">
                          <div className="flex justify-between items-center">
                            <span className="text-caption text-muted-foreground">Quantité</span>
                            <span className="text-body-sm font-semibold text-foreground tabular-nums">{quantity} unités</span>
                          </div>

                          {reason === 'exchange' && (
                            <div className="pt-4 mt-1 border-t border-border" data-guide="returns-exchange-summary">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-micro text-brand-primary">Flux échange produit</span>
                                <div className="px-2 py-0.5 bg-brand-subtle rounded-full text-micro font-semibold text-brand-primary">
                                  Premium
                                </div>
                              </div>

                              {swapProduct ? (
                                <div className="bg-card p-4 rounded-xl border border-brand-subtle">
                                  <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-micro text-muted-foreground">Article de remplacement</span>
                                        <span className="text-body-sm font-semibold text-foreground truncate">{swapProduct.name}</span>
                                      </div>
                                      <span className="text-body-sm font-semibold text-brand-primary tabular-nums bg-brand-subtle px-2 py-0.5 rounded-lg flex-shrink-0">
                                        {formatPrice(swapProduct.price)}
                                      </span>
                                    </div>

                                    <button
                                      onClick={() => setIsSelectingSwapProduct(true)}
                                      className="flex items-center gap-1.5 text-caption font-medium text-brand-primary hover:underline w-fit"
                                    >
                                      <RotateCcw size={11} />
                                      Changer l'article
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setIsSelectingSwapProduct(true)}
                                  className="w-full flex flex-col items-center justify-center py-6 px-5 rounded-xl border border-dashed border-brand-subtle bg-card hover:bg-brand-subtle/30 hover:border-brand-primary transition-colors"
                                >
                                  <div className="w-10 h-10 rounded-full bg-brand-subtle flex items-center justify-center text-brand-primary mb-2">
                                    <Plus size={18} />
                                  </div>
                                  <span className="text-body-sm font-semibold text-foreground">Choisir l'article</span>
                                  <p className="text-caption text-muted-foreground mt-0.5 text-center">L'ancien produit est remis en stock automatiquement</p>
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <span className="text-caption text-muted-foreground">Prix unitaire d'origine</span>
                            <span className="text-body-sm font-medium text-foreground/80 tabular-nums">{formatPrice(selectedProduct.unit_price)}</span>
                          </div>

                          <div className="pt-4 border-t border-border flex flex-col items-end gap-1">
                            {reason === 'exchange' && swapProduct ? (
                              <>
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${(swapProduct.price - selectedProduct.unit_price) > 0 ? "bg-amber-500" : (swapProduct.price - selectedProduct.unit_price) < 0 ? "bg-emerald-500" : "bg-gray-400"}`} />
                                  <span className="text-micro text-muted-foreground">Écart à régulariser</span>
                                </div>
                                <div className="flex flex-col items-end gap-1.5">
                                  <span className={`text-h2 font-semibold tabular-nums leading-none ${(swapProduct.price - selectedProduct.unit_price) > 0 ? "text-amber-600" : (swapProduct.price - selectedProduct.unit_price) < 0 ? "text-emerald-600" : "text-foreground"}`}>
                                    {formatPrice(quantity * (swapProduct.price - selectedProduct.unit_price))}
                                  </span>
                                  <p className="text-caption text-muted-foreground bg-card px-2 py-1 rounded-lg border border-border">
                                    {(swapProduct.price - selectedProduct.unit_price) > 0
                                      ? "Le client doit verser l'écart"
                                      : (swapProduct.price - selectedProduct.unit_price) < 0
                                        ? "Rembourser la différence au client"
                                        : "Échange à valeur égale, pas de flux"}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="text-micro text-brand-primary mb-1">Total à rembourser</span>
                                <span className="text-h1 font-semibold text-foreground tabular-nums">
                                  {formatPrice(quantity * selectedProduct.unit_price)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-micro text-muted-foreground mb-2">Impact inventaire</p>
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${reason === 'defective' || reason === 'expired'
                          ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900/50"
                          : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/50"
                          }`}>
                          <span className="text-base">
                            {reason === 'defective' || reason === 'expired' ? "⚠️" : "🔄"}
                          </span>
                          <span className="text-caption font-medium leading-tight">
                            {reason === 'defective' && "Perte — pas de remise en stock"}
                            {reason === 'wrong_item' && "Correction — remis en stock"}
                            {reason === 'customer_change' && "Client — remis en stock"}
                            {reason === 'expired' && "Périmé — pas de remise en stock"}
                            {reason === 'exchange' && "Échange — remis en stock"}
                            {reason === 'other' && "Audit requis"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-6">
                      <button
                        onClick={handleSubmit}
                        disabled={!reason || (reason === 'exchange' && !swapProduct) || isSubmitting}
                        className="btn-brand w-full h-11 rounded-xl text-body-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCcw size={16} />
                        {reason === 'exchange' ? "Finaliser l'échange" : "Confirmer le retour"}
                      </button>

                      <button
                        onClick={onCancel}
                        className="w-full py-2 text-caption text-muted-foreground hover:text-foreground/70 transition-colors"
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
