import { Package, X, RotateCcw, ArrowLeftRight } from "lucide-react";
import { motion } from "framer-motion";
import { Return, ReturnReason, ReturnReasonConfig, User } from "../../types";

interface ReturnCardProps {
  returnItem: Return;
  returnReasons: Record<ReturnReason, ReturnReasonConfig>;
  serverUser: User | null;
  initiatorUser?: User | null; // ✨ Nouveau
  validatorUser?: User | null; // ✨ Nouveau
  isReadOnly: boolean;
  isMobile: boolean;
  formatPrice: (amount: number) => string;
  onApprove: (returnId: string) => void;
  onReject: (returnId: string) => void;
  onManualRestock: (returnId: string) => void;
}

// Helper to get status badge color
function getStatusBadgeColor(status: Return["status"]): string {
  switch (status) {
    case "restocked":
      return "bg-green-500";
    case "approved":
      return "bg-brand-primary";
    case "rejected":
      return "bg-red-500";
    case "pending":
    default:
      return "bg-brand-secondary";
  }
}

// Helper to get reason badge styling
function getReasonBadgeClass(color: string): string {
  switch (color) {
    case "red":
      return "bg-red-50 text-red-700 border-red-100";
    case "orange":
    case "amber":
      return "bg-brand-subtle text-brand-dark border-brand-subtle";
    case "blue":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "purple":
      return "bg-purple-50 text-purple-700 border-purple-100";
    case "gray":
    default:
      return "bg-gray-50 text-gray-700 border-gray-100";
  }
}

