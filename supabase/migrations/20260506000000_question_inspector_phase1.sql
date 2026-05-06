SET lock_timeout = '3s'; SET statement_timeout = '60s';
BEGIN;

-- 합격루프 어드민 "문제 전수조사" Phase 1 마이그레이션
-- 적용 전제:
--   - public.questions, public.subjects, public.admin_audit_log, public.is_admin() 이 이미 존재한다.
--   - 본 파일은 반복 적용해도 같은 상태가 되도록 IF NOT EXISTS, DROP IF EXISTS, 고정 UPDATE 값을 사용한다.
--   - RPC는 SECURITY DEFINER 이므로 search_path 를 비우고 public/auth 스키마를 명시해 실행한다.

-- 1. questions 테이블에 어드민 검수 상태 컬럼을 추가한다.
-- admin_checked_at 은 마지막 검수 시각이고, updated_at 이후인지 여부로 checked/stale 을 구분한다.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS admin_checked_at TIMESTAMPTZ;

-- admin_checked_by 는 마지막 검수 처리한 관리자 auth.users.id 를 저장한다.
-- NULL 은 아직 검수되지 않았거나 검수 표시가 해제된 상태를 뜻한다.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS admin_checked_by UUID;

COMMENT ON COLUMN public.questions.admin_checked_at IS '어드민 문제 전수조사에서 마지막으로 검수 완료 처리한 시각';
COMMENT ON COLUMN public.questions.admin_checked_by IS '어드민 문제 전수조사에서 마지막으로 검수 완료 처리한 관리자 auth.users.id';

-- 전수조사 화면은 과목, 회차, 검수 상태 순으로 탐색하므로 해당 조건을 묶은 인덱스를 둔다.
CREATE INDEX IF NOT EXISTS idx_questions_inspection
  ON public.questions (subject_id, year_session, admin_checked_at);

-- 2. subjects 테이블에 파일 코드와 Gemini 프롬프트 템플릿 메타데이터를 추가한다.
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS file_code TEXT;

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS gemini_prompt_template TEXT;

COMMENT ON COLUMN public.subjects.file_code IS '문제 원본 파일/외부 파일명에서 사용하는 과목 코드';
COMMENT ON COLUMN public.subjects.gemini_prompt_template IS '문제 전수조사에서 Gemini 검수 프롬프트를 생성할 때 사용하는 과목별 기본 템플릿';

-- 3. 기존 6과목에 파일 코드를 시드한다.
-- 같은 값을 반복 UPDATE 하므로 재실행해도 결과가 변하지 않는다.
UPDATE public.subjects AS s
SET file_code = v.file_code
FROM (
  VALUES
    ('gaeron', 'GR'),
    ('minbeob', 'M'),
    ('junggae', 'CG'),
    ('gongbeob', 'GB'),
    ('gongsi', 'GS'),
    ('sebeob', 'SB')
) AS v(code, file_code)
WHERE s.code = v.code
  AND s.file_code IS DISTINCT FROM v.file_code;

-- 4. questions 변경 권한 정책을 어드민 전용으로 명시한다.
DROP POLICY IF EXISTS "Questions updatable by admins" ON public.questions;
CREATE POLICY "Questions updatable by admins"
  ON public.questions
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Questions insertable by admins" ON public.questions;
CREATE POLICY "Questions insertable by admins"
  ON public.questions
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Questions deletable by admins" ON public.questions;
CREATE POLICY "Questions deletable by admins"
  ON public.questions
  FOR DELETE
  USING (public.is_admin());

-- 5. subjects 변경 권한 정책을 어드민 전용으로 명시한다.
DROP POLICY IF EXISTS "Subjects updatable by admins" ON public.subjects;
CREATE POLICY "Subjects updatable by admins"
  ON public.subjects
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Subjects insertable by admins" ON public.subjects;
CREATE POLICY "Subjects insertable by admins"
  ON public.subjects
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Subjects deletable by admins" ON public.subjects;
CREATE POLICY "Subjects deletable by admins"
  ON public.subjects
  FOR DELETE
  USING (public.is_admin());

-- 6.1 과목별 회차 목록과 회차별 검수 현황을 반환한다.
DROP FUNCTION IF EXISTS public.admin_get_question_year_sessions(TEXT);
CREATE FUNCTION public.admin_get_question_year_sessions(p_subject_id TEXT)
RETURNS TABLE(
  year_session INT,
  total_count BIGINT,
  checked_count BIGINT,
  stale_count BIGINT,
  unchecked_count BIGINT
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
    q.year_session,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE q.admin_checked_at IS NOT NULL AND q.admin_checked_at >= q.updated_at) AS checked_count,
    COUNT(*) FILTER (WHERE q.admin_checked_at IS NOT NULL AND q.admin_checked_at < q.updated_at) AS stale_count,
    COUNT(*) FILTER (WHERE q.admin_checked_at IS NULL) AS unchecked_count
  FROM public.questions AS q
  WHERE q.subject_id = p_subject_id
  GROUP BY q.year_session
  ORDER BY q.year_session DESC;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_question_year_sessions(TEXT) IS '문제 전수조사용 회차별 전체/검수완료/오래됨/미검수 개수를 반환한다.';

