# Phase F Legacy Import 결과

## 1. 변경된 파일 list

- `admin/src/lib/stem-givens-parse.js` - 277 lines, 신규 파서
- `admin/src/admin-sections.jsx` - 2502 lines, `QuestionBlock` import preview UI 추가
- `admin/src/index.html` - 613 lines, `.btn-ghost` source 스타일 추가
- `admin/index.html` - 614 lines, Vite build output HTML 갱신
- `admin/assets/index-DK01bW6d.js` - 340 lines, Vite build output 신규 JS 번들
- `admin/assets/index-gEnJ-O0k.js` - 335 lines before deletion, Vite build output 구 JS 번들 삭제
- `admin/PHASE_F_RESULT.md` - 46 lines, 결과 기록 파일

## 2. 신규 함수·컴포넌트 요약

- `parseStemGivens(rawStem)`: stem 인라인 보기 데이터를 `stem_givens` bare array 형식으로 반환한다.
- 파서 helper: `[BOXED]`, standalone/inline 보기 헤더, headerless 항목 시작, 다중 보기 헤더를 처리한다.
- `LegacyGivensImportPreview`: 감지된 보기 박스를 read-only로 보여주고 `이대로 가져오기` / `무시` 액션을 제공한다.

## 3. 디자인 토큰 적용 위치

- `LegacyGivensImportPreview`: `.sheet marked`, `--surface-2`, `--border`, `--rule`, `--r-sm` 적용.
- 저장 상태 라벨: `--font-mono`, `--fg-subtle`, `--fs-xs` 적용.
- 항목 key chip: `--accent`, `--accent-soft`, `--accent-border` 적용.
- 버튼: import는 `.btn-primary`, ignore는 신규 `.btn-ghost`.
- spacing: `--sp-1`, `--sp-2`, `--sp-3`, `--sp-4`.

## 4. 검증 결과

- `node --input-type=module` 직접 검증 통과.
- `GJG_1_G_27_21` stem 검증: 박스 1개, 항목 4개, key `ㄱ/ㄴ/ㄷ/ㄹ`.
- 추가 parser 검증: `〈보기〉`, `[BOXED]`, `■ 보기`, headerless, `〈보기 1〉 + 〈보기 2〉`, 보기 없는 stem.
- 보기 없는 stem은 `[]` 반환.
- UI 조건: `hasGivensField && q.stem_givens === null && !legacyImportHidden && legacyGivens.length > 0`.
- `npm run build` 성공. 기존 Vite 설정 경고(outDir가 root 상위)와 chunk size warning만 발생.

## 5. 잔존 이슈 또는 사용자 확인 필요한 결정사항

- 어드민 dev 화면에서 실제 `GJG_1_G_27_21` 진입 후 preview/import/저장 흐름 수동 확인이 필요하다.
- headerless 숫자 key는 1, 2, 3 순서처럼 확신 가능한 prefix만 자동 감지한다.
- 이번 작업은 저장 시 stem 본문을 strip하지 않는다. 구 앱 호환 정책을 유지한다.
- 작업 전부터 보이던 untracked `docs/`는 수정하지 않았다.

## 6. 다음 단계 추천

- `npm run dev`로 어드민을 띄우고 question-inspector에서 27회 21번 import UX를 직접 확인한다.
- 가져오기 후 저장하면 재진입 시 `stem_givens !== null` 조건으로 감지 preview가 사라지는지 확인한다.
