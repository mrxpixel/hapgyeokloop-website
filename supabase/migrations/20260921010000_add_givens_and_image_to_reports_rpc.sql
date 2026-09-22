-- Add stem_givens and image_url to admin_get_reports return.
--
-- Context: 신고 관리 화면은 admin_get_reports 로 문항을 받아 QuestionBlock 에 그대로 넘긴다.
-- 그런데 이 RPC 가 stem_givens 를 반환하지 않아, ReportItem(admin-sections.jsx:501)의
-- `stem_givens: r.q_stem_givens` 가 늘 undefined 였다. 그 상태로 저장을 누르면
-- serializeGivens([]) 가 payload:null 을 만들고 admin_update_question_v2 가
-- stem_givens 를 NULL 로 덮어쓴다 — 보기 박스가 조용히 사라진다.
--
-- 2026-09-21 실측: 보기 박스 보유 문항 716건, 그중 신고가 걸린 문항 84건. 실제로 닿는 경로다.
--
-- 20260603000000 이 검수 RPC(admin_get_questions_for_inspection)에 stem_givens 를 더한 것과
-- 같은 이유·같은 방식이다. 그때는 검수 화면만 고쳤고 신고 화면은 남아 있었다.
--
-- image_url 도 함께 더한다. 기출 원본 사진(20260921000000)이 들어오면 똑같은 소실이
-- 반복되기 때문이다. 어드민은 image_url 이 실려 온 경로에서만 admin_update_question_v3 을
-- 부르므로, 이 컬럼이 생기는 순간 신고 화면도 사진을 보고 안전하게 저장한다.
--
-- 추가만 한다 — 기존 컬럼 순서·이름, is_admin() 가드, 정렬은 그대로다.
--
-- Applied to the live project (fulgfanxrcjtsyzfrtjl) via Supabase MCP on 2026-09-21;
-- recorded here for repo↔DB provenance.

DROP FUNCTION IF EXISTS public.admin_get_reports();

CREATE OR REPLACE FUNCTION public.admin_get_reports()
 RETURNS TABLE(
   report_id uuid, report_user_id uuid, question_id text, reason text, detail text,
   status text, admin_response text, user_read_at timestamp with time zone,
   created_at timestamp with time zone, year_session integer, question_number integer,
   subject_id text, subject_display_name text,
   q_stem text, q_stem_givens jsonb, q_choices jsonb, q_correct_answer text,
   q_explanation text, q_image_url text)
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
           q.image_url
    FROM question_reports r
    LEFT JOIN questions q ON q.id = r.question_id
    LEFT JOIN subjects s ON s.id = q.subject_id
    ORDER BY r.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_reports() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_reports() TO authenticated;
