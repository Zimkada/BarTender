// src/pages/SaleDetailsPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, User, Calendar, CreditCard, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { SalesService } from '../services/supabase/sales.service';
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { RouteLoadingFallback } from '../components/LoadingFallback';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

/**
 * Page Détails d'une Vente
 * Route: /sales/:saleId
 */
export default function SaleDetailsPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();

  const { data: sale, isLoading, error } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => SalesService.getSaleById(saleId!),
    enabled: !!saleId,
  });

  if (isLoading) {
    return <RouteLoadingFallback label="Chargement du detail de vente..." />;
  }

  if (error || !sale) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <Alert variant="destructive" show={true}>
          <h1 className="text-xl font-semibold text-foreground mb-2">Vente introuvable</h1>
          <p className="text-foreground/70 mb-4">La vente #{saleId} n'existe pas ou a été supprimée.</p>
          <Button
            onClick={() => navigate('/sales')}
            className="mt-4"
          >
            Retour à l'historique
          </Button>
        </Alert>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'validated':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle size={14} /> Validée
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
            <XCircle size={14} /> Rejetée
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
            <Clock size={14} /> En attente
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/sales')}
          className="rounded-lg transition-colors hover:bg-muted"
        >
          <ArrowLeft size={24} className="text-foreground/70" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            Vente #{sale.id.slice(-6).toUpperCase()}
          </h1>
          <p className="text-foreground/70 text-sm">
            {new Date(sale.created_at).toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
        {getStatusBadge(sale.status)}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <User size={16} />
            Vendeur
          </div>
          <p className="font-semibold text-foreground">{sale.seller_name}</p>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CreditCard size={16} />
            Paiement
          </div>
          <p className="font-semibold text-foreground capitalize">
            {sale.payment_method === 'cash' ? 'Espèces' :
             sale.payment_method === 'mobile_money' ? 'Mobile Money' :
             sale.payment_method === 'card' ? 'Carte' :
             sale.payment_method === 'credit' ? 'Crédit' : sale.payment_method}
          </p>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Package size={16} />
            Articles
          </div>
          <p className="font-semibold text-foreground">{sale.items_count} produit(s)</p>
        </div>

        <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-200">
          <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
            <Calendar size={16} />
            Total
          </div>
          <p className="font-bold text-amber-700 text-lg">{formatPrice(sale.total)}</p>
        </div>
      </div>

      {/* Items List */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-4 py-3 bg-muted border-b border-border">
          <h2 className="font-semibold text-foreground">Détail des articles</h2>
        </div>
        <div className="divide-y divide-border">
          {(sale.items as any[]).map((item, index) => (
            <div key={index} className="px-4 py-3 flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium text-foreground">{item.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.quantity} × {formatPrice(item.unit_price)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{formatPrice(item.total_price)}</p>
                {item.discount_amount > 0 && (
                  <p className="text-xs text-green-600">-{formatPrice(item.discount_amount)} promo</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex justify-between items-center">
          <span className="font-semibold text-foreground/80">Total</span>
          <span className="font-bold text-amber-700 text-xl">{formatPrice(sale.total)}</span>
        </div>
      </div>

      {/* Customer Info (if available) */}
      {(sale.customer_name || sale.customer_phone || sale.notes) && (
        <div className="mt-6 bg-card rounded-xl shadow-sm border border-border p-4">
          <h2 className="font-semibold text-foreground mb-3">Informations client</h2>
          {sale.customer_name && (
            <p className="text-foreground/70"><span className="font-medium">Nom:</span> {sale.customer_name}</p>
          )}
          {sale.customer_phone && (
            <p className="text-foreground/70"><span className="font-medium">Téléphone:</span> {sale.customer_phone}</p>
          )}
          {sale.notes && (
            <p className="text-foreground/70 mt-2"><span className="font-medium">Notes:</span> {sale.notes}</p>
          )}
        </div>
      )}

      {/* Validation Info (if validated/rejected) */}
      {sale.validator_name && (
        <div className="mt-6 bg-card rounded-xl shadow-sm border border-border p-4">
          <h2 className="font-semibold text-foreground mb-3">
            {sale.status === 'validated' ? 'Validation' : 'Rejet'}
          </h2>
          <p className="text-foreground/70">
            <span className="font-medium">Par:</span> {sale.validator_name}
          </p>
          {sale.validated_at && (
            <p className="text-foreground/70">
              <span className="font-medium">Le:</span>{' '}
              {new Date(sale.validated_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
