import { Package, X, RotateCcw, ArrowLeftRight } from "lucide-react";
import { motion } from "framer-motion";
import { Return, ReturnReason, ReturnReasonConfig, User } from "../../types";
import type { UnifiedReturn } from "../../hooks/pivots/useUnifiedReturns";

interface ReturnCardProps {
  returnItem: Return | UnifiedReturn;
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

// Helper to get status badge color (barre latérale)
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
      return "bg-gray-300";
  }
}

// Helper to get reason badge styling
function getReasonBadgeClass(color: string): string {
  switch (color) {
    case "red":
      return "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/40";
    case "orange":
    case "amber":
      return "bg-brand-subtle text-brand-primary border-brand-primary/20";
    case "blue":
      return "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/40";
    case "purple":
      return "bg-muted text-foreground/80 border-border";
    case "gray":
    default:
      return "bg-muted text-foreground/70 border-border";
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
      className="bg-card rounded-2xl p-5 border border-border hover:border-brand-primary/40 hover:shadow-md transition-all shadow-sm relative overflow-hidden"
    >
      {/* Barre d'accentuation latérale (statut) */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusBadgeColor(returnItem.status)}`} aria-hidden="true" />

      <div className="pl-3">
        {/* Section Principale: Produit + Montants */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-5">
          {/* Gauche: Info Produit */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h4 className="text-h3 text-foreground leading-tight">
                {returnItem.productName}
              </h4>
              <span className="text-caption font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                {returnItem.productVolume}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-2 gap-y-1.5 items-center">
              <span className="text-caption text-muted-foreground tabular-nums">#{returnItem.id.slice(-6).toUpperCase()}</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />
              <span className="text-caption text-muted-foreground tabular-nums">
                {new Date(returnItem.returnedAt).toLocaleDateString("fr-FR", { day: '2-digit', month: 'short' })} • {new Date(returnItem.returnedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {serverUser && (
                <span className="text-caption text-foreground/70 bg-muted px-2 py-0.5 rounded-full border border-border">
                  Vendeur : {serverUser.name}
                </span>
              )}
              {initiatorUser && initiatorUser.id !== serverUser?.id && (
                <span className="text-caption text-foreground/70 bg-muted px-2 py-0.5 rounded-full border border-border">
                  Initié par : {initiatorUser.name}
                </span>
              )}
              {validatorUser && (
                <span className="text-caption text-foreground/70 bg-muted px-2 py-0.5 rounded-full border border-border">
                  {returnItem.status === 'rejected' ? 'Rejeté' : 'Validé'} par : {validatorUser.name}
                </span>
              )}
            </div>
          </div>

          {/* Badge Échange si le retour est lié à une vente de remplacement */}
          {returnItem.linkedSaleId && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2">
              <p className="text-caption text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                <ArrowLeftRight size={14} />
                Retour lié à la vente #{returnItem.linkedSaleId.slice(-6).toUpperCase()}
              </p>
            </div>
          )}

          {/* Droite: Chiffres clés (Remboursement & Qté) */}
          <div className="flex items-center justify-between lg:justify-end gap-8 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-dashed border-border lg:pl-6 shrink-0">
            <div className="text-left lg:text-right">
              <span className="block text-micro text-muted-foreground mb-1">
                Remboursement
              </span>
              <span className="block text-h2 font-semibold text-brand-primary tabular-nums">
                {formatPrice(returnItem.refundAmount)}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-micro text-muted-foreground mb-1">Qté</span>
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-h2 font-semibold text-foreground tabular-nums">
                  {returnItem.quantityReturned}
                </span>
                <span className="text-caption text-muted-foreground tabular-nums">/ {returnItem.quantitySold}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pied de Carte: Badges & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-medium border ${getReasonBadgeClass(returnReasons[returnItem.reason].color)}`}
            >
              <span>{returnReasons[returnItem.reason].icon}</span>
              <span>{returnReasons[returnItem.reason].label}</span>
            </span>

            {returnItem.autoRestock && (
              <span className="inline-flex items-center gap-1 text-caption font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/40 px-2.5 py-1 rounded-full">
                <Package size={11} />
                Restock auto
              </span>
            )}

            {returnItem.isRefunded && (
              <span className="text-caption font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 px-2.5 py-1 rounded-full">
                Crédité
              </span>
            )}

            {!returnItem.isRefunded && returnItem.refundAmount === 0 && !returnItem.linkedSaleId && (
              <span className="text-caption font-medium bg-muted text-muted-foreground border border-border px-2.5 py-1 rounded-full italic">
                Sans flux financier
              </span>
            )}

            {returnItem.linkedSaleId && (
              <span className="inline-flex items-center gap-1 text-caption font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 px-2.5 py-1 rounded-full">
                <RotateCcw size={11} />
                Échange produit
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
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onReject(returnItem.id)}
                  className="px-4 py-2 rounded-lg text-body-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors border border-red-100 dark:border-red-900/40"
                >
                  Rejeter
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onApprove(returnItem.id)}
                  className="px-4 py-2 rounded-lg text-body-sm font-semibold text-white shadow-sm flex items-center justify-center min-w-[100px] btn-brand"
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
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onManualRestock(returnItem.id)}
                  className="px-4 py-2 rounded-lg text-body-sm font-semibold text-white shadow-sm flex items-center gap-2 bg-brand-primary hover:opacity-90"
                >
                  <Package size={14} aria-hidden="true" />
                  Remettre en stock
                </motion.button>
              )}

            {returnItem.status === "restocked" && (
              <span className="inline-flex items-center gap-1.5 text-caption font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-100 dark:border-green-900/40 px-3 py-1.5 rounded-full tabular-nums">
                <Package size={14} aria-hidden="true" />
                En stock ({new Date(returnItem.restockedAt!).toLocaleDateString("fr-FR")})
              </span>
            )}
            {returnItem.status === "rejected" && (
              <span className="inline-flex items-center gap-1.5 text-caption font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/40 px-3 py-1.5 rounded-full">
                <X size={14} aria-hidden="true" />
                Rejeté
              </span>
            )}
          </div>
        </div>
      </div>
      {returnItem.notes && (
        <div className="mt-4 ml-3 bg-muted p-3 rounded-xl border border-dashed border-border">
          <p className="text-caption text-foreground/70 italic leading-relaxed">
            <span className="text-micro text-muted-foreground not-italic mr-2">Note</span>
            « {returnItem.notes} »
          </p>
        </div>
      )}
    </CardWrapper>
  );
}
