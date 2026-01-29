import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Minus, Plus, Info, ChevronRight, AlertTriangle, ChevronDown, ChevronUp, User as UserIcon, RotateCcw } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { useBarContext } from "../../context/BarContext";
import { useCurrencyFormatter } from "../../hooks/useBeninCurrency";
import { useFeedback } from "../../hooks/useFeedback";
import {
  User,
  Sale,
  SaleItem,
  ReturnReason,
  ReturnReasonConfig,
} from "../../types";
import { EnhancedButton } from "../EnhancedButton";
import { OtherReasonDialog } from "./OtherReasonDialog";
import { Textarea } from "../ui/Textarea";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { ReturnReasonSelector } from "./ReturnReasonSelector";
import { BackButton } from "../ui/BackButton";

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
  closeHour,
  consignments,
}: CreateReturnFormProps) {
  const { getReturnsBySale } = useAppContext();
  const { barMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { showError } = useFeedback();

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
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

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

  return (
    <>
      <OtherReasonDialog
        isOpen={showOtherReasonDialog}
        onConfirm={handleOtherReasonConfirm}
        onCancel={() => setShowOtherReasonDialog(false)}
      />

      <div className="space-y-6">
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!selectedSale ? (
              /* Étape 1 : Choix de la Vente */
              <motion.div
                key="step-sales"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">
                    1. Choisir la vente
                  </h3>
                </div>
                {/* Info Accordion "Processus de retour" - Fidèle à la capture */}
                <div className="mb-4">
                  <button
                    onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                    className="flex items-center gap-2 w-full p-3 bg-gray-50 text-gray-700 rounded-xl border border-gray-200 hover:border-brand-primary/30 transition-all group"
                  >
                    <AlertTriangle size={18} className="text-brand-primary" />
                    <span className="text-sm font-bold flex-1 text-left uppercase tracking-tight">Processus de retour</span>
                    {isInfoExpanded ? <ChevronUp size={16} className="text-brand-primary" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>

                  <AnimatePresence>
                    {isInfoExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 mt-2 bg-white border border-brand-primary/10 rounded-xl space-y-4 shadow-sm">
                          <div className="space-y-2 text-sm text-gray-600">
                            <p className="flex items-start gap-3">
                              <span className="font-black text-brand-primary">1.</span>
                              Sélectionnez la vente de la journée commerciale actuelle
                            </p>
                            <p className="flex items-start gap-3">
                              <span className="font-black text-brand-primary">2.</span>
                              Choisissez le produit à retourner et la quantité
                            </p>
                            <p className="flex items-start gap-3">
                              <span className="font-black text-brand-primary">3.</span>
                              Indiquez le motif du retour (défectueux, erreur, etc.)
                            </p>
                            <p className="flex items-start gap-3">
                              <span className="font-black text-brand-primary">4.</span>
                              Le stock sera automatiquement réapprovisionné selon le motif
                            </p>
                          </div>

                          <div className="pt-3 border-t border-gray-100 space-y-2">
                            <div className="flex items-center gap-2 text-gray-800 font-black text-[10px] uppercase tracking-wider">
                              <AlertTriangle size={14} className="text-brand-primary" />
                              Retours autorisés uniquement AVANT clôture caisse ({closeHour}h)
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed italic">
                              Votre bar ferme à {closeHour}h. Les retours ne peuvent être créés qu'avant cette heure.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Ventes de la journée commerciale actuelle
                    </label>
                    {sellersWithSales.length > 1 && (
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
                        className="text-sm"
                      />
                    )}
                  </div>

                  <div className="relative mb-3">
                    <Search
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Rechercher un produit (ex: Guinness)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all outline-none"
                    />
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
                          .slice(0, 2)
                          .map((i) => `${i.quantity}x ${i.product_name}`)
                          .join(", ");
                        const moreCount = sale.items.length - 2;

                        return (
                          <motion.button
                            key={sale.id}
                            onClick={() => returnCheck.allowed && onSelectSale(sale)}
                            whileHover={returnCheck.allowed ? { y: -2, scale: 1.01 } : {}}
                            disabled={!returnCheck.allowed}
                            className={`p-4 text-left rounded-2xl border-2 transition-all ${returnCheck.allowed
                              ? "border-brand-primary/10 bg-white hover:border-brand-primary/60 shadow-md hover:shadow-brand-subtle/20"
                              : "border-red-100 bg-red-50/50 opacity-50 cursor-not-allowed"
                              }`}
                          >
                            {/* Top Row: Server (Liquid Gold Gradient Text) and Time */}
                            <div className="flex items-center justify-between mb-3">
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

                            {/* Middle: Products (The Hero of this card for returns) */}
                            <div
                              className="text-sm text-gray-900 font-black line-clamp-2 mb-4 leading-relaxed bg-gray-50/30 p-2.5 rounded-lg border border-gray-100"
                              title={productPreview}
                            >
                              {productPreview}
                              {moreCount > 0 ? (
                                <span className="text-brand-primary/60 ml-1 font-bold">+{moreCount} articles</span>
                              ) : ""}
                            </div>

                            {/* Bottom: ID and Price + Prominent Gradient Arrow */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                #{sale.id.slice(-4).toUpperCase()}
                              </span>

                              {returnCheck.allowed ? (
                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] font-bold text-gray-500">
                                    {formatPrice(sale.total)}
                                  </span>
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center shadow-lg shadow-brand-primary/20 transform group-hover:translate-x-1 transition-transform"
                                    style={{ background: 'var(--brand-gradient)' }}
                                  >
                                    <ChevronRight size={18} className="text-white" />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-[9px] text-red-500 font-black uppercase tracking-tighter italic">
                                  <AlertTriangle size={10} />
                                  {returnCheck.reason}
                                </div>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                    showLabel={false}
                    className="glass-action-button-2026 w-11 h-11 rounded-xl shadow-sm hover:shadow-brand-subtle/40 transition-all border-none"
                  />
                  <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">2. Choisir le produit</h3>
                </div>

                {/* Selected Sale Recap - Liquid Gold Brand Style (Ancrage visuel) */}
                <div
                  className="text-white rounded-3xl p-6 shadow-xl shadow-brand-primary/20 flex justify-between items-center border border-white/20 relative overflow-hidden"
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  {/* Subtle shine effect */}
                  <div className="absolute top-0 left-0 w-full h-full bg-white/10 opacity-50 blur-xl -translate-y-1/2 pointer-events-none" />

                  <div className="relative z-10">
                    <p className="text-[10px] uppercase font-black text-white/70 tracking-widest mb-1.5">Vente sélectionnée</p>
                    <p className="text-sm font-black text-white uppercase tracking-tight">#{selectedSale.id.slice(-6).toUpperCase()}</p>
                  </div>
                  <div className="text-right relative z-10">
                    <p className="text-[10px] uppercase font-black text-white/70 tracking-widest mb-1.5">Total Payé</p>
                    <p className="text-2xl font-black text-white font-mono tracking-tighter">{formatPrice(selectedSale.total)}</p>
                  </div>
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
                        <motion.button
                          key={index}
                          onClick={() =>
                            !isFullyUnavailable && setSelectedProduct(item)
                          }
                          whileHover={!isFullyUnavailable ? { y: -2, scale: 1.01 } : {}}
                          disabled={isFullyUnavailable}
                          className={`w-full p-4 text-left rounded-2xl border-2 transition-all ${isFullyUnavailable
                            ? "border-gray-100 bg-gray-50/30 opacity-50 cursor-not-allowed"
                            : "border-brand-primary/10 bg-white hover:border-brand-primary shadow-md hover:shadow-brand-subtle/20"
                            }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
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

                            <div className="text-right flex items-center gap-3">
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-black text-gray-900 font-mono">
                                  {formatPrice(productPrice)}
                                </span>
                                {isFullyUnavailable && (
                                  <span className="text-[9px] text-red-500 font-black uppercase tracking-tighter italic">
                                    Déjà retourné
                                  </span>
                                )}
                              </div>
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-all ${isFullyUnavailable ? 'bg-gray-100 opacity-50' : 'shadow-brand-primary/20'}`}
                                style={!isFullyUnavailable ? { background: 'var(--brand-gradient)' } : {}}
                              >
                                <ChevronRight size={18} className={isFullyUnavailable ? 'text-gray-300' : 'text-white'} />
                              </div>
                            </div>
                          </div>
                        </motion.button>
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
                    showLabel={false}
                    className="glass-action-button-2026 w-11 h-11 rounded-xl shadow-sm hover:shadow-brand-subtle/40 transition-all border-none"
                  />
                  <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">3. Détails du retour</h3>
                </div>

                <div className="bg-white p-2 rounded-3xl border border-brand-primary/10 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                    {/* Left Column: Form Controls */}
                    <div className="lg:col-span-2 space-y-8 p-6 sm:p-8">
                      {/* Product Header in Form */}
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-brand-primary/5 flex items-center justify-center border border-brand-primary/10">
                          <span className="text-2xl">📦</span>
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

                    {/* Right Column: Premium 'Receipt' Ticket */}
                    <div className="lg:col-span-1 p-6 sm:p-8 bg-gray-50/30">
                      <div className="bg-white rounded-none relative shadow-2xl shadow-gray-200/50 flex flex-col min-h-[450px] border-x border-gray-100 pb-10">
                        {/* Serrated Top Edge (Visual trick) */}
                        <div className="absolute -top-1.5 left-0 w-full flex justify-around overflow-hidden px-1">
                          {[...Array(15)].map((_, i) => (
                            <div key={i} className="w-3 h-3 bg-white rotate-45 transform origin-bottom-left -translate-y-2 border-l border-t border-gray-100" />
                          ))}
                        </div>

                        <div className="p-6 pt-10 text-center border-b border-dashed border-gray-100 mx-4">
                          <div className="w-14 h-14 bg-brand-primary/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-primary/10">
                            <RotateCcw className="w-6 h-6 text-brand-primary" />
                          </div>
                          <h4 className="font-black text-gray-400 uppercase tracking-[0.3em] text-[9px] mb-1">Récapitulatif</h4>
                          <h3 className="text-xl font-black text-gray-900 uppercase">Validation</h3>
                        </div>

                        <div className="p-6 space-y-6 flex-1">
                          {/* Stock Logic Highlight */}
                          <div className="space-y-3">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Conséquence Stock</p>
                            <div className="bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/10 text-center">
                              <p className="text-[11px] text-brand-dark font-black uppercase leading-tight italic">
                                {reason === 'defective' && "Perte Sèche: Non restocké"}
                                {reason === 'wrong_item' && "Correction: Restokage Auto"}
                                {reason === 'customer_change' && "Retour Client: Restokage Auto"}
                                {reason === 'expired' && "Périmé: Perte Sèche"}
                                {reason === 'other' && "Audit Manuel Requis"}
                              </p>
                            </div>
                          </div>

                          {/* Key Data */}
                          <div className="space-y-4 pt-4 divider-y divide-gray-50 border-t border-gray-50">
                            <div className="flex justify-between items-center text-[11px] font-bold text-gray-500 uppercase tracking-tight">
                              <span>Quantité</span>
                              <span className="text-gray-900 font-black">{quantity}x</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-bold text-gray-500 uppercase tracking-tight">
                              <span>Unitaire</span>
                              <span className="text-gray-900 font-mono font-black">{formatPrice(selectedProduct.unit_price)}</span>
                            </div>
                          </div>

                          {/* Final Amount Block */}
                          <div className="mt-auto pt-6 border-t-2 border-brand-primary/10 text-center">
                            <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-2">Montant remboursé</p>
                            <div className="flex flex-col">
                              <span className="text-3xl font-black text-gray-900 font-mono tracking-tighter">
                                {formatPrice(quantity * selectedProduct.unit_price)}
                              </span>
                              <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Total Net Final</span>
                            </div>
                          </div>
                        </div>

                        {/* Confirm Button */}
                        <div className="px-6 space-y-4 shadow-[0_-20px_20px_-10px_rgba(255,255,255,0.8)] pt-4">
                          <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleSubmit}
                            disabled={!reason}
                            className="w-full py-4 rounded-2xl font-black text-white shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-xs overflow-hidden relative"
                            style={{ background: 'var(--brand-gradient)' }}
                          >
                            <RotateCcw size={18} />
                            Confirmer retour
                          </motion.button>

                          <button
                            onClick={onCancel}
                            className="w-full py-2 text-gray-400 font-black text-[9px] uppercase tracking-[0.3em] hover:text-red-500 transition-colors"
                          >
                            Abandonner
                          </button>
                        </div>

                        {/* Serrated Bottom Edge (Visual trick) shadow-inner-inverted */}
                        <div className="absolute -bottom-1.5 left-0 w-full flex justify-around overflow-hidden px-1">
                          {[...Array(15)].map((_, i) => (
                            <div key={i} className="w-3 h-3 bg-white rotate-45 transform origin-top-left translate-y-2 border-r border-b border-gray-100" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
