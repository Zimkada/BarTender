import { Package, X } from "lucide-react";
import { motion } from "framer-motion";
import { Return, ReturnReason, ReturnReasonConfig, User } from "../../types";
import { EnhancedButton } from "../EnhancedButton";

interface ReturnCardProps {
  returnItem: Return;
  returnReasons: Record<ReturnReason, ReturnReasonConfig>;
  serverUser: User | null;
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
      className="bg-white rounded-xl p-4 border border-gray-200 hover:border-brand-primary transition-colors shadow-sm"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
        <div className="flex items-start gap-4">
          <div
            className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${getStatusBadgeColor(returnItem.status)}`}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-gray-800 text-lg">
                {returnItem.productName}
              </h4>
              <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {returnItem.productVolume}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
              <span>ID: #{returnItem.id.slice(-6)}</span>
              <span>•</span>
              <span>
                {new Date(returnItem.returnedAt).toLocaleDateString("fr-FR")} à{" "}
                {new Date(returnItem.returnedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {serverUser && (
                <>
                  <span>•</span>
                  <span className="text-purple-600 font-medium">
                    Serveur: {serverUser.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 pl-7 md:pl-0">
          <div className="text-right">
            <span className="block text-sm text-gray-500">
              Montant remboursé
            </span>
            <span className="block font-bold text-gray-800 text-lg">
              {formatPrice(returnItem.refundAmount)}
            </span>
          </div>
          <div className="text-right border-l border-gray-100 pl-6">
            <span className="block text-sm text-gray-500">Quantité</span>
            <span className="block font-bold text-gray-800 text-lg">
              {returnItem.quantityReturned} / {returnItem.quantitySold}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-gray-50 pl-7 md:pl-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getReasonBadgeClass(returnReasons[returnItem.reason].color)}`}
          >
            {returnReasons[returnItem.reason].icon}{" "}
            {returnReasons[returnItem.reason].label}
          </span>

          {returnItem.autoRestock && (
            <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full font-medium">
              📦 Stock auto
            </span>
          )}

          {returnItem.isRefunded && (
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
              💰 Remboursé
            </span>
          )}

          {!returnItem.isRefunded && returnItem.refundAmount === 0 && (
            <span className="text-xs bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-full font-medium">
              Sans remboursement
            </span>
          )}
        </div>

        <div
          className="flex items-center gap-2 self-end sm:self-auto"
          data-guide="returns-status"
        >
          {!isReadOnly && returnItem.status === "pending" && (
            <>
              <EnhancedButton
                variant="danger"
                size="sm"
                onClick={() => onReject(returnItem.id)}
              >
                Rejeter
              </EnhancedButton>
              <EnhancedButton
                variant="success"
                size="sm"
                onClick={() => onApprove(returnItem.id)}
              >
                Approuver
              </EnhancedButton>
            </>
          )}

          {!isReadOnly &&
            returnItem.status === "approved" &&
            returnItem.manualRestockRequired && (
              <EnhancedButton
                variant="info"
                size="sm"
                onClick={() => onManualRestock(returnItem.id)}
                icon={<Package size={14} />}
              >
                Remettre en stock
              </EnhancedButton>
            )}

          {returnItem.status === "restocked" && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1 bg-green-50 px-3 py-1 rounded-lg">
              <Package size={14} />
              En stock (
              {returnItem.restockedAt &&
                new Date(returnItem.restockedAt).toLocaleDateString("fr-FR")}
              )
            </span>
          )}
          {returnItem.status === "rejected" && (
            <span className="text-sm text-red-600 font-medium flex items-center gap-1 bg-red-50 px-3 py-1 rounded-lg">
              <X size={14} />
              Rejeté
            </span>
          )}
        </div>
      </div>
      {returnItem.notes && (
        <div className="mt-3 ml-7 md:ml-0 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <p className="text-sm text-gray-600 italic">
            Note: "{returnItem.notes}"
          </p>
        </div>
      )}
    </CardWrapper>
  );
}
