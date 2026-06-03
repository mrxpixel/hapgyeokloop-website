# HANDOFF — 어드민 사이트 v3: 빌드 시스템 변경 + Tiptap 도입 + QuestionBlock 재설계

> 작성: 2026-06-03
> Worktree: `/Users/logan/Projects/hgl-admin-tiptap`
> Branch: `feature/admin-v3-tiptap` (from `main`)
> 메인 repo: `/Users/logan/projects/hapgyeokloop-website`
> **이 spec은 새 Claude 세션에서 cwd를 이 worktree로 두고 진행할 것을 가정함.**

---

## 0. 한 줄 요약

현재 CDN babel 구조의 어드민 사이트를 vite/npm 빌드 시스템으로 전환 + Tiptap 위지윅 도입 + QuestionBlock에 다중 보기 박스 + 마크다운 toggle + 헤더/표 다이얼로그 UI 추가. 디자인 v3 mockup은 사용자가 별도로 진행 (Claude Design) 후 이 worktree에 전달.

---

## 1. 전제 조건 (이미 완료)

- ✅ Supabase `questions.stem_givens jsonb DEFAULT NULL` 컬럼 적용됨 (2026-06-03)
- ✅ `admin_update_question_v2(p_id, p_stem, p_stem_givens, p_choices, p_correct_answer, p_explanation)` RPC 생성됨
- ✅ 호환성: 기존 어드민 RPC `admin_update_question` 그대로 유지 → 현재 어드민 사이트 계속 작동
- 📄 데이터 모델 spec: `/Users/logan/Projects/hapgyeokloop/docs/admin-v3/01-stem-givens-data-model.md`

---

## 2. 작업 Phase

### Phase A — 빌드 시스템 변경 (디자인 mockup 무관, 지금 시작 가능)

**현황:**
- `/admin/index.html` 1개 HTML 파일에 `<script type="text/babel" src="...">`로 모든 JSX 로딩
- React/ReactDOM/Supabase JS는 vendor 폴더의 UMD 번들
- npm/package.json 없음 → 패키지 추가 불가

**목표:**
- Vite + React 빌드 시스템 도입
- 기존 JSX (admin-app.jsx, admin-lib.jsx, admin-sections.jsx) → ES module
- 빌드 후 결과물을 `/admin/dist/` 같은 폴더에 배포
- 기존 정적 서빙 구조(별도 백엔드 없음) 유지

**작업:**
1. `package.json` 생성 (name, scripts, deps)
2. `vite.config.js` 작성 (entry: admin-app.jsx, base path 설정)
3. JSX 파일들을 ES module 형식으로 import 정리 (필요 시 minimal 수정)
4. Tiptap·marked·DOMPurify 등 추후 라이브러리 설치 가능 상태로
5. dev 모드 (`npm run dev`) + 빌드 (`npm run build`) 둘 다 동작 확인
6. 기존 hosting (어디서 서빙? Vercel? Netlify? Supabase Storage?) 호환 확인

**의존성 후보 (Phase A에서 설치):**
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

**완료 기준:**
- `npm run build` 통과
- 빌드 결과물을 기존 호스팅에 배포 시 어드민 정상 동작 (모든 페이지)
- 기존 RPC 호출·인증 흐름 변경 없음

---

### Phase B — Tiptap 도입 (디자인 mockup 도착 전에 가능)

**의존성 추가:**
```json
{
  "dependencies": {
    "@tiptap/react": "^2.6.0",
    "@tiptap/starter-kit": "^2.6.0",
    "@tiptap/extension-table": "^2.6.0",
    "@tiptap/extension-table-row": "^2.6.0",
    "@tiptap/extension-table-cell": "^2.6.0",
    "@tiptap/extension-table-header": "^2.6.0",
    "@tiptap/extension-link": "^2.6.0",
    "@tiptap/extension-image": "^2.6.0",
    "@tiptap/extension-placeholder": "^2.6.0",
    "marked": "^14.0.0",
    "turndown": "^7.2.0"
  }
}
```

