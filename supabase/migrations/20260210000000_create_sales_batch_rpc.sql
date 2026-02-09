-- =====================================================
-- Migration: Création du RPC create_sales_batch (Pillar 4 - Batching)
-- Date: 2026-02-10
-- Objectif: Permettre la création de multiples ventes en une seule requête (Network Optimization)
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_sales_batch(
    p_bar_id UUID,
    p_sales JSONB -- Array of sale objects (params for create_sale_idempotent)
)
RETURNS JSONB -- Array of { idempotency_key, success, sale_id, error, temp_id }
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_data JSONB;
    v_result JSONB;
    v_results JSONB := '[]'::jsonb;
    v_created_sale sales;
    v_error TEXT;
BEGIN
    -- Boucle sur chaque vente du tableau
    FOR v_sale_data IN SELECT * FROM jsonb_array_elements(p_sales)
    LOOP
        BEGIN
            -- Appel de la fonction atomique existante
            -- On extrait chaque champ du JSON object individuel
            SELECT * INTO v_created_sale
            FROM public.create_sale_idempotent(
                p_bar_id,
                v_sale_data->'p_items', -- JSON array of items
                v_sale_data->>'p_payment_method',
                (v_sale_data->>'p_sold_by')::UUID,
                v_sale_data->>'p_idempotency_key',
                (v_sale_data->>'p_server_id')::UUID,
                COALESCE(v_sale_data->>'p_status', 'validated'),
                v_sale_data->>'p_customer_name',
                v_sale_data->>'p_customer_phone',
                v_sale_data->>'p_notes',
                (v_sale_data->>'p_business_date')::DATE,
                (v_sale_data->>'p_ticket_id')::UUID
            );

            -- Conservation du résultat SUCCÈS
            v_result := jsonb_build_object(
                'idempotency_key', v_sale_data->>'p_idempotency_key',
                'temp_id', v_sale_data->>'temp_id', -- Pass-through utility
                'success', true,
                'sale_id', v_created_sale.id
            );

        EXCEPTION WHEN OTHERS THEN
            -- Capture de l'erreur pour ne pas bloquer les autres ventes du batch
            v_error := SQLERRM;
            
            -- Conservation du résultat ÉCHEC
            v_result := jsonb_build_object(
                'idempotency_key', v_sale_data->>'p_idempotency_key',
                'temp_id', v_sale_data->>'temp_id',
                'success', false,
                'error', v_error
            );
        END;

        -- Ajout au tableau de résultats
        v_results := v_results || v_result;
    END LOOP;

    RETURN v_results;
END;
$$;

COMMENT ON FUNCTION public.create_sales_batch(UUID, JSONB) 
IS 'V12 - Batch processing for sales creation (Network Optimization)';
