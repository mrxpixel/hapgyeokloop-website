-- 목적: 합격루프 어드민 개념노트 편집/검수 화면에 필요한 상태 컬럼, 단원 판정 뷰, 관리자 RPC를 추가한다.
-- 롤백 방법: 이 파일에서 추가한 RPC 7개, 트리거, 트리거 함수, 뷰를 제거한 뒤 concept_note_children의 새 컬럼 3개를 제거한다.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- 기존 행은 세 컬럼 모두 NULL로 유지한다. 이후 수정 시 updated_at은 아래 트리거가 기록한다.
ALTER TABLE public.concept_note_children
  ADD COLUMN updated_at TIMESTAMPTZ NULL DEFAULT NULL,
  ADD COLUMN admin_checked_at TIMESTAMPTZ NULL DEFAULT NULL,
  ADD COLUMN admin_checked_by UUID NULL DEFAULT NULL;

COMMENT ON COLUMN public.concept_note_children.updated_at
IS '개념노트 하위 개념의 마지막 수정 시각';

COMMENT ON COLUMN public.concept_note_children.admin_checked_at
IS '어드민 개념노트 전수조사에서 마지막으로 검수 완료 처리한 시각';

COMMENT ON COLUMN public.concept_note_children.admin_checked_by
IS '어드민 개념노트 전수조사에서 마지막으로 검수 완료 처리한 관리자 auth.users.id';

CREATE FUNCTION public.set_concept_note_children_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_concept_note_children_updated_at
BEFORE UPDATE ON public.concept_note_children
FOR EACH ROW
EXECUTE FUNCTION public.set_concept_note_children_updated_at();

COMMENT ON FUNCTION public.set_concept_note_children_updated_at()
IS 'concept_note_children 수정 시 updated_at을 현재 시각으로 갱신한다.';

REVOKE EXECUTE ON FUNCTION public.set_concept_note_children_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_concept_note_children_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_concept_note_children_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_concept_note_children_updated_at() FROM service_role;

-- 연결 문항의 category_id 최빈값을 개념의 단원으로 사용한다.
-- 동률이면 category_id 오름차순으로 하나를 선택하고, 연결 문항이 없으면 NULL을 반환한다.
CREATE VIEW public.concept_category_map (concept_id, category_id)
WITH (security_invoker = true)
AS
WITH category_counts AS (
  SELECT
    qc.concept_id,
    q.category_id,
    COUNT(DISTINCT qc.question_id) AS question_count
  FROM public.question_concepts AS qc
  JOIN public.questions AS q
    ON q.id = qc.question_id
  WHERE q.category_id IS NOT NULL
  GROUP BY qc.concept_id, q.category_id
),
ranked_categories AS (
  SELECT
    cc.concept_id,
    cc.category_id,
    ROW_NUMBER() OVER (
      PARTITION BY cc.concept_id
      ORDER BY cc.question_count DESC, cc.category_id ASC
    ) AS category_rank
  FROM category_counts AS cc
)
SELECT
  cnc.id AS concept_id,
  rc.category_id
FROM public.concept_note_children AS cnc
LEFT JOIN ranked_categories AS rc
  ON rc.concept_id = cnc.id
 AND rc.category_rank = 1;

COMMENT ON VIEW public.concept_category_map
IS '개념별 연결 문항의 category_id 최빈값을 단원으로 판정한다.';

REVOKE ALL ON TABLE public.concept_category_map FROM PUBLIC;
REVOKE ALL ON TABLE public.concept_category_map FROM anon;
REVOKE ALL ON TABLE public.concept_category_map FROM authenticated;
REVOKE ALL ON TABLE public.concept_category_map FROM service_role;
GRANT SELECT ON TABLE public.concept_category_map TO authenticated, service_role;

