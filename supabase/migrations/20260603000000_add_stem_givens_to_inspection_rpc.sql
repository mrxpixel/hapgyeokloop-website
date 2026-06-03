-- Add stem_givens to admin_get_questions_for_inspection return.
--
-- Context: Phase C (admin v3) adds a 보기 박스(stem_givens) editor to QuestionBlock.
-- The inspection RPC did not return stem_givens, so re-editing a question would load
-- empty givens and overwrite/wipe them on save. This adds stem_givens to the returned
-- columns so the editor round-trips safely. Additive only — every other column and the
-- is_admin() guard are unchanged.
--
-- Applied to the live project (fulgfanxrcjtsyzfrtjl) via Supabase MCP on 2026-06-03;
-- recorded here for repo↔DB provenance.

DROP FUNCTION IF EXISTS public.admin_get_questions_for_inspection(text, integer);

CREATE OR REPLACE FUNCTION public.admin_get_questions_for_inspection(p_subject_id text, p_year_session integer)
 RETURNS TABLE(
   id text, subject_id text, year_session integer, question_number integer,
   stem text, stem_givens jsonb, choices jsonb, correct_answer text, explanation text,
   related_laws jsonb, image_url text, version integer, updated_at timestamp with time zone,
   admin_checked_at timestamp with time zone, admin_checked_by uuid, check_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    q.id, q.subject_id, q.year_session, q.question_number,
    q.stem, q.stem_givens, q.choices, q.correct_answer, q.explanation,
    q.related_laws, q.image_url, q.version, q.updated_at,
    q.admin_checked_at, q.admin_checked_by,
    CASE
      WHEN q.admin_checked_at IS NULL THEN 'unchecked'
      WHEN q.admin_checked_at >= q.updated_at THEN 'checked'
      ELSE 'stale'
    END::TEXT AS check_status
  FROM public.questions AS q
  WHERE q.subject_id = p_subject_id AND q.year_session = p_year_session
  ORDER BY q.question_number ASC;
END;
$function$;
