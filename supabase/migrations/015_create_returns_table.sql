-- Create returns table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES bar_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_volume TEXT NOT NULL,
  quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
  quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0 AND quantity_returned <= quantity_sold),
  reason TEXT NOT NULL CHECK (reason IN ('defective', 'wrong_item', 'customer_change', 'expired', 'other')),
  returned_by UUID NOT NULL REFERENCES users(id),
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refund_amount NUMERIC(12, 2) NOT NULL CHECK (refund_amount >= 0),
  is_refunded BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'restocked')),
  auto_restock BOOLEAN NOT NULL DEFAULT false,
  manual_restock_required BOOLEAN NOT NULL DEFAULT false,
  restocked_at TIMESTAMPTZ,
  notes TEXT,
  custom_refund BOOLEAN,
  custom_restock BOOLEAN,
  original_seller UUID REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_returns_bar ON public.returns(bar_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON public.returns(status);

-- Add comments
COMMENT ON TABLE public.returns IS 'Retours produits liés aux ventes';
