-- Add sale_id column to returns table
ALTER TABLE public.returns 
ADD COLUMN sale_id UUID REFERENCES public.sales(id);

-- Create index for better performance on lookups
CREATE INDEX idx_returns_sale_id ON public.returns(sale_id);

-- Optional: Add comment
COMMENT ON COLUMN public.returns.sale_id IS 'Reference to the sale that this return belongs to';
