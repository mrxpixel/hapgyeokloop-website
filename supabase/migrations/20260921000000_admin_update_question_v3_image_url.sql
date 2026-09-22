-- Add image_url writes to the question editor save path.
--
-- Context: 문항 그림을 SVG 대신 기출 원본 사진으로 싣기로 확정(2026-09-21). 전달 방식은
-- questions.image_url 에 base64 data URI 를 넣는 1안이다. 읽기 배관은 이미 살아 있다 —
-- admin_get_questions_for_inspection 이 image_url 을 반환하고(20260603000000), 앱도
-- Supabase → Drift → provider 까지 컬럼을 들고 온다. 없는 건 쓰기뿐이었다:
-- admin_update_question_v2 는 image_url 을 건드리지 않아, 어드민에서 사진을 붙일 방법이 없다.
--
-- v2 를 고치지 않고 v3 을 새로 만든다. v2 는 그대로 남겨 두므로 구버전 어드민 번들이
-- 배포 중간에 살아 있어도 회귀가 없고, 되돌리기는 DROP FUNCTION 한 줄이다.
--
-- 🚨 image_url 은 이 함수로만 덮어쓴다. 어드민이 항상 현재 값을 실어 보내므로, 사진을
-- 지우려면 NULL 을 보내면 된다. 빈 문자열은 NULL 로 접어서 "없음"의 표현이 하나로 유지된다.
--
-- 🚨 어드민은 image_url 을 실어 오는 경로에서만 v3 을 부른다. 신고 화면이 쓰는
-- admin_get_reports 는 image_url 을 반환하지 않아, 거기서 v3 을 부르면 사진이 지워진다.
-- 그 경로는 계속 v2 를 쓴다 (admin-sections.jsx 의 hasImageField 분기).
--
-- Applied to the live project (fulgfanxrcjtsyzfrtjl) via Supabase MCP on 2026-09-21;
-- recorded here for repo↔DB provenance. v2 를 그대로 두었으므로 되돌리려면 이 함수만
-- 제거하고 어드민을 v2 호출로 되돌리면 된다.

CREATE OR REPLACE FUNCTION public.admin_update_question_v3(
  p_id text,
  p_stem text,
  p_stem_givens jsonb,
  p_choices jsonb,
  p_correct_answer text,
  p_explanation text,
  p_image_url text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_image_url text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  v_image_url := NULLIF(btrim(COALESCE(p_image_url, '')), '');

  -- 클라이언트 가드가 뚫려도 거대한 payload 가 questions 행에 박히지 않게 막는다.
  -- 2,000,000자 base64 ≈ 1.5MB 원본. 800px 크롭(30~150KB)보다 한참 위의 상한이다.
  IF v_image_url IS NOT NULL AND length(v_image_url) > 2000000 THEN
    RAISE EXCEPTION '문항 이미지가 너무 큽니다 (%)', pg_size_pretty(length(v_image_url)::bigint)
      USING ERRCODE = '22001';
  END IF;

  IF v_image_url IS NOT NULL AND v_image_url !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+=*$' THEN
    RAISE EXCEPTION '문항 이미지는 PNG 또는 JPEG base64 data URI 여야 합니다.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.questions
  SET stem           = p_stem,
      stem_givens    = p_stem_givens,
      choices        = p_choices,
      correct_answer = p_correct_answer,
      explanation    = p_explanation,
      image_url      = v_image_url,
      version        = version + 1,
      updated_at     = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '문항을 찾을 수 없습니다: %', p_id;
  END IF;

  PERFORM public.admin_log_action(
    'update_question_v3', 'question', p_id, left(p_stem, 60),
    jsonb_build_object('image', v_image_url IS NOT NULL)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_question_v3(text, text, jsonb, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_question_v3(text, text, jsonb, jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_question_v3(text, text, jsonb, jsonb, text, text, text) TO authenticated;
