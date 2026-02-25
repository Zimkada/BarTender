-- Migration: Corriger les warnings "Function Search Path Mutable" du Security Advisor
-- Description:
--   Applique SET search_path = public sur TOUTES les fonctions du schéma public
--   qui n'ont pas encore ce paramètre fixé.
--
--   Pourquoi : Une fonction sans search_path fixé est vulnérable à une
--   attaque par substitution de schéma (schema injection). Un attaquant
--   ayant accès DDL pourrait créer un faux schéma et détourner les appels.
--   Sur Supabase, les utilisateurs `authenticated` ne peuvent pas créer de
--   schémas, donc le risque pratique est nul — mais c'est une bonne pratique.
--
-- Author: Zimkada
-- Date: 2026-02-25

DO $$
DECLARE
  func_record RECORD;
  alter_stmt  TEXT;
  fixed_count INTEGER := 0;
BEGIN
  FOR func_record IN
    SELECT
      p.proname                                       AS function_name,
      pg_get_function_identity_arguments(p.oid)       AS function_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')   -- fonctions ordinaires et procédures
      AND NOT EXISTS (
        SELECT 1
        FROM pg_options_to_table(p.proconfig)
        WHERE option_name = 'search_path'
      )
    ORDER BY p.proname
  LOOP
    BEGIN
      alter_stmt := format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions',
        func_record.function_name,
        func_record.function_args
      );
      EXECUTE alter_stmt;
      fixed_count := fixed_count + 1;
      RAISE NOTICE '[search_path fix] %', alter_stmt;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore les fonctions système ou celles qui ne supportent pas ALTER
      RAISE WARNING '[search_path fix] Skipped %(%): %',
        func_record.function_name,
        func_record.function_args,
        SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[search_path fix] Done — % function(s) updated.', fixed_count;
END;
$$;
