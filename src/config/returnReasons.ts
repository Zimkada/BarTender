import { ReturnReason, ReturnReasonConfig } from "../types";

export const returnReasons: Record<ReturnReason, ReturnReasonConfig> = {
  defective: {
    label: "Défectueux",
    description: "Remboursé, pas remis en stock",
    icon: "⚠️",
    color: "red",
    autoRestock: false,
    autoRefund: true,
  },
  wrong_item: {
    label: "Erreur article",
    description: "Remboursé + remis en stock",
    icon: "🔄",
    color: "orange",
    autoRestock: true,
    autoRefund: true,
  },
  customer_change: {
    label: "Non consommé",
    description: "Pas remboursé, remis en stock",
    icon: "↩️",
    color: "blue",
    autoRestock: true,
    autoRefund: false,
  },
  expired: {
    label: "Périmé",
    description: "Remboursé, pas remis en stock",
    icon: "📅",
    color: "purple",
    autoRestock: false,
    autoRefund: true,
  },
  other: {
    label: "Autre (manuel)",
    description: "Gérant décide remboursement et stock",
    icon: "✏️",
    color: "gray",
    autoRestock: false,
    autoRefund: false,
  },
};