**구현:**
- `/admin/components/MarkdownEditor.jsx` 신규
  - props: `value` (마크다운 string), `onChange(markdown)`, `placeholder`, `enabled` (toggle), `compact`
  - 내부: Tiptap editor + 헤더(H1/H2/H3) 버튼 + 표 다이얼로그 버튼 + 리스트·강조·코드 버튼
  - 표 다이얼로그: "행 N, 열 M" 입력 → `editor.commands.insertTable({rows:N, cols:M, withHeaderRow:true})`
  - 양방향 변환: Tiptap HTML ↔ marked/turndown으로 마크다운 string
  - 저장 형식: **마크다운 string** (DB와 직결)

**활용 페이지 (3곳):**
- `QuestionBlock` 안의 stem/explanation/보기 박스 (Phase C에서 활용)
- `announcements` 페이지의 body (Phase D)
- `reports` 페이지의 admin_response (Phase D)

**완료 기준:**
- `MarkdownEditor` 단독 데모 페이지에서 동작
- 표 다이얼로그로 5x3 표 만들고 저장 → 마크다운 출력 확인
- 마크다운 입력 → 위지윅 모드로 정상 표시

---

### Phase C — QuestionBlock v3 재설계 (디자인 mockup 도착 후)

**전제:** 사용자가 Claude Design으로 v3 mockup 받아서 이 worktree의 `/docs/design-v3/` 또는 `/admin/design-ref/` 같은 폴더에 배치.

**핵심 변경:**

1. **stem_givens 편집 UI 추가**
   - "보기 박스 추가" 버튼 (다중 박스 지원)
   - 각 박스:
     - 라벨 입력 (default "보기")
     - 마크다운 토글 (체크박스 또는 switch)
     - 항목 추가/삭제 (key + text)
     - 마크다운 ON 시 text 입력은 `MarkdownEditor` 사용
   - 보기 박스 삭제 버튼
   - 박스 순서 변경 (드래그 또는 위/아래 버튼)

2. **저장 시 RPC 변경**
   - 기존: `admin_update_question(p_id, p_stem, p_choices, p_correct_answer, p_explanation)`
   - 신규: `admin_update_question_v2(p_id, p_stem, p_stem_givens, p_choices, p_correct_answer, p_explanation)`
   - **stem 컬럼은 그대로 유지** (보기 본문 제거하지 않음 — 구 앱 호환)
   - stem_givens는 박스 배열 JSON으로 전송

3. **편집 모드 진입 시 데이터 로드**
   - stem_givens가 NULL이면 빈 상태로 시작 (또는 stem 인라인 파싱 후보 제시)
   - stem_givens가 있으면 각 박스 편집 UI에 채움

4. **UX 디테일:**
   - 표 입력 시 6칸+ 경고 ("폰에서 잘릴 수 있습니다 — 4칸 이하 권장")
   - 마크다운 toggle ON 시 자동으로 표·헤더 toolbar 활성화
   - 미리보기 탭에서 모바일 화면 폭(360px) 시뮬레이션

---

### Phase D — announcements + reports Tiptap 적용

- `announcements` body 필드 → `MarkdownEditor` 교체
- `reports` admin_response 필드 → `MarkdownEditor` 교체
- 저장 형식 그대로 마크다운 string (DB column 타입 변경 없음)
- 모바일 앱이 announcements를 표시할 때 마크다운 렌더링 필요 (별도 worktree 작업)

---

### Phase E — v3 디자인 적용 (mockup 도착 후)

사용자가 Claude Design에서 받은 mockup HTML/이미지 → 디자인 토큰·레이아웃·컴포넌트 추출 → 어드민 사이트 적용.

**적용 우선순위 (조사 결과 기반):**
1. **question-inspector** (가장 복잡, 신 기능 직결)
2. **announcements, reports** (위지윅 도입 효과 큼)
3. **subjects, admins, exams**
4. **나머지** (exam-dates, app-version, audit-log, settings, overview, analytics)

