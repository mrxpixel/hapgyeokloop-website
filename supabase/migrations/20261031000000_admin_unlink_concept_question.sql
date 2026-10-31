-- 개념노트 기출 탭: 개념과 관련 없는 문항의 연결(question_concepts 1행)을 해제한다.
-- 앱의 개념노트 노출(get_concept_notes_v2)과 새 문제 약점 가중(fetch_new_questions)이
-- 이 연결을 매번 서버에서 다시 계산하므로 별도 동기화는 필요 없다.
-- 되돌리기: admin_audit_log 의 metadata(question_id, concept_id)로 다시 INSERT.

CREATE OR REPLACE FUNCTION public.admin_unlink_concept_question(p_concept_id TEXT, p_question_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501'; END IF;

  DELETE FROM public.question_concepts AS qc
  WHERE qc.concept_id = p_concept_id
    AND qc.question_id = p_question_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    PERFORM public.admin_log_action(
      'unlink_concept_question', 'concept', p_concept_id, p_question_id,
      jsonb_build_object('concept_id', p_concept_id, 'question_id', p_question_id)
    );
  END IF;

  RETURN v_deleted;
END;
$function$;

COMMENT ON FUNCTION public.admin_unlink_concept_question(TEXT, TEXT)
IS '개념-기출 연결 1건을 해제하고 감사 로그에 남긴다. 해제한 행 수(0 또는 1)를 반환한다.';

REVOKE EXECUTE ON FUNCTION public.admin_unlink_concept_question(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unlink_concept_question(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unlink_concept_question(TEXT, TEXT) TO authenticated, service_role;
