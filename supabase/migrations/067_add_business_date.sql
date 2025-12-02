-- Migration: 067_add_business_date.sql
-- Description: Ajout de la colonne business_date et du trigger de calcul automatique

-- 1. Configuration des Bars
ALTER TABLE bars 
ADD COLUMN IF NOT EXISTS closing_hour INTEGER DEFAULT 6;

COMMENT ON COLUMN bars.closing_hour IS 'Heure de clôture du jour commercial (0-23). Défaut: 6 (06:00)';

-- 2. Fonction de calcul de la date commerciale
-- 2. Fonction de calcul de la date commerciale
CREATE OR REPLACE FUNCTION calculate_business_date()
RETURNS TRIGGER AS $$
DECLARE
    v_closing_hour INTEGER;
    v_bar_id UUID;
    v_source_date TIMESTAMPTZ;
BEGIN
    -- Si business_date est déjà fournie (par le frontend), ne pas l'écraser
    IF NEW.business_date IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Récupérer le bar_id
    v_bar_id := NEW.bar_id;

    -- Récupérer l'heure de clôture du bar
    SELECT closing_hour INTO v_closing_hour
    FROM bars
    WHERE id = v_bar_id;

    -- Valeur par défaut si non trouvé ou null
    IF v_closing_hour IS NULL THEN
        v_closing_hour := 6;
    END IF;

    -- Déterminer la date source (created_at ou returned_at)
    -- On essaie de détecter si c'est un retour
    IF (TG_TABLE_NAME = 'returns') THEN
        v_source_date := NEW.returned_at;
    ELSE
        v_source_date := NEW.created_at;
    END IF;

    -- Calculer la business_date
    NEW.business_date := DATE(v_source_date - (v_closing_hour || ' hours')::INTERVAL);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Ajout de la colonne et du Trigger pour SALES
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS business_date DATE;

-- Index pour la performance
CREATE INDEX IF NOT EXISTS idx_sales_business_date ON sales(business_date);

-- Trigger
DROP TRIGGER IF EXISTS trg_sales_business_date ON sales;
CREATE TRIGGER trg_sales_business_date
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION calculate_business_date();

-- Backfill Sales (Mise à jour de l'historique)
UPDATE sales 
SET business_date = DATE(created_at - INTERVAL '6 hours')
WHERE business_date IS NULL;

-- Contrainte NOT NULL après backfill
ALTER TABLE sales ALTER COLUMN business_date SET NOT NULL;


-- 4. Ajout de la colonne et du Trigger pour RETURNS
ALTER TABLE returns 
ADD COLUMN IF NOT EXISTS business_date DATE;

CREATE INDEX IF NOT EXISTS idx_returns_business_date ON returns(business_date);

DROP TRIGGER IF EXISTS trg_returns_business_date ON returns;
CREATE TRIGGER trg_returns_business_date
BEFORE INSERT ON returns
FOR EACH ROW
EXECUTE FUNCTION calculate_business_date();

-- Backfill Returns (Utilise returned_at)
UPDATE returns 
SET business_date = DATE(returned_at - INTERVAL '6 hours')
WHERE business_date IS NULL;

ALTER TABLE returns ALTER COLUMN business_date SET NOT NULL;


-- 5. Ajout de la colonne et du Trigger pour CONSIGNMENTS (si la table existe)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'consignments') THEN
        ALTER TABLE consignments ADD COLUMN IF NOT EXISTS business_date DATE;
        
        CREATE INDEX IF NOT EXISTS idx_consignments_business_date ON consignments(business_date);

        DROP TRIGGER IF EXISTS trg_consignments_business_date ON consignments;
        CREATE TRIGGER trg_consignments_business_date
        BEFORE INSERT ON consignments
        FOR EACH ROW
        EXECUTE FUNCTION calculate_business_date();

        -- On suppose created_at pour consignments, sinon adapter
        UPDATE consignments 
        SET business_date = DATE(created_at - INTERVAL '6 hours')
        WHERE business_date IS NULL;

        ALTER TABLE consignments ALTER COLUMN business_date SET NOT NULL;
    END IF;
END $$;