export function ReturnCard({
  returnItem,
  returnReasons,
  serverUser,
  initiatorUser,
  validatorUser,
  isReadOnly,
  isMobile,
  formatPrice,
  onApprove,
  onReject,
  onManualRestock,
}: ReturnCardProps) {
  // Wrapper component selection based on mobile
  const CardWrapper = isMobile ? "div" : motion.div;
  const cardProps = isMobile ? {} : { layoutId: returnItem.id };

  return (
    <CardWrapper
      key={returnItem.id}
      id={`return-${returnItem.id}`}
      {...cardProps}
      className="bg-white rounded-[1.5rem] p-5 border border-gray-100 hover:border-brand-primary/30 transition-all shadow-md hover:shadow-xl hover:shadow-brand-primary/5 group relative overflow-hidden"
    >
      {/* Barre d'accentuation latérale (Code Status Elite) */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getStatusBadgeColor(returnItem.status)} opacity-80`} />

      <div className="pl-3">
        {/* Section Principale: Produit + Montants */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
          {/* Gauche: Info Produit */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h4 className="font-black text-gray-900 uppercase tracking-tight text-lg leading-tight">
                {returnItem.productName}
              </h4>
              <span className="text-[10px] font-black text-accessible-gray bg-gray-50 px-2 py-1 rounded-md uppercase tracking-widest border border-gray-100">
                {returnItem.productVolume}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-2 items-center">
              <span className="text-[10px] font-bold text-accessible-gray uppercase tracking-wider">#{returnItem.id.slice(-6).toUpperCase()}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-200" aria-hidden="true" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                {new Date(returnItem.returnedAt).toLocaleDateString("fr-FR", { day: '2-digit', month: 'short' })} • {new Date(returnItem.returnedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {serverUser && (
                <div className="flex items-center gap-1.5 bg-purple-50 px-2 py-1 rounded-full border border-purple-100/50 shrink-0">
                  <span className="text-[9px] font-black text-purple-600 uppercase tracking-tighter">
                    Vendeur: {serverUser.name}
                  </span>
                </div>
              )}
              {initiatorUser && initiatorUser.id !== serverUser?.id && (
                <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-full border border-blue-100/50 shrink-0">
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-tighter">
                    Initié par: {initiatorUser.name}
                  </span>
                </div>
              )}
              {validatorUser && (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-full border border-amber-100/50 shrink-0">
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-tighter">
                    {returnItem.status === 'rejected' ? 'Rejeté' : 'Validé'} par: {validatorUser.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Badge Échange si le retour est lié à une vente de remplacement */}
          {returnItem.linkedSaleId && (
            <div className="bg-orange-50 border border-orange-100 rounded-md px-3 py-2 mb-4">
              <p className="text-xs text-orange-700 font-bold flex items-center gap-1.5">
                <ArrowLeftRight size={14} />
                Retour lié à la vente de remplacement #{returnItem.linkedSaleId.slice(-6).toUpperCase()}
              </p>
            </div>
          )}

          {/* Droite: Chiffres Clés (Remboursement & Qté) */}
          <div className="flex items-center justify-between lg:justify-end gap-10 pt-5 lg:pt-0 border-t lg:border-t-0 lg:border-l border-dashed border-gray-100 lg:pl-8 shrink-0">
            <div className="text-left lg:text-right">
              <span className="block text-[9px] font-black text-accessible-gray uppercase tracking-[0.2em] mb-1">
                Remboursement
              </span>
              <span
                className="block font-black text-2xl font-mono tracking-tighter"
                style={{
                  background: 'var(--brand-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                {formatPrice(returnItem.refundAmount)}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[9px] font-black text-accessible-gray uppercase tracking-[0.2em] mb-1">Qté</span>
              <div className="flex items-baseline justify-end gap-1">
                <span className="font-black text-gray-900 text-2xl tracking-tighter">
                  {returnItem.quantityReturned}
                </span>
                <span className="text-gray-300 font-bold text-sm">/ {returnItem.quantitySold}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pied de Carte: Badges & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pt-5 border-t border-gray-50">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-sm ${getReasonBadgeClass(returnReasons[returnItem.reason].color)}`}
            >
              {returnReasons[returnItem.reason].icon}{" "}
              {returnReasons[returnItem.reason].label}
            </span>

            {returnItem.autoRestock && (
              <span className="text-[9px] font-black bg-green-50 text-green-700 border border-green-100/50 px-2.5 py-1.5 rounded-lg uppercase tracking-wider">
                📦 Restock Auto
              </span>
            )}

            {returnItem.isRefunded && (
              <span className="text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-100/50 px-2.5 py-1.5 rounded-lg uppercase tracking-wider">
                💰 Crédité
              </span>
            )}

            {!returnItem.isRefunded && returnItem.refundAmount === 0 && !returnItem.linkedSaleId && (
              <span className="text-[9px] font-black bg-gray-50 text-gray-500 border border-gray-100 px-2.5 py-1.5 rounded-lg uppercase tracking-wider italic">
                Sans flux financier
              </span>
            )}

            {returnItem.linkedSaleId && (
              <span className="text-[9px] font-black bg-purple-50 text-purple-700 border border-purple-100/50 px-2.5 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <RotateCcw size={11} className="text-purple-500" strokeWidth={3} />
                Échange Magic Swap
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-2 shrink-0 sm:self-auto self-end"
            data-guide="returns-status"
          >
            {!isReadOnly && returnItem.status === "pending" && (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onReject(returnItem.id)}
                  className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
                >
                  Rejeter
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onApprove(returnItem.id)}
                  className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-primary/20 flex items-center justify-center min-w-[100px]"
                  style={{ background: 'var(--brand-gradient)' }}
                  aria-label={`Approuver le retour de ${returnItem.productName}`}
                >
                  Approuver
                </motion.button>
              </>
            )}

            {!isReadOnly &&
              returnItem.status === "approved" &&
              returnItem.manualRestockRequired && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onManualRestock(returnItem.id)}
                  className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 flex items-center gap-2 bg-blue-600"
                >
                  <Package size={14} aria-hidden="true" />
                  Remettre en stock
                </motion.button>
              )}

            {returnItem.status === "restocked" && (
              <span className="text-[10px] font-black text-green-600 uppercase tracking-widest flex items-center gap-2 bg-green-50 px-3 py-2 rounded-xl border border-green-100">
                <Package size={14} aria-hidden="true" />
                En stock ({new Date(returnItem.restockedAt!).toLocaleDateString("fr-FR")})
              </span>
            )}
            {returnItem.status === "rejected" && (
              <span className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2 bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                <X size={14} aria-hidden="true" />
                Rejeté
              </span>
            )}
          </div>
        </div>
      </div>
      {returnItem.notes && (
        <div className="mt-5 ml-3 bg-gray-50/50 p-4 rounded-xl border border-dashed border-gray-200">
          <p className="text-[11px] text-gray-500 italic leading-relaxed">
            <span className="font-black text-gray-400 uppercase tracking-tighter not-italic mr-2">Note:</span>
            "{returnItem.notes}"
          </p>
        </div>
      )}
    </CardWrapper>
  );
}
