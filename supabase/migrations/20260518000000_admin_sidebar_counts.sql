-- Return lightweight badge counts for the admin sidebar.
-- The reports/admins pages still use their existing list RPCs when opened.

CREATE OR REPLACE FUNCTION public.admin_get_sidebar_counts()
RETURNS TABLE(
  pending_reports INTEGER,
  pending_admins INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT COUNT(*)::INTEGER
      FROM public.question_reports
      WHERE status = 'pending'
    ) AS pending_reports,
    CASE
      WHEN public.is_super_admin() THEN (
        SELECT COUNT(*)::INTEGER
        FROM public.admin_users
        WHERE status = 'pending'
      )
      ELSE 0
    END AS pending_admins;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_sidebar_counts()
IS 'Returns lightweight pending report/admin signup counts for the admin sidebar.';

REVOKE EXECUTE ON FUNCTION public.admin_get_sidebar_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_sidebar_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sidebar_counts() TO authenticated;
