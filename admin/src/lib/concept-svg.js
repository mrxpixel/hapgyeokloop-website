// 개념노트 정의(definition) 안의 [SVG]...[/SVG] 그림 블록 처리.
// 앱 렌더러(mobile/lib/shared/widgets/exam_svg.dart)와 같은 규칙으로 미리보기를 만든다.

const SVG_BLOCK_PATTERN = /\[SVG\]([\s\S]*?)\[\/SVG\]/g;

// 앱과 같은 다크모드 치환표: 의미 색 3개 + 기본서 원본색 10개
export const APP_SVG_DARK_COLORS = Object.freeze({
  '#2563EB': '#6EA8FE',
  '#D9480F': '#FF922B',
  '#2F9E44': '#69DB7C',
  '#1C5198': '#6FA3E8',
  '#A8243F': '#F07A93',
  '#4A9FD1': '#8CCBF2',
  '#EA411A': '#FF8A65',
  '#EEA82D': '#FFC266',
  '#2E8B57': '#6FD39B',
  '#E9C33A': '#F2D266',
  '#3AAFB9': '#5CCAD3',
  '#E0607E': '#F08AA2',
  '#A88B5A': '#C9A876',
});

// 앱 개념카드 본문 글자색·종이색(notebook_palette.dart)
export const APP_SVG_THEMES = Object.freeze({
  light: Object.freeze({ ink: '#2B2721', background: '#FAF6EC' }),
  dark: Object.freeze({ ink: '#E8DFC8', background: '#2A2521' }),
});

