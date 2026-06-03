# Phase F — 구 데이터(stem 인라인) 어드민 자동 감지·import

> 작성: 2026-06-03
> 트리거: 사용자가 어드민 v3에서 "기존 보기 박스 문제(예: 27회 21번)가 안 보임" 발견
> Branch: 기존 `feature/admin-v3-tiptap` 에 commit 추가 (별도 PR 아님)

---

## 0. 한 줄 요약

`questions.stem_givens` NULL인 구 데이터(stem 인라인) 어드민에서 **자동 파싱 미리보기** + "✓ 이대로 가져오기" 버튼. 검수자가 한 문제씩 확인 후 stem_givens에 import. 모바일 PR #118의 fallback 파서 로직 JS 포팅.

---

## 1. 배경

- 기존 ~400+ 보기 박스 있는 문제는 `stem` 컬럼 안에 인라인 텍스트로 존재 (`〈보기〉` 헤더 + `ㄱ./ㄴ./ㄷ.` 또는 `[BOXED]...[/BOXED]` 등)
- 모바일 신 앱 (PR #118): `stem_givens` NULL 시 stem 인라인 자동 파싱 → 박스 정상 표시 ✅
- 어드민 v3 (Phase C): `stem_givens` 만 봄 → 박스 0개 → 검수자 혼동 ⚠️

→ 어드민에도 같은 fallback 파싱 추가 + import UI

---

## 2. 데이터 검증 (이미 확인됨)

```sql
SELECT id, stem_givens IS NULL AS givens_null, LEFT(stem, 200)
FROM questions WHERE id = 'GJG_1_G_27_21';
-- givens_null = true
-- stem = "부동산투자의 위험에...\nㄱ. 경기침체로...\nㄴ. ...\nㄷ. ...\nㄹ. ..."
```

---

## 3. 작업 범위

### 3-1. 파서 JS 이식
**참조 원본**: `/Users/logan/Projects/hgl-stem-md/mobile/lib/features/study/widgets/exam_content/exam_stem_view.dart` 의 `parseExamStem()` + `_parseQnetStemSegments()` 함수

**JS 포팅 위치**: `admin/src/lib/stem-givens-parse.js` (또는 비슷한 경로 — Phase A 빌드 구조 따라)

**파싱 처리 패턴**:
- `〈보기〉` 헤더 + `ㄱ./ㄴ./ㄷ./ㄹ.` 항목
- `[BOXED]...[/BOXED]` 블록
- `■ 보기` 또는 `<보기>` 변형 헤더
- 헤더 없이 `ㄱ./ㄴ./ㄷ.` 시작 (자동 감지)
- 항목 키 자유 (`ㄱ`, `㉠`, `1`, `가` 등)

**반환 형식** (어드민 데이터 모델과 일치):
```js
[
  {
    label: '보기',
    markdown_enabled: false,
    items: [
      { key: 'ㄱ', text: '경기침체로...' },
      { key: 'ㄴ', text: '차입자에게...' },
      // ...
    ]
  }
]
```

### 3-2. UI 추가 — QuestionBlock 안

**조건**: `question.stem_givens == null` AND 파싱 결과 박스 ≥ 1개

**렌더링**:
- 기존 "보기 박스 추가" 버튼 영역 위에 **"📦 기존 stem에서 감지된 보기"** 섹션 추가
- 감지된 박스 미리보기 (read-only, 회색 배경 — "저장 안 됨" 시각 강조)
- 각 박스마다:
  - label (예: "보기")
  - 항목 N개 (key + text)
- 섹션 하단에 **"✓ 이대로 가져오기"** 버튼 (primary 색)
- 옆에 "✕ 무시"(secondary) 버튼 — 이 안내 닫기 (한 번만)

**클릭 흐름** ("✓ 이대로 가져오기"):
1. 파싱 결과를 stem_givens 편집 영역에 채움 (편집 가능 상태로)
2. 사용자가 추가 편집 (마크다운 토글·항목 추가·삭제 등)
3. "저장" 클릭 → `admin_update_question_v2` RPC로 stem 유지 + stem_givens 채움
4. 한 번 import하면 stem_givens NOT NULL → 다음 진입 시 "감지된 보기" 섹션 안 보임

### 3-3. 디자인 토큰 (v3 mockup 따라)

- "감지된 보기" 카드 — 헤어라인 괘선 (v3 D Proof Sheet 베이스), surface-2 배경
- "저장 안 됨" 라벨 — `--fg-subtle` mono 폰트
- "✓ 가져오기" 버튼 — primary (교정 빨강)
- "✕ 무시" 버튼 — ghost/secondary

---

## 4. 파일 변경 list (Codex 디스패치용)

```
신규:
- admin/src/lib/stem-givens-parse.js
  → 모바일 parseExamStem() JS 포팅

수정:
- admin/src/components/question-block/*  (Phase C에서 만든 QuestionBlock 위치)
  → stem_givens NULL + 파싱 결과 있을 시 "감지된 보기" 미리보기 + import 버튼

선택:
- admin/src/lib/stem-givens-parse.test.js
  → 기본 패턴 5-10개 테스트 (27회 21번 stem 같은 케이스)
```

---

## 5. 검증

### 자동
- 파서 unit test (가능하면): 27회 21번 stem 입력 → 박스 1개 + 항목 4개 결과
- 빌드 통과 (vite build)

### 수동 (사용자)
- 어드민 dev → question-inspector → 27회 21번 진입
- "감지된 보기" 미리보기에 ㄱ/ㄴ/ㄷ/ㄹ 4개 항목 보임
- "✓ 가져오기" 클릭 → 편집 영역에 채움
- 항목 1개 수정해보기 → 저장 → 다시 진입 시 stem_givens 정상 로드
- 모바일 시뮬레이터에서 27회 21번 → 신 stem_givens 우선 사용 (fallback 아님) → 동일 표시

### 회귀
- stem_givens가 이미 채워진 신 데이터 (시뮬레이터 검증 시나리오 2/3/4) → "감지된 보기" 섹션 안 뜸 (조건문)
- stem에 보기 없는 문제 → "감지된 보기" 섹션 안 뜸

---

## 6. 머지 흐름

- Phase F 작업 끝나면 `feature/admin-v3-tiptap` 에 추가 commit
- 통합 테스트 (어드민 + 모바일 시뮬레이터) → OK
- push + PR 생성 (사용자 명시 후)
- 머지 후 worktree·브랜치 정리

---

## 7. Codex 디스패치 규칙

🚨 코드 변경은 모두 Codex 디스패치 (메모리 [Codex 디스패치]·[역할 분담]).
모바일 parseExamStem 원본 코드 참조 시 `/Users/logan/Projects/hgl-stem-md/mobile/lib/features/study/widgets/exam_content/exam_stem_view.dart` 절대경로로 read-only 참조.

---

## 8. 시작 명령 (어드민 worktree 세션에서)

이 세션 (또는 hgl-admin-tiptap에서 활성 Claude 세션이 있으면 거기에) 첫 메시지:
```
docs/PHASE_F_LEGACY_IMPORT.md 정독.
모바일 worktree의 parseExamStem() 로직 참조해서 JS 포팅 + QuestionBlock에 "감지된 보기 미리보기 + 가져오기" UI 추가.
Codex 디스패치로 진행. 27회 21번에서 검증.
```