-- 1. 해당 시험에서 하위 개념이 하나 이상 존재하는 과목을 반환한다.
CREATE FUNCTION public.admin_get_concept_subjects(p_exam_id TEXT)
RETURNS TABLE(
  id TEXT,
  exam_id TEXT,
  code TEXT,
  name TEXT,
  level INT,
  sort_order INT,
  file_code TEXT,
  gemini_prompt_template TEXT,
  concept_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.exam_id,
    s.code,
    s.name,
    s.level,
    s.sort_order,
    s.file_code,
    s.gemini_prompt_template,
    COUNT(cnc.id)::INT AS concept_count
  FROM public.subjects AS s
  JOIN public.concept_note_pages AS cnp
    ON cnp.subject_id = s.id
  JOIN public.concept_note_children AS cnc
    ON cnc.page_id = cnp.id
  WHERE s.exam_id = p_exam_id
  GROUP BY
    s.id,
    s.exam_id,
    s.code,
    s.name,
    s.level,
    s.sort_order,
    s.file_code,
    s.gemini_prompt_template
  ORDER BY s.level ASC, s.sort_order ASC NULLS LAST, s.code ASC;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_concept_subjects(TEXT)
IS '개념노트가 존재하는 시험 과목과 과목별 개념 수를 반환한다.';

REVOKE EXECUTE ON FUNCTION public.admin_get_concept_subjects(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_concept_subjects(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_concept_subjects(TEXT) TO authenticated, service_role;

-- 2. 과목의 단원과 단원별 개념/문항 수를 반환한다.
CREATE FUNCTION public.admin_get_concept_units(p_subject_id TEXT)
RETURNS TABLE(
  id TEXT,
  code TEXT,
  name TEXT,
  sort_order INT,
  concept_count INT,
  question_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH concept_counts AS (
    SELECT
      ccm.category_id,
      COUNT(*)::INT AS concept_count
    FROM public.concept_category_map AS ccm
    WHERE ccm.category_id IS NOT NULL
    GROUP BY ccm.category_id
  ),
  question_counts AS (
    SELECT
      q.category_id,
      COUNT(*)::INT AS question_count
    FROM public.questions AS q
    WHERE q.category_id IS NOT NULL
    GROUP BY q.category_id
  )
  SELECT
    c.id,
    c.code,
    c.name,
    c.sort_order,
    COALESCE(cc.concept_count, 0)::INT AS concept_count,
    COALESCE(qc.question_count, 0)::INT AS question_count
  FROM public.categories AS c
  LEFT JOIN concept_counts AS cc
    ON cc.category_id = c.id
  LEFT JOIN question_counts AS qc
    ON qc.category_id = c.id
  WHERE c.subject_id = p_subject_id
  ORDER BY c.sort_order ASC NULLS LAST, c.code ASC, c.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_concept_units(TEXT)
IS '과목의 단원 목록과 최빈 단원 판정 기준 개념 수, 문항 수를 반환한다.';

REVOKE EXECUTE ON FUNCTION public.admin_get_concept_units(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_concept_units(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_concept_units(TEXT) TO authenticated, service_role;

-- 3. 과목 전체 또는 선택 단원의 개념 목록과 검수 상태를 반환한다.
CREATE FUNCTION public.admin_get_concepts_for_inspection(
  p_subject_id TEXT,
  p_category_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  id TEXT,
  page_id TEXT,
  page_title TEXT,
  chapter_id TEXT,
  chapter_label TEXT,
  category_id TEXT,
  category_name TEXT,
  title TEXT,
  summary TEXT,
  definition TEXT,
  key_points JSONB,
  exam_point TEXT,
  real_life_example TEXT,
  related_laws JSONB,
  sort_order INT,
  question_count INT,
  updated_at TIMESTAMPTZ,
  admin_checked_at TIMESTAMPTZ,
  admin_checked_by UUID,
  check_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH question_counts AS (
    SELECT
      qc.concept_id,
      COUNT(DISTINCT qc.question_id)::INT AS question_count
    FROM public.question_concepts AS qc
    JOIN public.questions AS q
      ON q.id = qc.question_id
    GROUP BY qc.concept_id
  )
  SELECT
    cnc.id,
    cnc.page_id,
    cnp.title AS page_title,
    cnp.chapter_id,
    cnp.chapter_label,
    ccm.category_id,
    c.name AS category_name,
    cnc.title,
    cnc.summary,
    cnc.definition,
    cnc.key_points,
    cnc.exam_point,
    cnc.real_life_example,
    cnc.related_laws,
    cnc.sort_order,
    COALESCE(qc.question_count, 0)::INT AS question_count,
    cnc.updated_at,
    cnc.admin_checked_at,
    cnc.admin_checked_by,
    CASE
      WHEN cnc.admin_checked_at IS NULL THEN 'unchecked'
      WHEN cnc.admin_checked_at >= COALESCE(cnc.updated_at, cnc.created_at) THEN 'checked'
      ELSE 'stale'
    END::TEXT AS check_status
  FROM public.concept_note_children AS cnc
  JOIN public.concept_note_pages AS cnp
    ON cnp.id = cnc.page_id
  LEFT JOIN public.concept_category_map AS ccm
    ON ccm.concept_id = cnc.id
  LEFT JOIN public.categories AS c
    ON c.id = ccm.category_id
  LEFT JOIN question_counts AS qc
    ON qc.concept_id = cnc.id
  WHERE cnp.subject_id = p_subject_id
    AND (p_category_id IS NULL OR ccm.category_id = p_category_id)
  ORDER BY
    cnp.sort_order ASC NULLS LAST,
    cnc.sort_order ASC NULLS LAST,
    cnc.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_concepts_for_inspection(TEXT, TEXT)
IS '과목/단원별 개념 목록과 unchecked/checked/stale 상태를 반환한다.';

REVOKE EXECUTE ON FUNCTION public.admin_get_concepts_for_inspection(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_concepts_for_inspection(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_concepts_for_inspection(TEXT, TEXT) TO authenticated, service_role;

-- 4. 개념에 연결된 기출 문항과 해설을 반환한다. 주개념 판정은 후속 작업 전까지 false로 고정한다.
CREATE FUNCTION public.admin_get_concept_questions(p_concept_id TEXT)
RETURNS TABLE(
  question_id TEXT,
  year_session INT,
  question_number INT,
  stem TEXT,
  stem_givens JSONB,
  choices JSONB,
  correct_answer TEXT,
  explanation TEXT,
  is_primary BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    q.id AS question_id,
    q.year_session,
    q.question_number,
    q.stem,
    q.stem_givens,
    q.choices,
    q.correct_answer,
    q.explanation,
    FALSE AS is_primary
  FROM public.question_concepts AS qc
  JOIN public.questions AS q
    ON q.id = qc.question_id
  WHERE qc.concept_id = p_concept_id
  ORDER BY q.year_session ASC, q.question_number ASC, q.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_concept_questions(TEXT)
IS '개념에 매핑된 기출 문항과 해설을 반환하며 is_primary는 후속 작업 전까지 false이다.';

REVOKE EXECUTE ON FUNCTION public.admin_get_concept_questions(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_concept_questions(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_concept_questions(TEXT) TO authenticated, service_role;

-- 5. 개념노트 하위 개념을 수정하고 감사 로그를 남긴다. updated_at은 트리거가 처리한다.
CREATE FUNCTION public.admin_update_concept_note(
  p_id TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_definition TEXT,
  p_key_points JSONB,
  p_exam_point TEXT,
  p_real_life_example TEXT,
  p_related_laws JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.concept_note_children AS cnc
  SET
    title = p_title,
    summary = p_summary,
    definition = p_definition,
    key_points = p_key_points,
    exam_point = p_exam_point,
    real_life_example = p_real_life_example,
    related_laws = p_related_laws
  WHERE cnc.id = p_id;

  PERFORM public.admin_log_action(
    'update_concept_note',
    'concept',
    p_id,
    LEFT(p_title, 60),
    jsonb_build_object()
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_update_concept_note(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB)
IS '개념노트 하위 개념을 수정하고 update_concept_note 감사 로그를 남긴다.';

REVOKE EXECUTE ON FUNCTION public.admin_update_concept_note(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_concept_note(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_concept_note(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 6.1 단일 개념을 검수 완료로 표시하고 감사 로그를 남긴다.
CREATE FUNCTION public.admin_mark_concept_checked(p_concept_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.concept_note_children AS cnc
  SET
    admin_checked_at = NOW(),
    admin_checked_by = auth.uid()
  WHERE cnc.id = p_concept_id;

  PERFORM public.admin_log_action(
    'check_concept',
    'concept',
    p_concept_id,
    p_concept_id,
    jsonb_build_object()
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_mark_concept_checked(TEXT)
IS '어드민이 개념을 검수 완료 처리하고 check_concept 감사 로그를 남긴다.';

REVOKE EXECUTE ON FUNCTION public.admin_mark_concept_checked(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_mark_concept_checked(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_concept_checked(TEXT) TO authenticated, service_role;

-- 6.2 단일 개념의 검수 완료 표시를 해제하고 감사 로그를 남긴다.
CREATE FUNCTION public.admin_unmark_concept_checked(p_concept_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.concept_note_children AS cnc
  SET
    admin_checked_at = NULL,
    admin_checked_by = NULL
  WHERE cnc.id = p_concept_id;

  PERFORM public.admin_log_action(
    'uncheck_concept',
    'concept',
    p_concept_id,
    p_concept_id,
    jsonb_build_object()
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_unmark_concept_checked(TEXT)
IS '어드민이 개념 검수 완료 표시를 해제하고 uncheck_concept 감사 로그를 남긴다.';

REVOKE EXECUTE ON FUNCTION public.admin_unmark_concept_checked(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unmark_concept_checked(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unmark_concept_checked(TEXT) TO authenticated, service_role;

COMMIT;