const PALETTE_PATTERN = new RegExp(Object.keys(APP_SVG_DARK_COLORS).join('|'), 'gi');
const PAINT_ATTRIBUTE_PATTERN = /\b(fill|stroke|stop-color|color)(\s*=\s*)(["'])([^"']*)\3/gi;
const PAINT_STYLE_PATTERN = /\b(fill|stroke|stop-color|color)(\s*:\s*)([^;"'}<]+)/gi;
const SVG_PREAMBLE_PATTERN = /^(?:\s*(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>))*\s*/i;
const SVG_TRAILER_PATTERN = /(?:\s*<!--[\s\S]*?-->)*\s*$/;

export function svgBlockMatches(value) {
  const text = String(value || '');
  const matches = [];
  SVG_BLOCK_PATTERN.lastIndex = 0;
  let match;
  while ((match = SVG_BLOCK_PATTERN.exec(text)) !== null) {
    matches.push({
      full: match[0],
      content: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return matches;
}

export function serializeSvgBlock(svg) {
  return `[SVG]${String(svg || '').trim()}[/SVG]`;
}

export function hasPaletteColors(svg) {
  PALETTE_PATTERN.lastIndex = 0;
  return PALETTE_PATTERN.test(String(svg || ''));
}

// <img>로 그리려면 xmlns가 있어야 한다. 앱(flutter_svg)은 없어도 그린다.
function withSvgNamespace(markup) {
  return /^<svg\b[^>]*\sxmlns\s*=/i.test(markup)
    ? markup
    : markup.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

// 칠 지정이 없는 도형·글자의 기본 검정을 글자색으로(앱은 단색 그림 전체를 글자색으로 칠한다)
function withRootFill(markup, ink) {
  return /^<svg\b[^>]*\sfill\s*=/i.test(markup) ? markup : markup.replace(/^<svg\b/i, `<svg fill="${ink}"`);
}

function stripSvgPreamble(svg) {
  return String(svg || '').replace(SVG_PREAMBLE_PATTERN, '').replace(SVG_TRAILER_PATTERN, '');
}

function isPaintValue(value) {
  const trimmed = value.trim().toLowerCase();
  return trimmed !== '' && trimmed !== 'none' && trimmed !== 'transparent' && !trimmed.startsWith('url(');
}

// 앱이 그리는 모습으로 바꾼 SVG 문자열.
// - 원본색/의미색이 있으면: currentColor만 글자색, 다크면 팔레트를 밝은 색으로 치환
// - 단색이면: 앱처럼 칠해진 모든 부분을 글자색 한 가지로
export function svgPreviewMarkup(svg, { theme = 'light' } = {}) {
  const { ink } = APP_SVG_THEMES[theme] || APP_SVG_THEMES.light;
  let markup = withSvgNamespace(stripSvgPreamble(svg));
  if (hasPaletteColors(markup)) {
    if (theme === 'dark') {
      markup = markup.replace(PALETTE_PATTERN, color => APP_SVG_DARK_COLORS[color.toUpperCase()]);
    }
    return markup.replace(/currentColor/g, ink);
  }
  return withRootFill(markup, ink)
    .replace(/currentColor/g, ink)
    .replace(PAINT_ATTRIBUTE_PATTERN, (all, name, eq, quote, value) => (
      isPaintValue(value) ? `${name}${eq}${quote}${ink}${quote}` : all
    ))
    .replace(PAINT_STYLE_PATTERN, (all, name, sep, value) => (
      isPaintValue(value) ? `${name}${sep}${ink}` : all
    ));
}

// <img src>로 쓰는 data URI. img 안의 SVG는 스크립트가 실행되지 않는다.
export function svgPreviewDataUri(svg, options) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgPreviewMarkup(svg, options))}`;
}

// 저장 전 점검. error는 적용을 막고, warning은 알려주기만 한다.
export function svgIssues(svg) {
  const text = stripSvgPreamble(svg);
  const issues = [];
  if (!text) {
    issues.push({ level: 'error', message: 'SVG 내용이 비어 있습니다.' });
    return issues;
  }
  if (!/^<svg[\s>]/i.test(text) || !/<\/svg>$/i.test(text)) {
    issues.push({ level: 'error', message: '<svg>로 시작해서 </svg>로 끝나야 합니다.' });
  }
  if (/\[\/?(?:SVG|TABLE)(?: noheader)?\]/.test(text)) {
    issues.push({ level: 'error', message: 'SVG 안에 [SVG]·[TABLE] 표시를 넣을 수 없습니다.' });
  }
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:/i.test(text)) {
    issues.push({ level: 'error', message: '스크립트·이벤트 속성·foreignObject는 넣을 수 없습니다.' });
  }
  if (!/\bviewBox\s*=/.test(text)) {
    issues.push({ level: 'warning', message: 'viewBox가 없으면 앱에서 그림 비율이 맞지 않을 수 있습니다.' });
  }
  return issues;
}

function joinBlocks(before, block, after) {
  const prefix = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  return { value: before + prefix + block + suffix + after, cursor: before.length + prefix.length + block.length };
}

export function insertSvgBlock(source, insertAt, svg) {
  const text = String(source || '');
  const at = Math.max(0, Math.min(insertAt ?? text.length, text.length));
  return joinBlocks(text.slice(0, at), serializeSvgBlock(svg), text.slice(at));
}

export function replaceSvgBlock(source, start, end, svg) {
  const text = String(source || '');
  const block = serializeSvgBlock(svg);
  return { value: text.slice(0, start) + block + text.slice(end), cursor: start + block.length };
}

// 그림 앞뒤 구분(빈 줄·줄바꿈·공백)을 원래대로 하나만 남긴다.
export function removeSvgBlock(source, start, end) {
  const text = String(source || '');
  const rawBefore = text.slice(0, start);
  const rawAfter = text.slice(end);
  const before = rawBefore.replace(/\s*$/, '');
  const after = rawAfter.replace(/^\s*/, '');
  const gap = rawBefore.slice(before.length) + rawAfter.slice(0, rawAfter.length - after.length);
  const separator = /\n[ \t]*\n/.test(gap) || (/\n/.test(rawBefore.slice(before.length)) && /\n/.test(rawAfter.slice(0, rawAfter.length - after.length)))
    ? '\n\n'
    : /\n/.test(gap) ? '\n' : ' ';
  const value = before && after ? `${before}${separator}${after}` : before + after;
  return { value, cursor: before.length };
}

// 그림 내용 안에 [SVG]·[TABLE] 표시가 들어 있으면 닫는 표시가 빠져 여러 블록을 삼킨 것
export function isMalformedSvgBlock(block) {
  return /\[\/?(?:SVG|TABLE)(?: noheader)?\]/.test(String(block?.content || ''));
}

// 열어 둔 사이 정의가 바뀌었으면 같은 블록을 다시 찾는다. 없으면 null.
export function locateSvgBlock(source, { start, end, originalBlock }) {
  const text = String(source || '');
  if (text.slice(start, end) === originalBlock) return { start, end };
  const found = svgBlockMatches(text).find(match => match.full === originalBlock);
  return found ? { start: found.start, end: found.end } : null;
}
