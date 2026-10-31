-- 신고 관리 화면에서 개념카드 신고가 어느 카드인지 보이게 한다.
--
-- 앱 개념카드 신고는 question_reports 에 target_type='concept', target_id=concept_note_children.id,
-- question_id=NULL 로 들어간다. 그런데 admin_get_reports 는 questions 만 붙여서
-- 개념카드 신고는 과목·회차·번호가 전부 비고, 어느 카드인지 알 길이 없었다.
--
-- 반환 컬럼을 뒤에 더한다(기존 컬럼 순서·이름, is_admin() 가드, 정렬은 그대로):
--   target_type, target_id                         — 신고 대상
--   concept_title, concept_subject_id/code/name    — 카드 제목·과목
--   concept_category_id, concept_exam_code         — 어드민 개념노트 편집에서 바로 열기용
-- 반환형이 바뀌므로 DROP 후 다시 만든다(어드민만 쓰는 함수).

BEGIN;

DROP FUNCTION IF EXISTS public.admin_get_reports();

CREATE FUNCTION public.admin_get_reports()
 RETURNS TABLE(report_id uuid, report_user_id uuid, question_id text, reason text, detail text, status text, admin_response text, user_read_at timestamp with time zone, created_at timestamp with time zone, year_session integer, question_number integer, subject_id text, subject_display_name text, q_stem text, q_stem_givens jsonb, q_choices jsonb, q_correct_answer text, q_explanation text, q_image_url text,
               target_type text, target_id text, concept_title text, concept_subject_id text, concept_subject_code text, concept_subject_name text, concept_category_id text, concept_exam_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
    SELECT r.id,
           r.user_id,
           r.question_id,
           r.reason,
           r.detail,
           r.status,
           r.admin_response,
           r.user_read_at,
           r.created_at,
           q.year_session,
           q.question_number,
           q.subject_id,
           s.name,
           q.stem,
           q.stem_givens,
           q.choices,
           q.correct_answer,
           q.explanation,
           q.image_url,
           COALESCE(r.target_type, 'question')::text,
           r.target_id::text,
           cnc.title,
           cs.id,
           cs.code,
           cs.name,
           ccm.category_id,
           (SELECT es.code FROM exam_subjects es WHERE es.exam_id_prefix = cs.exam_id ORDER BY es.code LIMIT 1)
    FROM question_reports r
    LEFT JOIN questions q ON q.id = r.question_id
    LEFT JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN concept_note_children cnc ON r.target_type = 'concept' AND cnc.id = r.target_id
    LEFT JOIN concept_note_pages cnp ON cnp.id = cnc.page_id
    LEFT JOIN subjects cs ON cs.id = cnp.subject_id
    LEFT JOIN concept_category_map ccm ON ccm.concept_id = cnc.id
    ORDER BY r.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_reports() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_reports() TO authenticated, service_role;

COMMIT;
