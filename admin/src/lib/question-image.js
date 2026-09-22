/**
 * 문항 그림을 기출 원본 사진으로 싣기 위한 순수 로직.
 *
 * 전달 방식은 `questions.image_url` 에 base64 data URI 를 넣는 1안이다(2026-09-13 확정).
 * Supabase Storage 버킷이 프로젝트에 하나도 없어 URL 방식은 업로드·RLS·CDN 인프라가
 * 전부 신규인 반면, 이 방식은 기존 컬럼과 동기화 배관을 그대로 쓴다.
 */

/** 앱 PDF 경로가 디코드할 수 있는 형식만 허용한다. */
export const QUESTION_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'];

/** 크롭 결과 권장 가로폭. 기출 도형은 이 폭이면 선이 또렷하다. */
export const QUESTION_IMAGE_MAX_WIDTH = 800;

/**
 * 디코드 후 바이트 상한.
 *
 * 서버(admin_update_question_v3)는 data URI 길이 2,000,000자를 막는다. base64 는 바이트당
 * 약 4/3 자이므로 1,400,000 바이트면 data URI 가 약 1,890,000자 — 서버 상한 아래에 머문다.
 * 즉 클라이언트에서 통과한 이미지는 서버에서 거절당하지 않는다.
 */
export const MAX_QUESTION_IMAGE_BYTES = 1400000;

const DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/;

/** base64 문자열이 디코드됐을 때의 바이트 수. */
export function questionImageByteLength(base64) {
  const source = String(base64 ?? '');
  if (source === '') return 0;
  const padding = source.endsWith('==') ? 2 : source.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(source.length * 3 / 4) - padding);
}

/**
 * image_url 값을 검사한다.
 *
 * reason 은 UI 문구가 아니라 코드다. 문구는 호출하는 화면이 고른다 — lib 은 판단 재료만 준다.
 * reason: 'empty' | 'format' | 'too-large'
 */
export function parseQuestionImage(value) {
  const source = String(value ?? '').trim();
  if (source === '') return { ok: false, reason: 'empty' };

  const match = DATA_URL_PATTERN.exec(source);
  if (!match) return { ok: false, reason: 'format' };

  const byteLength = questionImageByteLength(match[2]);
  if (byteLength > MAX_QUESTION_IMAGE_BYTES) {
    return { ok: false, reason: 'too-large', byteLength };
  }
  return { ok: true, reason: null, mime: `image/${match[1]}`, byteLength, dataUrl: source };
}

/** 저장 직전 정규화. 빈 값은 전부 null 로 접어 "없음"의 표현을 하나로 유지한다. */
export function questionImageForSave(value) {
  const source = String(value ?? '').trim();
  return source === '' ? null : source;
}

/** 82.4KB 처럼 사람이 읽는 크기. */
export function formatByteSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '-';
  if (value < 1024) return `${Math.round(value)}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(2)}MB`;
}

/** 파일 선택 input 의 accept 값. */
export function questionImageAcceptAttribute() {
  return QUESTION_IMAGE_MIME_TYPES.join(',');
}

/**
 * 원본 크기를 권장 가로폭 안으로 줄였을 때의 크기.
 *
 * 세로는 비율을 유지하며 최소 1px 을 보장한다. 이미 좁은 이미지는 확대하지 않는다.
 */
export function fitQuestionImageSize(width, height, maxWidth = QUESTION_IMAGE_MAX_WIDTH) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 0));
  const sourceHeight = Math.max(1, Math.round(Number(height) || 0));
  if (sourceWidth <= maxWidth) return { width: sourceWidth, height: sourceHeight };

  const scale = maxWidth / sourceWidth;
  return { width: maxWidth, height: Math.max(1, Math.round(sourceHeight * scale)) };
}
