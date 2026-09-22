-- Restrict direct browser execution of admin RPCs.
--
-- The admin UI calls admin_* RPCs after login, so normal admin RPCs remain
-- executable by authenticated users. Anonymous users should not be able to
-- execute these SECURITY DEFINER functions directly.
--
-- Trigger/event-trigger helper functions are not called by the browser, so
-- remove direct execute access for both anon and authenticated roles.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT
      p.oid::regprocedure AS signature,
      t.typname AS return_type
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_type AS t ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'admin\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.signature);

    IF fn.return_type IN ('trigger', 'event_trigger') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.signature);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature);
    END IF;
  END LOOP;
END $$;

-- Event trigger function used internally by the database, not by PostgREST.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
