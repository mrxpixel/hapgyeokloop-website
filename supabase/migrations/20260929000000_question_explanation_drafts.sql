-- Add an admin-only staging and history path for question explanation changes.
--
-- Drafts are reachable only through the SECURITY DEFINER RPCs below. Applying a
-- draft uses optimistic concurrency: the live explanation must still match the
-- explanation captured when the draft was created (or last rebased).

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

CREATE TABLE public.question_explanation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id TEXT NOT NULL REFERENCES public.questions(id),
  base_explanation TEXT NOT NULL,
  draft_explanation TEXT NOT NULL,
  direction_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'applied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  applied_at TIMESTAMPTZ,
  applied_by UUID
);

CREATE UNIQUE INDEX question_explanation_drafts_one_open_per_question
  ON public.question_explanation_drafts (question_id)
  WHERE status = 'draft';

ALTER TABLE public.question_explanation_drafts ENABLE ROW LEVEL SECURITY;

-- No table policy is created: browser clients must use the guarded RPCs.
REVOKE ALL ON TABLE public.question_explanation_drafts FROM PUBLIC;
REVOKE ALL ON TABLE public.question_explanation_drafts FROM anon;
REVOKE ALL ON TABLE public.question_explanation_drafts FROM authenticated;

COMMENT ON TABLE public.question_explanation_drafts
IS '문항 해설 변경안의 원본, 초안, 방향성과 반영 이력을 보관한다. 어드민 RPC로만 접근한다.';

-- Return the single open draft for a question, or zero rows when none exists.
CREATE FUNCTION public.admin_get_explanation_draft(p_question_id TEXT)
RETURNS SETOF public.question_explanation_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.*
  FROM public.question_explanation_drafts AS d
  WHERE d.question_id = p_question_id
    AND d.status = 'draft';
END;
$function$;

COMMENT ON FUNCTION public.admin_get_explanation_draft(TEXT)
IS '문항의 열린 해설 변경안 한 건을 반환한다.';