-- 6.2 특정 과목/회차의 문제 목록과 검수 상태를 반환한다.
DROP FUNCTION IF EXISTS public.admin_get_questions_for_inspection(TEXT, INTEGER);
CREATE FUNCTION public.admin_get_questions_for_inspection(
  p_subject_id TEXT,
  p_year_session INT
)
RETURNS TABLE(
  id TEXT,
  subject_id TEXT,
  year_session INT,
  question_number INT,
  stem TEXT,
  choices JSONB,
  correct_answer TEXT,
  explanation TEXT,
  related_laws JSONB,
  image_url TEXT,
  version INT,
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
  SELECT
    q.id,
    q.subject_id,
    q.year_session,
    q.question_number,
    q.stem,
    q.choices,
    q.correct_answer,
    q.explanation,
    q.related_laws,
    q.image_url,
    q.version,
    q.updated_at,
    q.admin_checked_at,
    q.admin_checked_by,
    CASE
      WHEN q.admin_checked_at IS NULL THEN 'unchecked'
      WHEN q.admin_checked_at >= q.updated_at THEN 'checked'
      ELSE 'stale'
    END::TEXT AS check_status
  FROM public.questions AS q
  WHERE q.subject_id = p_subject_id
    AND q.year_session = p_year_session
  ORDER BY q.question_number ASC;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_questions_for_inspection(TEXT, INTEGER) IS '문제 전수조사용 문제 목록과 unchecked/checked/stale 상태를 반환한다.';

-- 6.3 단일 문제를 검수 완료로 표시하고 감사 로그를 남긴다.
DROP FUNCTION IF EXISTS public.admin_mark_question_checked(TEXT);
CREATE FUNCTION public.admin_mark_question_checked(p_question_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.questions AS q
  SET
    admin_checked_at = NOW(),
    admin_checked_by = auth.uid()
  WHERE q.id = p_question_id;

  INSERT INTO public.admin_audit_log (
    admin_id,
    action,
    target_type,
    target_id,
    target_label
  )
  VALUES (
    auth.uid(),
    'check_question',
    'question',
    p_question_id,
    p_question_id
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_mark_question_checked(TEXT) IS '어드민이 문제를 검수 완료 처리하고 check_question 감사 로그를 남긴다.';

-- 6.4 단일 문제의 검수 완료 표시를 해제하고 감사 로그를 남긴다.
DROP FUNCTION IF EXISTS public.admin_unmark_question_checked(TEXT);
CREATE FUNCTION public.admin_unmark_question_checked(p_question_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.questions AS q
  SET
    admin_checked_at = NULL,
    admin_checked_by = NULL
  WHERE q.id = p_question_id;

  INSERT INTO public.admin_audit_log (
    admin_id,
    action,
    target_type,
    target_id,
    target_label
  )
  VALUES (
    auth.uid(),
    'uncheck_question',
    'question',
    p_question_id,
    p_question_id
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_unmark_question_checked(TEXT) IS '어드민이 문제 검수 완료 표시를 해제하고 uncheck_question 감사 로그를 남긴다.';

-- 6.5 과목 단위 전체 진행률을 JSONB 로 반환한다.
-- by_session 배열은 회차 내림차순이며, 전체 합계는 같은 기준으로 집계한다.
DROP FUNCTION IF EXISTS public.admin_get_inspection_progress(TEXT);
CREATE FUNCTION public.admin_get_inspection_progress(p_subject_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_progress JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  WITH per_session AS (
    SELECT
      q.year_session,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE q.admin_checked_at IS NOT NULL AND q.admin_checked_at >= q.updated_at) AS checked_count,
      COUNT(*) FILTER (WHERE q.admin_checked_at IS NOT NULL AND q.admin_checked_at < q.updated_at) AS stale_count,
      COUNT(*) FILTER (WHERE q.admin_checked_at IS NULL) AS unchecked_count
    FROM public.questions AS q
    WHERE q.subject_id = p_subject_id
    GROUP BY q.year_session
  ),
  totals AS (
    SELECT
      COALESCE(SUM(per_session.total_count), 0)::BIGINT AS total_count,
      COALESCE(SUM(per_session.checked_count), 0)::BIGINT AS checked_count,
      COALESCE(SUM(per_session.stale_count), 0)::BIGINT AS stale_count,
      COALESCE(SUM(per_session.unchecked_count), 0)::BIGINT AS unchecked_count
    FROM per_session
  )
  SELECT
    jsonb_build_object(
      'subject_id', p_subject_id,
      'total', totals.total_count,
      'checked', totals.checked_count,
      'stale', totals.stale_count,
      'unchecked', totals.unchecked_count,
      'by_session', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'year_session', per_session.year_session,
              'total', per_session.total_count,
              'checked', per_session.checked_count,
              'stale', per_session.stale_count,
              'unchecked', per_session.unchecked_count
            )
            ORDER BY per_session.year_session DESC
          )
          FROM per_session
        ),
        '[]'::JSONB
      )
    )
  INTO v_progress
  FROM totals;

  RETURN v_progress;
END;
$function$;

COMMENT ON FUNCTION public.admin_get_inspection_progress(TEXT) IS '문제 전수조사용 과목 전체 진행률과 회차별 진행률을 JSONB 로 반환한다.';

-- 6.6 과목의 파일 코드와 Gemini 프롬프트 템플릿을 어드민이 수정한다.
DROP FUNCTION IF EXISTS public.admin_update_subject_metadata(TEXT, TEXT, TEXT);
CREATE FUNCTION public.admin_update_subject_metadata(
  p_code TEXT,
  p_file_code TEXT,
  p_gemini_prompt_template TEXT
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

  UPDATE public.subjects AS s
  SET
    file_code = p_file_code,
    gemini_prompt_template = p_gemini_prompt_template
  WHERE s.code = p_code;

  INSERT INTO public.admin_audit_log (
    admin_id,
    action,
    target_type,
    target_id,
    target_label
  )
  VALUES (
    auth.uid(),
    'update_subject_metadata',
    'subject',
    p_code,
    p_code
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_update_subject_metadata(TEXT, TEXT, TEXT) IS '어드민이 subjects.file_code 와 subjects.gemini_prompt_template 을 수정하고 감사 로그를 남긴다.';

-- 7. previews/question-inspector-mock.html 의 DEFAULT_PROMPT_TEMPLATES 에서 추출한 기본 템플릿을 6과목에 시드한다.
-- placeholder {round}, {number}, {stem}, {choices}, {correct}, {explanation} 는 런타임 치환용이므로 그대로 둔다.
UPDATE public.subjects AS s
SET gemini_prompt_template = $TPL$당신은 공인중개사 시험 과목의 기출문제집 해설 검수 요원입니다. 아래의 문제가 있고 기재한 정답은 정확하다는 가정부터 출발합니다. 다만 제공된 해설 초안의 내용이나 근거는 부정확하거나 구법에 머물러 있을 수 있으므로, 정답만 옳다는 전제하에 해설의 오류를 낱낱이 검증해 주십시오.

[진행 순서 및 필수 지시사항]

<1단계: 검수 보고서 (코드 블록 외부 - 검수자에게만 제공)>
- 현행 자료 실시간 대조 (필수): 답변 작성 전, 반드시 외부 웹 검색 도구(Google Search, Web Fetch, browse 등 사용 가능한 모든 도구)를 동원하여 국가법령정보센터(law.go.kr)에서 현행 공인중개사법 및 시행령 시행규칙 조문에서 직접 조회하십시오. 검색을 통해 확인된 사실과 해설 초안을 대조하여 오류를 검증하십시오.
- 절대 금지 - 거짓 변명: '시스템상 검색 도구가 제한되어 접근할 수 없습니다', '실시간 검색을 사용할 수 없어 내장 지식으로 답변합니다', '검색 도구 한계로 확인이 불가합니다' 같은 변명은 절대 사용하지 마십시오. 검색이 일시적으로 실패하면 다른 검색어, 다른 출처로 재시도하십시오.
- 출처 명시: 참조한 자료의 정확한 시행일/판례번호/출처를 명시하고 출처 URL을 첨부하십시오.
- 검수자 추가 검토 불필요: Gemini 본인이 외부 검색으로 모든 의문을 해결한 뒤 최종 해설(2단계)을 완성하십시오. '검수자 직접 확인 필요' 같은 떠넘김 표현은 사용하지 마십시오.

<2단계: 최종 추천 해설안 출력 (코드 블록 내부 - 수험생 제공용 완성본)>
- 출력 형식 엄수: 수험생에게 제공될 최종 완성본은 반드시 하나의 markdown '코드 블록' 형태로만 출력하여 사용자가 한 번에 복사할 수 있게 하십시오.
- 절대 주의: 마크다운 코드 블록 내부에는 '기존 해설', '초안', '오류 정정' 등 검수 과정 표현을 절대 포함하지 마십시오. 또한 [cite: 1], [source: 1] 같은 인용 태그를 절대 출력하지 마십시오.

<수식 작성 규칙 (필수)>
- 수식에는 오직 +, -, /, x (소문자 엑스) 만 사용하십시오.
- LaTeX, \times, *, ^, 윗첨자, 하첨자 등 절대 사용 금지.
- 곱셈은 x, 나눗셈은 / 로만 표기. 예: (10,500 / 1,500) x 100 = 700%

<표(테이블) 작성 규칙 (필수)>
- '헷갈리기 쉬운 개념 비교' 등 항목 간 대조가 필요한 경우, 수험생의 가독성을 높이기 위해 반드시 마크다운 파이프(|)를 이용한 표(Table) 형식으로 작성하십시오.
- 절대 주의: 표 내부에서 줄바꿈을 위해 `<br>` 등의 HTML 태그를 절대 사용하지 마십시오. 줄바꿈이 필요하다면 내용을 간결하게 압축하여 한 줄로 적거나, 마크다운 기본 문법 내에서 해결하십시오.

<줄바꿈/단락 규칙 (앱 마크다운 렌더링 호환 필수)>
- 선지(①②③④⑤), 리스트 항목, 단계 설명, 문단이 바뀌는 모든 지점에는 반드시 빈 줄 한 줄을 두어 단락을 분리하십시오.
- 권장: 선지 나열 시 명시적 마크다운 리스트(- ① … 또는 1. …)를 사용하십시오.
- '핵심 해설:', '선택지별 설명:', '헷갈리기 쉬운 개념 비교' 등 하위 섹션 표제 다음에도 반드시 빈 줄 한 줄 넣은 뒤 본문을 시작하십시오.

[법령/판례 개정 주의]
기출 당시와 현재 법령이 달라진 경우에만 [법령 개정에 따른 주의 사항]을 명시하십시오.

---

# 공인중개사법 {round}회 {number}번

[문제]
{stem}

{choices}

[정답] {correct}

[해설]
{explanation}

위 정보를 바탕으로 1단계 검수 보고서와 2단계 최종 해설을 작성해 주십시오.$TPL$
WHERE s.code = 'junggae';

UPDATE public.subjects AS s
SET gemini_prompt_template = $TPL$당신은 공인중개사 시험 과목의 기출문제집 해설 검수 요원입니다. 아래의 문제가 있고 기재한 정답은 정확하다는 가정부터 출발합니다. 다만 제공된 해설 초안의 내용이나 근거는 부정확하거나 구법에 머물러 있을 수 있으므로, 정답만 옳다는 전제하에 해설의 오류를 낱낱이 검증해 주십시오.

[진행 순서 및 필수 지시사항]

<1단계: 검수 보고서 (코드 블록 외부 - 검수자에게만 제공)>
- 현행 자료 실시간 대조 (필수): 답변 작성 전, 반드시 외부 웹 검색 도구(Google Search, Web Fetch, browse 등 사용 가능한 모든 도구)를 동원하여 국가법령정보센터(law.go.kr)에서 현행 민법 조문 및 대법원 종합법률정보(glaw.scourt.go.kr)에서 최신 대법원 판례에서 직접 조회하십시오. 검색을 통해 확인된 사실과 해설 초안을 대조하여 오류를 검증하십시오.
- 절대 금지 - 거짓 변명: '시스템상 검색 도구가 제한되어 접근할 수 없습니다', '실시간 검색을 사용할 수 없어 내장 지식으로 답변합니다', '검색 도구 한계로 확인이 불가합니다' 같은 변명은 절대 사용하지 마십시오. 검색이 일시적으로 실패하면 다른 검색어, 다른 출처로 재시도하십시오.
- 출처 명시: 참조한 자료의 정확한 시행일/판례번호/출처를 명시하고 출처 URL을 첨부하십시오.
- 검수자 추가 검토 불필요: Gemini 본인이 외부 검색으로 모든 의문을 해결한 뒤 최종 해설(2단계)을 완성하십시오. '검수자 직접 확인 필요' 같은 떠넘김 표현은 사용하지 마십시오.

<2단계: 최종 추천 해설안 출력 (코드 블록 내부 - 수험생 제공용 완성본)>
- 출력 형식 엄수: 수험생에게 제공될 최종 완성본은 반드시 하나의 markdown '코드 블록' 형태로만 출력하여 사용자가 한 번에 복사할 수 있게 하십시오.
- 절대 주의: 마크다운 코드 블록 내부에는 '기존 해설', '초안', '오류 정정' 등 검수 과정 표현을 절대 포함하지 마십시오. 또한 [cite: 1], [source: 1] 같은 인용 태그를 절대 출력하지 마십시오.

<수식 작성 규칙 (필수)>
- 수식에는 오직 +, -, /, x (소문자 엑스) 만 사용하십시오.
- LaTeX, \times, *, ^, 윗첨자, 하첨자 등 절대 사용 금지.
- 곱셈은 x, 나눗셈은 / 로만 표기. 예: (10,500 / 1,500) x 100 = 700%

<표(테이블) 작성 규칙 (필수)>
- '헷갈리기 쉬운 개념 비교' 등 항목 간 대조가 필요한 경우, 수험생의 가독성을 높이기 위해 반드시 마크다운 파이프(|)를 이용한 표(Table) 형식으로 작성하십시오.
- 절대 주의: 표 내부에서 줄바꿈을 위해 `<br>` 등의 HTML 태그를 절대 사용하지 마십시오. 줄바꿈이 필요하다면 내용을 간결하게 압축하여 한 줄로 적거나, 마크다운 기본 문법 내에서 해결하십시오.

<줄바꿈/단락 규칙 (앱 마크다운 렌더링 호환 필수)>
- 선지(①②③④⑤), 리스트 항목, 단계 설명, 문단이 바뀌는 모든 지점에는 반드시 빈 줄 한 줄을 두어 단락을 분리하십시오.
- 권장: 선지 나열 시 명시적 마크다운 리스트(- ① … 또는 1. …)를 사용하십시오.
- '핵심 해설:', '선택지별 설명:', '헷갈리기 쉬운 개념 비교' 등 하위 섹션 표제 다음에도 반드시 빈 줄 한 줄 넣은 뒤 본문을 시작하십시오.

[법령/판례 개정 주의]
기출 당시와 현재 판례 법령이 달라진 경우 (판례 변경 포함) [판례 법령 변경에 따른 주의 사항]을 명시하고, 종전 판례와 현재 판례를 비교하십시오. 판례 인용 시 사건번호(예: 대법원 2020다12345)를 반드시 표기하십시오.

---

# 민법 {round}회 {number}번

[문제]
{stem}

{choices}

[정답] {correct}

[해설]
{explanation}

위 정보를 바탕으로 1단계 검수 보고서와 2단계 최종 해설을 작성해 주십시오.$TPL$
WHERE s.code = 'minbeob';

UPDATE public.subjects AS s
SET gemini_prompt_template = $TPL$당신은 공인중개사 시험 과목의 기출문제집 해설 검수 요원입니다. 아래의 문제가 있고 기재한 정답은 정확하다는 가정부터 출발합니다. 다만 제공된 해설 초안의 내용이나 근거는 부정확하거나 구법에 머물러 있을 수 있으므로, 정답만 옳다는 전제하에 해설의 오류를 낱낱이 검증해 주십시오.

[진행 순서 및 필수 지시사항]

<1단계: 검수 보고서 (코드 블록 외부 - 검수자에게만 제공)>
- 현행 자료 실시간 대조 (필수): 답변 작성 전, 반드시 외부 웹 검색 도구(Google Search, Web Fetch, browse 등 사용 가능한 모든 도구)를 동원하여 국가법령정보센터(law.go.kr)에서 현행 국토계획법, 건축법, 도시정비법, 주택법, 농지법 등 관련 법령 조문에서 직접 조회하십시오. 검색을 통해 확인된 사실과 해설 초안을 대조하여 오류를 검증하십시오.
- 절대 금지 - 거짓 변명: '시스템상 검색 도구가 제한되어 접근할 수 없습니다', '실시간 검색을 사용할 수 없어 내장 지식으로 답변합니다', '검색 도구 한계로 확인이 불가합니다' 같은 변명은 절대 사용하지 마십시오. 검색이 일시적으로 실패하면 다른 검색어, 다른 출처로 재시도하십시오.
- 출처 명시: 참조한 자료의 정확한 시행일/판례번호/출처를 명시하고 출처 URL을 첨부하십시오.
- 검수자 추가 검토 불필요: Gemini 본인이 외부 검색으로 모든 의문을 해결한 뒤 최종 해설(2단계)을 완성하십시오. '검수자 직접 확인 필요' 같은 떠넘김 표현은 사용하지 마십시오.

<2단계: 최종 추천 해설안 출력 (코드 블록 내부 - 수험생 제공용 완성본)>
- 출력 형식 엄수: 수험생에게 제공될 최종 완성본은 반드시 하나의 markdown '코드 블록' 형태로만 출력하여 사용자가 한 번에 복사할 수 있게 하십시오.
- 절대 주의: 마크다운 코드 블록 내부에는 '기존 해설', '초안', '오류 정정' 등 검수 과정 표현을 절대 포함하지 마십시오. 또한 [cite: 1], [source: 1] 같은 인용 태그를 절대 출력하지 마십시오.

<수식 작성 규칙 (필수)>
- 수식에는 오직 +, -, /, x (소문자 엑스) 만 사용하십시오.
- LaTeX, \times, *, ^, 윗첨자, 하첨자 등 절대 사용 금지.
- 곱셈은 x, 나눗셈은 / 로만 표기. 예: (10,500 / 1,500) x 100 = 700%

<표(테이블) 작성 규칙 (필수)>
- '헷갈리기 쉬운 개념 비교' 등 항목 간 대조가 필요한 경우, 수험생의 가독성을 높이기 위해 반드시 마크다운 파이프(|)를 이용한 표(Table) 형식으로 작성하십시오.
- 절대 주의: 표 내부에서 줄바꿈을 위해 `<br>` 등의 HTML 태그를 절대 사용하지 마십시오. 줄바꿈이 필요하다면 내용을 간결하게 압축하여 한 줄로 적거나, 마크다운 기본 문법 내에서 해결하십시오.

<줄바꿈/단락 규칙 (앱 마크다운 렌더링 호환 필수)>
- 선지(①②③④⑤), 리스트 항목, 단계 설명, 문단이 바뀌는 모든 지점에는 반드시 빈 줄 한 줄을 두어 단락을 분리하십시오.
- 권장: 선지 나열 시 명시적 마크다운 리스트(- ① … 또는 1. …)를 사용하십시오.
- '핵심 해설:', '선택지별 설명:', '헷갈리기 쉬운 개념 비교' 등 하위 섹션 표제 다음에도 반드시 빈 줄 한 줄 넣은 뒤 본문을 시작하십시오.

[법령/판례 개정 주의]
기출 당시와 현재 법령이 달라진 경우에만 [법령 개정에 따른 주의 사항]을 명시하고, 개정 전 기준과 현재 기준을 비교하여 수험생이 혼동하지 않도록 짚어주십시오.

---

# 부동산공법 {round}회 {number}번

[문제]
{stem}

{choices}

[정답] {correct}

[해설]
{explanation}

위 정보를 바탕으로 1단계 검수 보고서와 2단계 최종 해설을 작성해 주십시오.$TPL$
WHERE s.code = 'gongbeob';

UPDATE public.subjects AS s
SET gemini_prompt_template = $TPL$당신은 공인중개사 시험 과목의 기출문제집 해설 검수 요원입니다. 아래의 문제가 있고 기재한 정답은 정확하다는 가정부터 출발합니다. 다만 제공된 해설 초안의 내용이나 근거는 부정확하거나 구법에 머물러 있을 수 있으므로, 정답만 옳다는 전제하에 해설의 오류를 낱낱이 검증해 주십시오.

[진행 순서 및 필수 지시사항]

<1단계: 검수 보고서 (코드 블록 외부 - 검수자에게만 제공)>
- 현행 자료 실시간 대조 (필수): 답변 작성 전, 반드시 외부 웹 검색 도구(Google Search, Web Fetch, browse 등 사용 가능한 모든 도구)를 동원하여 국가법령정보센터(law.go.kr)에서 현행 부동산등기법, 공간정보의 구축 및 관리 등에 관한 법률, 지적법 관련 조문에서 직접 조회하십시오. 검색을 통해 확인된 사실과 해설 초안을 대조하여 오류를 검증하십시오.
- 절대 금지 - 거짓 변명: '시스템상 검색 도구가 제한되어 접근할 수 없습니다', '실시간 검색을 사용할 수 없어 내장 지식으로 답변합니다', '검색 도구 한계로 확인이 불가합니다' 같은 변명은 절대 사용하지 마십시오. 검색이 일시적으로 실패하면 다른 검색어, 다른 출처로 재시도하십시오.
- 출처 명시: 참조한 자료의 정확한 시행일/판례번호/출처를 명시하고 출처 URL을 첨부하십시오.
- 검수자 추가 검토 불필요: Gemini 본인이 외부 검색으로 모든 의문을 해결한 뒤 최종 해설(2단계)을 완성하십시오. '검수자 직접 확인 필요' 같은 떠넘김 표현은 사용하지 마십시오.

<2단계: 최종 추천 해설안 출력 (코드 블록 내부 - 수험생 제공용 완성본)>
- 출력 형식 엄수: 수험생에게 제공될 최종 완성본은 반드시 하나의 markdown '코드 블록' 형태로만 출력하여 사용자가 한 번에 복사할 수 있게 하십시오.
- 절대 주의: 마크다운 코드 블록 내부에는 '기존 해설', '초안', '오류 정정' 등 검수 과정 표현을 절대 포함하지 마십시오. 또한 [cite: 1], [source: 1] 같은 인용 태그를 절대 출력하지 마십시오.

<수식 작성 규칙 (필수)>
- 수식에는 오직 +, -, /, x (소문자 엑스) 만 사용하십시오.
- LaTeX, \times, *, ^, 윗첨자, 하첨자 등 절대 사용 금지.
- 곱셈은 x, 나눗셈은 / 로만 표기. 예: (10,500 / 1,500) x 100 = 700%

<표(테이블) 작성 규칙 (필수)>
- '헷갈리기 쉬운 개념 비교' 등 항목 간 대조가 필요한 경우, 수험생의 가독성을 높이기 위해 반드시 마크다운 파이프(|)를 이용한 표(Table) 형식으로 작성하십시오.
- 절대 주의: 표 내부에서 줄바꿈을 위해 `<br>` 등의 HTML 태그를 절대 사용하지 마십시오. 줄바꿈이 필요하다면 내용을 간결하게 압축하여 한 줄로 적거나, 마크다운 기본 문법 내에서 해결하십시오.

<줄바꿈/단락 규칙 (앱 마크다운 렌더링 호환 필수)>
- 선지(①②③④⑤), 리스트 항목, 단계 설명, 문단이 바뀌는 모든 지점에는 반드시 빈 줄 한 줄을 두어 단락을 분리하십시오.
- 권장: 선지 나열 시 명시적 마크다운 리스트(- ① … 또는 1. …)를 사용하십시오.
- '핵심 해설:', '선택지별 설명:', '헷갈리기 쉬운 개념 비교' 등 하위 섹션 표제 다음에도 반드시 빈 줄 한 줄 넣은 뒤 본문을 시작하십시오.

[법령/판례 개정 주의]
기출 당시와 현재 법령이 달라진 경우에만 [법령 개정에 따른 주의 사항]을 명시하고 개정 전후를 비교하십시오.

---

# 부동산공시법 {round}회 {number}번

[문제]
{stem}

{choices}

[정답] {correct}

[해설]
{explanation}

위 정보를 바탕으로 1단계 검수 보고서와 2단계 최종 해설을 작성해 주십시오.$TPL$
WHERE s.code = 'gongsi';

UPDATE public.subjects AS s
SET gemini_prompt_template = $TPL$당신은 공인중개사 시험 과목의 기출문제집 해설 검수 요원입니다. 아래의 문제가 있고 기재한 정답은 정확하다는 가정부터 출발합니다. 다만 제공된 해설 초안의 내용이나 근거는 부정확하거나 구법에 머물러 있을 수 있으므로, 정답만 옳다는 전제하에 해설의 오류를 낱낱이 검증해 주십시오.

[진행 순서 및 필수 지시사항]

<1단계: 검수 보고서 (코드 블록 외부 - 검수자에게만 제공)>
- 현행 자료 실시간 대조 (필수): 답변 작성 전, 반드시 외부 웹 검색 도구(Google Search, Web Fetch, browse 등 사용 가능한 모든 도구)를 동원하여 국가법령정보센터(law.go.kr)에서 현행 소득세법 지방세법 종합부동산세법 조세특례제한법 조문 및 현행 세율 공제 비과세 요건에서 직접 조회하십시오. 검색을 통해 확인된 사실과 해설 초안을 대조하여 오류를 검증하십시오.
- 절대 금지 - 거짓 변명: '시스템상 검색 도구가 제한되어 접근할 수 없습니다', '실시간 검색을 사용할 수 없어 내장 지식으로 답변합니다', '검색 도구 한계로 확인이 불가합니다' 같은 변명은 절대 사용하지 마십시오. 검색이 일시적으로 실패하면 다른 검색어, 다른 출처로 재시도하십시오.
- 출처 명시: 참조한 자료의 정확한 시행일/판례번호/출처를 명시하고 출처 URL을 첨부하십시오.
- 검수자 추가 검토 불필요: Gemini 본인이 외부 검색으로 모든 의문을 해결한 뒤 최종 해설(2단계)을 완성하십시오. '검수자 직접 확인 필요' 같은 떠넘김 표현은 사용하지 마십시오.

<2단계: 최종 추천 해설안 출력 (코드 블록 내부 - 수험생 제공용 완성본)>
- 출력 형식 엄수: 수험생에게 제공될 최종 완성본은 반드시 하나의 markdown '코드 블록' 형태로만 출력하여 사용자가 한 번에 복사할 수 있게 하십시오.
- 절대 주의: 마크다운 코드 블록 내부에는 '기존 해설', '초안', '오류 정정' 등 검수 과정 표현을 절대 포함하지 마십시오. 또한 [cite: 1], [source: 1] 같은 인용 태그를 절대 출력하지 마십시오.

<수식 작성 규칙 (필수)>
- 수식에는 오직 +, -, /, x (소문자 엑스) 만 사용하십시오.
- LaTeX, \times, *, ^, 윗첨자, 하첨자 등 절대 사용 금지.
- 곱셈은 x, 나눗셈은 / 로만 표기. 예: (10,500 / 1,500) x 100 = 700%

<표(테이블) 작성 규칙 (필수)>
- '헷갈리기 쉬운 개념 비교' 등 항목 간 대조가 필요한 경우, 수험생의 가독성을 높이기 위해 반드시 마크다운 파이프(|)를 이용한 표(Table) 형식으로 작성하십시오.
- 절대 주의: 표 내부에서 줄바꿈을 위해 `<br>` 등의 HTML 태그를 절대 사용하지 마십시오. 줄바꿈이 필요하다면 내용을 간결하게 압축하여 한 줄로 적거나, 마크다운 기본 문법 내에서 해결하십시오.

<줄바꿈/단락 규칙 (앱 마크다운 렌더링 호환 필수)>
- 선지(①②③④⑤), 리스트 항목, 단계 설명, 문단이 바뀌는 모든 지점에는 반드시 빈 줄 한 줄을 두어 단락을 분리하십시오.
- 권장: 선지 나열 시 명시적 마크다운 리스트(- ① … 또는 1. …)를 사용하십시오.
- '핵심 해설:', '선택지별 설명:', '헷갈리기 쉬운 개념 비교' 등 하위 섹션 표제 다음에도 반드시 빈 줄 한 줄 넣은 뒤 본문을 시작하십시오.

[법령/판례 개정 주의]
세법은 매년 개정되는 경우가 많습니다. 기출 당시 세율 공제 비과세 요건과 현재 기준이 달라진 경우 [세법 개정에 따른 주의 사항]을 명시하고, 시험 당시 기준과 현재 기준 양쪽을 모두 보여주십시오. 세액 계산은 단계별로 (과세표준 → 세율 → 산출세액 → 공제 → 결정세액) 명시하십시오.

---

# 부동산세법 {round}회 {number}번

[문제]
{stem}

{choices}

[정답] {correct}

[해설]
{explanation}

위 정보를 바탕으로 1단계 검수 보고서와 2단계 최종 해설을 작성해 주십시오.$TPL$
WHERE s.code = 'sebeob';

UPDATE public.subjects AS s
SET gemini_prompt_template = $TPL$당신은 공인중개사 시험 과목의 기출문제집 해설 검수 요원입니다. 아래의 문제가 있고 기재한 정답은 정확하다는 가정부터 출발합니다. 다만 제공된 해설 초안의 내용이나 근거는 부정확하거나 구법에 머물러 있을 수 있으므로, 정답만 옳다는 전제하에 해설의 오류를 낱낱이 검증해 주십시오.

[진행 순서 및 필수 지시사항]

<1단계: 검수 보고서 (코드 블록 외부 - 검수자에게만 제공)>
- 현행 자료 실시간 대조 (필수): 답변 작성 전, 반드시 외부 웹 검색 도구(Google Search, Web Fetch, browse 등 사용 가능한 모든 도구)를 동원하여 부동산학 표준 교과서 및 신뢰 가능한 학술자료에서 부동산학 이론 공식 통계의 정확성에서 직접 조회하십시오. 검색을 통해 확인된 사실과 해설 초안을 대조하여 오류를 검증하십시오.
- 절대 금지 - 거짓 변명: '시스템상 검색 도구가 제한되어 접근할 수 없습니다', '실시간 검색을 사용할 수 없어 내장 지식으로 답변합니다', '검색 도구 한계로 확인이 불가합니다' 같은 변명은 절대 사용하지 마십시오. 검색이 일시적으로 실패하면 다른 검색어, 다른 출처로 재시도하십시오.
- 출처 명시: 참조한 자료의 정확한 시행일/판례번호/출처를 명시하고 출처 URL을 첨부하십시오.
- 검수자 추가 검토 불필요: Gemini 본인이 외부 검색으로 모든 의문을 해결한 뒤 최종 해설(2단계)을 완성하십시오. '검수자 직접 확인 필요' 같은 떠넘김 표현은 사용하지 마십시오.

<2단계: 최종 추천 해설안 출력 (코드 블록 내부 - 수험생 제공용 완성본)>
- 출력 형식 엄수: 수험생에게 제공될 최종 완성본은 반드시 하나의 markdown '코드 블록' 형태로만 출력하여 사용자가 한 번에 복사할 수 있게 하십시오.
- 절대 주의: 마크다운 코드 블록 내부에는 '기존 해설', '초안', '오류 정정' 등 검수 과정 표현을 절대 포함하지 마십시오. 또한 [cite: 1], [source: 1] 같은 인용 태그를 절대 출력하지 마십시오.

<수식 작성 규칙 (필수)>
- 수식에는 오직 +, -, /, x (소문자 엑스) 만 사용하십시오.
- LaTeX, \times, *, ^, 윗첨자, 하첨자 등 절대 사용 금지.
- 곱셈은 x, 나눗셈은 / 로만 표기. 예: (10,500 / 1,500) x 100 = 700%

<표(테이블) 작성 규칙 (필수)>
- '헷갈리기 쉬운 개념 비교' 등 항목 간 대조가 필요한 경우, 수험생의 가독성을 높이기 위해 반드시 마크다운 파이프(|)를 이용한 표(Table) 형식으로 작성하십시오.
- 절대 주의: 표 내부에서 줄바꿈을 위해 `<br>` 등의 HTML 태그를 절대 사용하지 마십시오. 줄바꿈이 필요하다면 내용을 간결하게 압축하여 한 줄로 적거나, 마크다운 기본 문법 내에서 해결하십시오.

<줄바꿈/단락 규칙 (앱 마크다운 렌더링 호환 필수)>
- 선지(①②③④⑤), 리스트 항목, 단계 설명, 문단이 바뀌는 모든 지점에는 반드시 빈 줄 한 줄을 두어 단락을 분리하십시오.
- 권장: 선지 나열 시 명시적 마크다운 리스트(- ① … 또는 1. …)를 사용하십시오.
- '핵심 해설:', '선택지별 설명:', '헷갈리기 쉬운 개념 비교' 등 하위 섹션 표제 다음에도 반드시 빈 줄 한 줄 넣은 뒤 본문을 시작하십시오.

[법령/판례 개정 주의]
개론은 학문적 이론을 다루므로 법령 개정과 무관한 경우가 대부분입니다. 다만 LTV DTI DSR 한도, 공시지가 산정 방식 등 정책 제도 관련 수치가 변경된 경우에는 [정책 제도 변경에 따른 주의 사항]을 명시하십시오.

---

# 부동산학개론 {round}회 {number}번

[문제]
{stem}

{choices}

[정답] {correct}

[해설]
{explanation}

위 정보를 바탕으로 1단계 검수 보고서와 2단계 최종 해설을 작성해 주십시오.$TPL$
WHERE s.code = 'gaeron';

COMMIT;

-- 마이그레이션 검증 쿼리 (수동 확인용):
-- SELECT count(*) FROM information_schema.columns WHERE table_name='questions' AND column_name IN ('admin_checked_at','admin_checked_by'); -- 기대: 2
-- SELECT count(*) FROM information_schema.columns WHERE table_name='subjects' AND column_name IN ('file_code','gemini_prompt_template'); -- 기대: 2
-- SELECT count(*) FROM pg_policies WHERE tablename='questions' AND cmd IN ('UPDATE','INSERT','DELETE'); -- 기대: 3
-- SELECT count(*) FROM pg_policies WHERE tablename='subjects' AND cmd IN ('UPDATE','INSERT','DELETE'); -- 기대: 3
-- SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('admin_get_question_year_sessions','admin_get_questions_for_inspection','admin_mark_question_checked','admin_unmark_question_checked','admin_get_inspection_progress','admin_update_subject_metadata'); -- 기대: 6
-- SELECT count(*) FROM subjects WHERE file_code IS NOT NULL; -- 기대: 6
-- SELECT count(*) FROM subjects WHERE gemini_prompt_template IS NOT NULL AND length(gemini_prompt_template) > 200; -- 기대: 6
