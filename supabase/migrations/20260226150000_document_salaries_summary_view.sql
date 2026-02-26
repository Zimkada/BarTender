-- Migration: Document salaries_summary_mat as a regular view (not materialized)
-- Context:
--   Despite its _mat suffix, salaries_summary_mat is a regular VIEW (relkind = 'v'),
--   not a materialized view (relkind = 'm'). This was confirmed by diagnostic on
--   2026-02-26. Migration 20260226120000 correctly skipped it (relkind guard).
--
--   The regular view pattern is intentionally better for salaries because:
--     - Low data volume (few payroll entries per month)
--     - Always real-time (no refresh lag)
--     - Zero operational complexity (no REFRESH, no triggers, no debounce)
--
--   DO NOT attempt: REFRESH MATERIALIZED VIEW salaries_summary_mat
--   DO NOT rename to _mat unless converting to a true materialized view.

COMMENT ON VIEW public.salaries_summary_mat IS
  'Vue régulière (NON matérialisée) — données toujours en temps réel. '
  'Le suffixe _mat est un artefact historique de nommage. '
  'Ne jamais appeler REFRESH MATERIALIZED VIEW sur cette vue. '
  'Accès sécurisé via salaries_summary (security_invoker=false).';

COMMENT ON VIEW public.salaries_summary IS
  'Vue publique sécurisée sur salaries_summary_mat. '
  'security_invoker=false : exécutée en tant que propriétaire (postgres). '
  'Filtre RLS : bar_members WHERE user_id = auth.uid() AND is_active = true.';
