-- Migration: fix_corrupted_bar_addresses
-- Date: 2026-05-23
-- Cause: PromotersCreationForm.tsx passed { address, phone } as the 3rd argument
--        to AuthService.setupPromoterBar() instead of passing address and phone
--        as separate strings.
-- Result: bars.address may contain a JSON-stringified object and bars.phone may be null.
-- Fix code: commit 71bb27f (fix(types F5 auth): resolve 16 TypeScript errors in auth/onboarding feature)

CREATE OR REPLACE FUNCTION pg_temp.try_parse_jsonb(value text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

WITH corrupted_bars AS (
  SELECT
    id,
    pg_temp.try_parse_jsonb(address) AS payload
  FROM bars
  WHERE address IS NOT NULL
    AND address ~ '^\s*\{'
),
repairable_bars AS (
  SELECT
    id,
    NULLIF(trim(payload ->> 'address'), '') AS repaired_address,
    NULLIF(trim(payload ->> 'phone'), '') AS repaired_phone
  FROM corrupted_bars
  WHERE jsonb_typeof(payload) = 'object'
    AND payload ? 'address'
)
UPDATE bars
SET
  address = repairable_bars.repaired_address,
  phone = COALESCE(repairable_bars.repaired_phone, bars.phone)
FROM repairable_bars
WHERE bars.id = repairable_bars.id
  AND repairable_bars.repaired_address IS NOT NULL;

-- Post-migration check (expected result: 0 rows)
-- SELECT id, name, address, phone
-- FROM bars
-- WHERE pg_temp.try_parse_jsonb(address) ? 'address';