REVOKE ALL ON FUNCTION public.admin_get_explanation_draft(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_explanation_draft(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_explanation_draft(TEXT) TO authenticated;

-- Create the open draft from the current live explanation, or update its
-- editable fields while preserving its original base explanation.
CREATE FUNCTION public.admin_save_explanation_draft(
  p_question_id TEXT,
  p_draft TEXT,
  p_direction_note TEXT
)
RETURNS SETOF public.question_explanation_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_base_explanation TEXT;
  v_draft public.question_explanation_drafts%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  IF p_draft IS NULL THEN
    RAISE EXCEPTION '해설 초안을 입력해 주세요.' USING ERRCODE = '22004';
  END IF;

  -- Lock the question first in every mutating RPC to keep lock order stable.
  -- The draft contract is NOT NULL, so a legacy NULL explanation is represented
  -- the same way as the admin editor represents it: an empty string.
  SELECT COALESCE(q.explanation, '')
  INTO v_base_explanation
  FROM public.questions AS q
  WHERE q.id = p_question_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '문항을 찾을 수 없습니다: %', p_question_id;
  END IF;

  INSERT INTO public.question_explanation_drafts (
    question_id,
    base_explanation,
    draft_explanation,
    direction_note,
    created_by,
    updated_by
  )
  VALUES (
    p_question_id,
    v_base_explanation,
    p_draft,
    COALESCE(p_direction_note, ''),
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (question_id) WHERE status = 'draft'
  DO UPDATE SET
    draft_explanation = EXCLUDED.draft_explanation,
    direction_note = EXCLUDED.direction_note,
    updated_at = NOW(),
    updated_by = auth.uid()
  RETURNING * INTO v_draft;

  RETURN NEXT v_draft;
END;
$function$;

COMMENT ON FUNCTION public.admin_save_explanation_draft(TEXT, TEXT, TEXT)
IS '열린 해설 변경안을 생성하거나 초안과 방향성을 저장한다.';

REVOKE ALL ON FUNCTION public.admin_save_explanation_draft(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_explanation_draft(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_save_explanation_draft(TEXT, TEXT, TEXT) TO authenticated;

CREATE FUNCTION public.admin_delete_explanation_draft(p_question_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.question_explanation_drafts AS d
  WHERE d.question_id = p_question_id
    AND d.status = 'draft';
END;
$function$;

COMMENT ON FUNCTION public.admin_delete_explanation_draft(TEXT)
IS '문항의 열린 해설 변경안을 삭제한다.';

REVOKE ALL ON FUNCTION public.admin_delete_explanation_draft(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_explanation_draft(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_explanation_draft(TEXT) TO authenticated;

CREATE FUNCTION public.admin_apply_explanation_draft(p_question_id TEXT)
RETURNS SETOF public.question_explanation_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_explanation TEXT;
  v_draft public.question_explanation_drafts%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  -- Lock the live row before the draft row. Save/rebase use the same order.
  SELECT COALESCE(q.explanation, '')
  INTO v_current_explanation
  FROM public.questions AS q
  WHERE q.id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '문항을 찾을 수 없습니다: %', p_question_id;
  END IF;

  SELECT d.*
  INTO v_draft
  FROM public.question_explanation_drafts AS d
  WHERE d.question_id = p_question_id
    AND d.status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '열린 해설 변경안을 찾을 수 없습니다: %', p_question_id;
  END IF;

  IF v_current_explanation IS DISTINCT FROM v_draft.base_explanation THEN
    RAISE EXCEPTION '해설이 변경안 생성 이후 바뀌었습니다';
  END IF;

  -- Matching admin_update_question_v3, changing the explanation increments the
  -- version and updated_at. A previously checked question therefore becomes
  -- stale without discarding who/when performed the earlier inspection.
  UPDATE public.questions AS q
  SET
    explanation = v_draft.draft_explanation,
    version = q.version + 1,
    updated_at = NOW()
  WHERE q.id = p_question_id;

  UPDATE public.question_explanation_drafts AS d
  SET
    status = 'applied',
    updated_at = NOW(),
    updated_by = auth.uid(),
    applied_at = NOW(),
    applied_by = auth.uid()
  WHERE d.id = v_draft.id
  RETURNING d.* INTO v_draft;

  PERFORM public.admin_log_action(
    'apply_explanation_draft',
    'question',
    p_question_id,
    p_question_id,
    jsonb_build_object('draft_id', v_draft.id)
  );

  RETURN NEXT v_draft;
END;
$function$;

COMMENT ON FUNCTION public.admin_apply_explanation_draft(TEXT)
IS '원본 해설이 그대로일 때 변경안을 실제 해설에 반영하고 이력을 보존한다.';

REVOKE ALL ON FUNCTION public.admin_apply_explanation_draft(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_apply_explanation_draft(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_explanation_draft(TEXT) TO authenticated;

CREATE FUNCTION public.admin_rebase_explanation_draft(p_question_id TEXT)
RETURNS SETOF public.question_explanation_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_explanation TEXT;
  v_draft public.question_explanation_drafts%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(q.explanation, '')
  INTO v_current_explanation
  FROM public.questions AS q
  WHERE q.id = p_question_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '문항을 찾을 수 없습니다: %', p_question_id;
  END IF;

  UPDATE public.question_explanation_drafts AS d
  SET
    base_explanation = v_current_explanation,
    updated_at = NOW(),
    updated_by = auth.uid()
  WHERE d.question_id = p_question_id
    AND d.status = 'draft'
  RETURNING d.* INTO v_draft;

  IF NOT FOUND THEN
    RAISE EXCEPTION '열린 해설 변경안을 찾을 수 없습니다: %', p_question_id;
  END IF;

  RETURN NEXT v_draft;
END;
$function$;

COMMENT ON FUNCTION public.admin_rebase_explanation_draft(TEXT)
IS '열린 변경안의 초안은 유지하고 비교 원본만 현재 해설로 갱신한다.';

REVOKE ALL ON FUNCTION public.admin_rebase_explanation_draft(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_rebase_explanation_draft(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_rebase_explanation_draft(TEXT) TO authenticated;

CREATE FUNCTION public.admin_list_explanation_drafts(
  p_subject_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  question_id TEXT,
  subject_id TEXT,
  year_session INT,
  question_number INT,
  status TEXT,
  base_explanation TEXT,
  draft_explanation TEXT,
  direction_note TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'applied') THEN
    RAISE EXCEPTION '올바르지 않은 변경안 상태입니다: %', p_status
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.question_id,
    q.subject_id,
    q.year_session,
    q.question_number,
    d.status,
    d.base_explanation,
    d.draft_explanation,
    d.direction_note,
    d.created_at,
    d.updated_at,
    d.applied_at
  FROM public.question_explanation_drafts AS d
  JOIN public.questions AS q
    ON q.id = d.question_id
  WHERE (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_status IS NULL OR d.status = p_status)
  ORDER BY
    q.subject_id ASC,
    q.year_session DESC,
    q.question_number ASC,
    d.created_at ASC;
END;
$function$;

COMMENT ON FUNCTION public.admin_list_explanation_drafts(TEXT, TEXT)
IS '해설 변경안 이력을 과목과 상태로 필터링해 문항 순서로 반환한다.';

REVOKE ALL ON FUNCTION public.admin_list_explanation_drafts(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_explanation_drafts(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_explanation_drafts(TEXT, TEXT) TO authenticated;

COMMIT;
