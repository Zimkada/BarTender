import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Minus, Plus, Info, ChevronRight, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
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
        <div className="flex items-center gap-3">
          <BackButton
            onClick={onCancel}
            showLabel={false}
            title="Retour à la liste"
          />
          <h2 className="text-lg font-bold text-gray-800 tracking-tight">
            Créer un nouveau retour
          </h2>
        </div>

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
                {/* Info Accordion "Processus de retour" - Fidèle à la capture */}
                <div className="mb-4">
                  <button
                    onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                    className="flex items-center gap-2 w-full p-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-200/50 hover:bg-blue-100 transition-colors group"
                  >
                    <AlertTriangle size={18} className="text-blue-600" />
                    <span className="text-sm font-bold flex-1 text-left">Processus de retour</span>
                    {isInfoExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  <AnimatePresence>
                    {isInfoExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 mt-2 bg-white border border-blue-100 rounded-xl space-y-4 shadow-sm">
                          <div className="space-y-2 text-sm text-blue-900/80">
                            <p className="flex items-start gap-3">
                              <span className="font-bold text-blue-600">1.</span>
                              Sélectionnez la vente de la journée commerciale actuelle
                            </p>
                            <p className="flex items-start gap-3">
                              <span className="font-bold text-blue-600">2.</span>
                              Choisissez le produit à retourner et la quantité
                            </p>
                            <p className="flex items-start gap-3">
                              <span className="font-bold text-blue-600">3.</span>
                              Indiquez le motif du retour (défectueux, erreur, etc.)
                            </p>
                            <p className="flex items-start gap-3">
                              <span className="font-bold text-blue-600">4.</span>
                              Le stock sera automatiquement réapprovisionné selon le motif
                            </p>
                          </div>

                          <div className="pt-3 border-t border-blue-100 space-y-2">
                            <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase tracking-tight">
                              <AlertTriangle size={14} />
                              Retours autorisés uniquement AVANT clôture caisse ({closeHour}h)
                            </div>
                            <p className="text-xs text-blue-600/70 leading-relaxed">
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
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Rechercher un produit (ex: Guinness)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-amber-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                            whileHover={returnCheck.allowed ? { scale: 1.01 } : {}}
                            disabled={!returnCheck.allowed}
                            className={`p-3 text-left rounded-lg border transition-colors ${returnCheck.allowed
                              ? "border-gray-200 bg-white hover:border-gray-300 shadow-sm"
                              : "border-red-200 bg-red-50 opacity-50 cursor-not-allowed"
                              }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-gray-800 text-sm">
                                #{sale.id.slice(-4)}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {new Date(
                                  sale.validatedAt || sale.createdAt,
                                ).toLocaleTimeString("fr-FR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div
                              className="text-[11px] text-gray-600 truncate mb-1"
                              title={productPreview}
                            >
                              {productPreview}
                              {moreCount > 0 ? ` +${moreCount}` : ""}
                            </div>

                            <div className="flex items-center justify-between mt-2">
                              {serverUser ? (
                                <span className="text-[10px] text-purple-600 font-medium">
                                  👤 {serverUser.name}
                                </span>
                              ) : (
                                <span />
                              )}
                              {returnCheck.allowed ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-bold text-gray-700">
                                    {formatPrice(sale.total)}
                                  </span>
                                  <ChevronRight size={14} className="text-gray-400" />
                                </div>
                              ) : (
                                <span className="text-[10px] text-red-600 font-medium italic">
                                  {returnCheck.reason}
                                </span>
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
                className="space-y-4"
              >
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                  <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-amber-200/50">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] uppercase font-black text-amber-600 tracking-widest leading-none mb-1">Vente</span>
                      <span className="text-[10px] font-bold text-gray-400 leading-none mb-1">#...{selectedSale.id.slice(-4)}</span>
                      <h3 className="text-sm font-black text-gray-800 leading-none">
                        {formatPrice(selectedSale.total)}
                      </h3>
                    </div>
                    <BackButton
                      onClick={() => {
                        onSelectSale(null);
                        setSelectedProduct(null);
                      }}
                      label="Changer vente"
                      className="h-9 px-2.5 text-[11px] bg-white border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800 shadow-sm shrink-0"
                      variant="outline"
                    />
                  </div>

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
                          whileHover={!isFullyUnavailable ? { x: 4 } : {}}
                          disabled={isFullyUnavailable}
                          className={`w-full p-4 text-left rounded-xl border transition-all ${isFullyUnavailable
                            ? "border-gray-100 bg-gray-50/30 opacity-50 cursor-not-allowed"
                            : "border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm"
                            }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-gray-800 text-sm">
                                  {productName}
                                </p>
                                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                  {productVolume}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                  Vendu: <span className="font-bold">{item.quantity}</span>
                                </div>
                                {alreadyReturned > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] text-amber-600">
                                    Retourné: <span className="font-bold">{alreadyReturned}</span>
                                  </div>
                                )}
                                <div className={`flex items-center gap-1 text-[10px] ${isFullyUnavailable ? "text-red-500" : "text-green-600"}`}>
                                  Dispo: <span className="font-bold">{available}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-blue-600 font-bold text-xs">
                                {formatPrice(productPrice)}
                              </span>
                              {!isFullyUnavailable && <ChevronRight size={16} className="text-gray-300" />}
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
                className="space-y-4"
              >
                <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100/50">
                  <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-blue-200/30">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] uppercase font-black text-blue-600 tracking-widest leading-none mb-1">Produit</span>
                      <h3 className="text-xs font-black text-gray-800 leading-tight">
                        {selectedProduct.product_name}
                      </h3>
                    </div>
                    <BackButton
                      onClick={() => setSelectedProduct(null)}
                      label="Changer produit"
                      className="h-9 px-2.5 text-[11px] bg-white border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 shadow-sm shrink-0"
                      variant="outline"
                    />
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="grid grid-cols-1 gap-6 mb-6">
                      <div>
                        <Label className="text-xs uppercase font-bold text-gray-400 mb-3 block tracking-wider">
                          1. Quantité à retourner
                        </Label>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-inner w-fit">
                            <button
                              type="button"
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                              className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-gray-600 hover:text-blue-600 disabled:opacity-30 transition-all active:scale-95"
                              disabled={quantity <= 1}
                            >
                              <Minus size={18} />
                            </button>
                            <div className="w-14 text-center font-black text-xl text-gray-800 select-none">
                              {quantity}
                            </div>
                            <button
                              type="button"
                              onClick={() => setQuantity(Math.min(availableQty, quantity + 1))}
                              className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-gray-600 hover:text-blue-600 disabled:opacity-30 transition-all active:scale-95"
                              disabled={quantity >= availableQty}
                            >
                              <Plus size={18} />
                            </button>
                          </div>

                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Disponible sur cette vente</span>
                            <span className="text-sm font-black text-gray-700">{availableQty} unités</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs uppercase font-bold text-gray-400 mb-3 block tracking-wider">
                          2. Motif du retour
                        </Label>
                        <ReturnReasonSelector
                          reasons={returnReasons}
                          selectedReason={reason}
                          onSelect={(r) => setReason(r)}
                        />
                      </div>
                    </div>

                    <div className="mb-6">
                      <Label htmlFor="returnNotes" className="text-xs uppercase font-bold text-gray-400 mb-2 block tracking-wider">
                        3. Notes (Optionnel)
                      </Label>
                      <Textarea
                        id="returnNotes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="rounded-xl border-gray-200 focus:ring-blue-500/20 text-sm"
                        placeholder="Précisez la raison si nécessaire..."
                      />
                    </div>

                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      key={reason}
                      className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200 flex gap-3 items-start"
                    >
                      <Info className="text-blue-500 mt-0.5" size={18} />
                      <div>
                        <p className="text-xs font-bold text-gray-700 mb-0.5">Impact automatique :</p>
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                          {reason === 'defective' && "L'article sera marqué comme défectueux. Remboursé, mais non remis en stock."}
                          {reason === 'wrong_item' && "L'article sera remis en stock vendable et le montant sera remboursé."}
                          {reason === 'customer_change' && "L'article sera remis en stock vendable sans remboursement automatique."}
                          {reason === 'expired' && "L'article sera retiré de l'inventaire et le montant remboursé."}
                          {reason === 'other' && "Le gérant devra décider manuellement du remboursement et du stock."}
                        </p>
                      </div>
                    </motion.div>

                    <div className="flex gap-3">
                      <EnhancedButton
                        onClick={() => setSelectedProduct(null)}
                        variant="secondary"
                        className="flex-1"
                      >
                        Annuler
                      </EnhancedButton>
                      <EnhancedButton
                        onClick={handleSubmit}
                        variant="primary"
                        className="flex-1"
                      >
                        Confirmer retour
                      </EnhancedButton>
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
