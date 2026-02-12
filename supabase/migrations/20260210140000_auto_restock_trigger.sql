-- =====================================================
-- Migration: Auto-Restock Trigger for Returns
-- Date: 2026-02-10
-- Objectif: Réapprovisionner automatiquement le stock lors des retours avec auto_restock = true
-- =====================================================

-- Créer la fonction de trigger
CREATE OR REPLACE FUNCTION public.handle_auto_restock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si auto_restock est activé ET que le statut est approuvé/restocked
    -- (pour éviter de restocker un retour pending qui pourrait être rejeté)
    IF NEW.auto_restock = true AND NEW.status IN ('approved', 'restocked') THEN
        UPDATE public.bar_products
        SET stock = stock + NEW.quantity_returned
        WHERE id = NEW.product_id AND bar_id = NEW.bar_id;
        
        -- Mettre à jour restocked_at pour traçabilité
        NEW.restocked_at := CURRENT_TIMESTAMP;
        
        -- Log pour debugging (optionnel)
        RAISE NOTICE 'Auto-restock: product_id=%, quantity=%, new_stock=%', 
            NEW.product_id, 
            NEW.quantity_returned,
            (SELECT stock FROM public.bar_products WHERE id = NEW.product_id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Créer le trigger sur INSERT (flux gérant direct)
DROP TRIGGER IF EXISTS trg_auto_restock_on_insert ON public.returns;

CREATE TRIGGER trg_auto_restock_on_insert
    BEFORE INSERT ON public.returns
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auto_restock();

-- Créer le trigger sur UPDATE (flux serveur → gérant)
-- S'active quand le statut passe de 'pending' à 'approved'/'restocked'
DROP TRIGGER IF EXISTS trg_auto_restock_on_approval ON public.returns;

CREATE TRIGGER trg_auto_restock_on_approval
    BEFORE UPDATE ON public.returns
    FOR EACH ROW
    WHEN (
        OLD.status = 'pending' 
        AND NEW.status IN ('approved', 'restocked')
        AND NEW.auto_restock = true
        AND OLD.restocked_at IS NULL
    )
    EXECUTE FUNCTION public.handle_auto_restock();

-- Commentaire pour traçabilité
COMMENT ON FUNCTION public.handle_auto_restock IS 
    'Réapprovisionne automatiquement le stock lors de la création d''un retour avec auto_restock = true (flux gérant direct) ou lors de l''approbation (flux serveur → gérant)';