각 페이지 디자인은 mockup 보고 결정. 일관성 유지를 위해 디자인 토큰 (색·spacing·radius·텍스트 크기) 통일.

---

## 3. 사용자가 별도 진행하는 부분 (이 worktree에서 안 함)

- **v3 디자인 mockup 생성**: 사용자가 Claude Design에 의뢰 (전체 12+ 페이지)
- 결과물 도착하면 사용자가 이 worktree의 적당한 폴더(`/admin/design-ref/`)에 배치
- 이후 Phase E에서 mockup 기반으로 구현

---

## 4. Codex 디스패치 규칙

🚨 **이 worktree에서 Claude는 직접 .html/.css/.js/.jsx 파일을 Write/Edit 하지 않는다.**
- 조사·spec·설계·리뷰는 Claude OK
- 코드 변경은 Codex 디스패치 (stdin 파이프)
- 메모리 참조: `[Codex 디스패치]`, `[역할 분담]`

---

## 5. 작업 순서 (권장)

| 순서 | Phase | 의존성 | 비고 |
|---|---|---|---|
| 1 | A. 빌드 시스템 변경 | 없음 | 디자인 mockup 무관 |
| 2 | B. Tiptap 도입 + MarkdownEditor 컴포넌트 | A | 디자인 mockup 무관 |
| 3 | C. QuestionBlock v3 재설계 (stem_givens 편집) | A, B, **디자인 mockup** | mockup 도착 대기 |
| 4 | D. announcements + reports Tiptap | A, B | C와 병렬 가능 |
| 5 | E. v3 디자인 전체 적용 | A, B, C, D, **디자인 mockup** | mockup 전체 도착 후 |

**즉시 시작 가능 (1-2-D)**:
- Phase A → B → D 순으로 진행하면 디자인 mockup 도착 전에도 큰 진척 가능
- C와 E는 mockup 대기

---

## 6. 검증 시나리오

### Phase A 후
- 모든 어드민 페이지 기존처럼 동작 (login, overview, reports, question-inspector, …)
- 빌드 결과물이 기존 호스팅에 배포 가능

### Phase B 후
- `MarkdownEditor` 데모 페이지에서 헤더·표·리스트·강조 다 입력·출력 동작
- 마크다운 string 양방향 변환 정확

### Phase C 후
- QuestionBlock에서 보기 박스 추가/삭제·마크다운 토글·항목 추가/삭제 동작
- 저장 후 Supabase `stem_givens` 컬럼에 정상 JSON 들어감
- 모바일 신 앱에서 신 데이터 정상 렌더링 (모바일 worktree와 통합 테스트)

### Phase D 후
- 공지 작성 시 헤더·표 활용 가능
- 신고 응답 시 마크다운 활용 가능

### Phase E 후
- v3 디자인 일관성 (모든 페이지 통일된 토큰)
- 다크/라이트 둘 다 정상

---

## 7. 주의사항

- 빌드 시스템 변경은 큰 PR — 별도 PR로 먼저 머지 권장
- Tiptap 도입은 npm 의존성 추가 — security audit 통과 확인 (`npm audit`)
- 기존 어드민 사이트 사용 중인 사용자 영향 최소화 (Phase A 배포 시 동일 동작 보장)
- v3 디자인 적용 시 기존 키보드 단축키(⌘K, G+X 등) 보존
- 모바일 반응형 유지 (현재 수준)
- `admin_log_action` 호출 신 RPC에도 포함됨 (이미 spec에 명시)

---

## 8. 마치며

이 worktree는 **두 트랙**으로 병렬 진행 가능:
- **트랙 1 (mockup 무관)**: Phase A → B → D
- **트랙 2 (mockup 대기)**: Phase C → E

종료 시 보고 사항:
- 빌드 시스템 변경 PR
- Tiptap MarkdownEditor 데모 영상/스크린샷
- QuestionBlock v3 스크린샷 + 신 데이터 RPC 호출 검증
- 기존 어드민 사용자 regression 0 확인
