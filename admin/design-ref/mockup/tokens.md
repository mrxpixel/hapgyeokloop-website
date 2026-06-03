# 4단계 — 디자인 토큰 spec (Proof Sheet × Data Console)

> 픽한 방향: **D Proof Sheet (베이스) + C Data Console (데이터 화면 인접합).**
> 모든 토큰은 `mockup/style.css` 의 CSS 변수로 노출됨 → React/Vite 이식 시 그대로 사용.
> 컨셉: 검수=교정 작업. 종이/잉크 톤, 헤어라인 괘선, 좌측 줄번호, **단일 시그널 = 교정 빨강(vermillion)**.

---

## 1. 색상

### ⚠️ 의미체계 — 교정쇄 변형 (의도된 결정)
교정쇄 컨셉에서 **primary accent = 교정 빨강**입니다. 빨간펜 은유상 primary·신고·위험이 같은 빨강 계열로 통합됩니다. 대신:
- **녹(올리브)** = 성공 / 검수완료 / 활성
- **노(오커)** = 경고 / 대기 / 주의
- **빨강(vermillion)** = primary 액션 + 신고 + 위험(삭제). 위험 작업은 `btn-danger`(deep crimson) + 아이콘 + 확인 모달로 구분.
- **파랑(annotation)** = 정보 / 링크 / **카테고리 태그 전용**
- 보조색(teal·plum) = 카테고리 태그 전용

### 라이트 (종이)
```
--bg            #f7f5ef   따뜻한 종이
--surface       #fdfcf8   카드 종이
--surface-2     #f0ede3   가라앉은 면
--surface-3     #e7e3d5
--border        #ddd7c7   헤어라인 (warm)
--border-strong #c7bfa9
--rule          #d3ccba   괘선
--fg            #1a1612   잉크
--fg-muted      #726a59
--fg-subtle     #968c76
--fg-faint      #b9af99
--accent        #d6452b   교정 빨강 (primary)
--accent-hi     #b8371f
--accent-soft   rgba(214,69,43,.10)
--success       #5f7138   올리브
--warning       #a9781f   오커
--danger        #c0392b   crimson (파괴적 작업)
--info / cat-blue #2b5fd6  annotation blue
--cat-teal      #2f7d72
--cat-plum      #8a4f8f
```

### 다크 (잉크/인쇄)
```
--bg            #14130f
--surface       #1b1914
--surface-2     #23201a
--surface-3     #2c2820
--border        #2e2a22
--border-strong #443d30
--rule          #322d24
--fg            #ece6da
--fg-muted      #aaa18d
--fg-subtle     #7c735f
--fg-faint      #564e3f
--accent        #f0664a   warm vermillion (다크용 밝게)
--success       #a6bd6f
--warning       #dca94d
--danger        #ef6b56
--info/cat-blue #6f95e8
--cat-teal      #5cab9c · --cat-plum #c08bc4
```

---

## 2. Typography

```
--font-sans   'Pretendard', system-ui      (본문·UI·한국어)
--font-serif  'Newsreader', 'Noto Serif KR' (제목·라벨 강조·문항 번호)
--font-mono   'Spline Sans Mono'            (데이터·ID·시간·메타·괘선 줄번호)

스케일
--fs-xs    11.5px   mono 마이크로 라벨
--fs-sm    13px     dense 데이터 / 보조
--fs-base  14.5px   기본 UI
--fs-md    15.5px   편집기 본문 / 선택지 (읽기 우선)
--fs-lg    17px     시트 제목
--fs-xl    20px     섹션 제목
--fs-title 25px     serif 페이지 제목
```
원칙: **데이터·숫자는 mono + tabular-nums**, 제목·문항번호·보기 라벨은 **serif**, 본문은 Pretendard. 12px 이하 본문 없음.

---

## 3. Spacing scale
```
--sp-1 4 · --sp-2 8 · --sp-3 12 · --sp-4 16 · --sp-5 20 · --sp-6 24 · --sp-8 32 · --sp-12 48 · --sp-16 64
```
density 토큰: `--row-h 40`(기본), 데이터 테이블/리스트는 32~34px로 압축(C).

## 4. Radius
```
--r-sm 5 · --r 7 · --r-lg 11 · --r-pill 999
```
낮은 radius = 종이/인쇄물 느낌. (C 데이터 화면도 동일 사용.)

## 5. Shadow
```
--shadow-sm  0 1px 2px rgba(60,50,30,.06)      거의 안 씀 (괘선이 위계 담당)
--shadow     0 8px 24px -14px rgba(60,50,30,.22)  모달·팝오버
--shadow-lg  0 24px 60px -22px rgba(40,33,20,.34) 모달·팔레트
```
원칙: 그림자보다 **헤어라인·괘선·줄번호**로 위계를 만든다 (그라데이션·glow 금지).

## 6. Motion
```
--motion-fast 120ms · --motion 180ms · --motion-slow 260ms
--ease cubic-bezier(.2,.6,.2,1)
```
hover/포커스 120ms, 모달·전개 180~260ms. 무한 장식 모션 없음.

---

## 7. 시그니처 트리트먼트 (D 정체성)
- **`.sheet`** — 채워진 카드 대신 헤어라인 컨테이너. `.marked` 시 상단 2px vermillion 괘선.
- **`.ruled` / `.ruled-row .ln`** — 좌측 줄번호 거터 (mono, 괘선 구분).
- **proof marks** — 검수완료 `.proof-check`(vermillion ✓), `.proof-underline`(vermillion 밑줄), 신고행 좌측 vermillion 괘선(`.cur` `inset 2.5px`).
- **serif 제목** + **mono 라벨**(대문자·letter-spacing).

## 8. 키보드 단축키 hint (보존)
표시 자리: 사이드바 검색(`⌘K`), 리스트 상단 `.hint-bar`, 팔레트 푸터, 단축키 모달(`?`).
```
⌘K 팔레트 · ? 도움말 · T 테마 · G+키 페이지 이동(O/R/I/N/M/S…) · J/K 행 이동 · E 해결 · ESC 닫기
```

## 9. 컴포넌트 ↔ 클래스 맵 (React 이식용)
| 컴포넌트 | 클래스 | 파일 |
|---|---|---|
| Button | `.btn` `.btn-primary/secondary/danger/ghost` `.btn-link` `.btn-sm/xs` | style.css |
| Badge / Tag | `.badge-*` / `.tag-cat.blue/teal/plum` | style.css |
| Field | `.input` `.textarea` `.select` `.switch` `.check` `.radio` | style.css |
| Sheet | `.sheet` `.sheet-head/body` `.marked` | style.css |
| 보기 박스 | `.givens` `.gv-card/head/items/item/key` | style.css + question-inspector.html |
| Tiptap toolbar | `.tt-bar` `.tt-btn` `.tt-editor` | style.css |
| Table | `.dtable` (sticky·sortable·.cur) `.dtable-foot` `.pager` | style.css + app.js sortTable |
| Modal | `.modal` `.modal-compact/medium/large/fullscreen` | style.css + app.js openModal |
| Toast | `.toast.success/info/danger` | style.css + app.js toast |
| Palette | `.palette` | app.js openPalette |
| KPI | `.kpi` (+sparkline svg) | style.css + overview.html |
| 진행률 | `.qprog` `.qprog-bar .seg-ok/stale` | style.css |
| 모바일 프리뷰 | `.mobile-frame` `.mobile-screen` `.mp-warn` | style.css |

> 전체 시스템은 단일 `style.css` + `app.js`. 페이지는 이를 소비하는 정적 HTML이라 컴포넌트 경계가 명확 → React 컴포넌트로 1:1 이식 가능.
