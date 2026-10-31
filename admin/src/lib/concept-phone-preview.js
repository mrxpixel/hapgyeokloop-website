// 앱 개념카드(concept_detail_screen.dart · bracket_table.dart · exam_svg.dart · exam_latex.dart)의
// 본문 해석 규칙을 그대로 옮긴 것. 화면 그리기는 components/ConceptPhonePreview.jsx.

const HEADING_PATTERN = /^\*\*(.+)\*\*$/;
const FORMULA_PATTERN = /^\$[^$]+\$$/;
const BLOCK_PATTERN = /\[TABLE( noheader)?\]([\s\S]*?)\[\/TABLE\]/g;
const SVG_PATTERN = /\[SVG\]([\s\S]*?)\[\/SVG\]/g;
const UNIT_LATEX = { '㎡': '\\text{m}^2', '㎥': '\\text{m}^3' };

const dollarCount = line => (line.match(/\$/g) || []).length;

function splitByPattern(text, pattern, toBlock) {
  const parts = [];
  let last = 0;
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(last, match.index).trim();
    if (before) parts.push({ type: 'text', text: before });
    const block = toBlock(match);
    if (block) parts.push(block);
    last = match.index + match[0].length;
  }
  const after = text.slice(last).trim();
  if (after) parts.push({ type: 'text', text: after });
  return parts;
}

// [TABLE] 내용 → 병합(^ 위, < 왼쪽)까지 반영한 칸 목록. 첫 행은 noheader가 아니면 머리글.
export function parseConceptPhoneTable(content, hasHeader) {
  const grid = content.split('\n').map(row => row.trim()).filter(Boolean)
    .map(row => row.split('|').map(cell => cell.trim()));
  if (!grid.length) return null;
  const width = Math.max(...grid.map(row => row.length));
  grid.forEach(row => { while (row.length < width) row.push(''); });

  const headerRows = [];
  grid.forEach((row, index) => {
    headerRows[index] = index === 0 ? hasHeader : headerRows[index - 1] && row.some(cell => cell === '^');
  });

  const owner = grid.map(row => row.map(() => null));
  const rows = grid.map(row => row.map(() => null));
  grid.forEach((row, r) => row.forEach((cell, c) => {
    if (cell === '^' && r > 0 && owner[r - 1][c]) {
      const target = owner[r - 1][c];
      owner[r][c] = target;
      if (target.column === c && target.lastRow === r - 1) { target.rowSpan += 1; target.lastRow = r; }
      return;
    }
    if (cell === '<' && c > 0 && owner[r][c - 1]) {
      const target = owner[r][c - 1];
      owner[r][c] = target;
      if (target.row === r) target.colSpan += 1;
      return;
    }
    const created = { row: r, column: c, lastRow: r, rowSpan: 1, colSpan: 1, lines: cell.split('\\n') };
    owner[r][c] = created;
    rows[r][c] = created;
  }));
  rows.headerRows = headerRows.filter(Boolean).length;
  return { type: 'table', hasHeader, rows };
}

// 정의 → 표 / 그림 / 글 블록(앱: BracketTable → ExamSvgText → _ConceptBody 순서)
export function parseConceptPhoneBlocks(definition) {
  return splitByPattern(String(definition || ''), BLOCK_PATTERN, match => parseConceptPhoneTable(match[2], !match[1]))
    .flatMap(block => block.type !== 'text' ? [block] : splitByPattern(block.text, SVG_PATTERN, match => (
      match[1].trim() ? { type: 'svg', svg: match[1].trim() } : null
    )));
}

// _ConceptBody 의 줄 해석: 소제목, 계산 방법 공식(번호·설명), 수식 섞인 줄, 일반 줄
export function planConceptBodyLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  const plan = [];
  let calculation = false;
  let formulaCount = 0;
  let formulaNumber = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) { plan.push({ type: 'blank' }); continue; }
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      calculation = heading[1] === '계산 방법';
      formulaCount = 0;
      formulaNumber = 0;
      if (calculation) {
        for (let next = index + 1; next < lines.length; next += 1) {
          if (HEADING_PATTERN.test(lines[next])) break;
          if (FORMULA_PATTERN.test(lines[next].trim())) formulaCount += 1;
        }
      }
      plan.push({ type: 'heading', text: heading[1], first: index === 0 });
      continue;
    }
    if (calculation && FORMULA_PATTERN.test(line.trim())) {
      formulaNumber += 1;
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      const hasDescription = next < lines.length && !HEADING_PATTERN.test(lines[next]) && !FORMULA_PATTERN.test(lines[next].trim());
      plan.push({
        type: 'formula',
        content: line.trim(),
        description: hasDescription ? lines[next] : null,
        number: formulaCount > 1 ? formulaNumber : null,
      });
      if (hasDescription) index = next;
      continue;
    }
    // 공식 한 줄·$$ 블록은 한 줄 맞춤, 수식이 섞인 문장은 일반 문장처럼 줄바꿈
    const type = FORMULA_PATTERN.test(line.trim()) || line.includes('$$') ? 'latex' : dollarCount(line) >= 2 ? 'inline' : 'text';
    plan.push({ type, text: line });
  }
  return plan;
}

function isEscaped(source, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function isSingleDollarAt(source, index) {
  if (source[index] !== '$' || isEscaped(source, index)) return false;
  return source[index - 1] !== '$' && source[index + 1] !== '$';
}

function nextSingleDollar(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (isSingleDollarAt(source, index)) return index;
  }
  return -1;
}

function isValidInlineMath(source, start, end) {
  const expression = source.slice(start + 1, end);
  if (!expression || /[\r\n]/.test(expression)) return false;
  if (/\s/.test(expression[0]) || /\s/.test(expression[expression.length - 1])) return false;
  return !/[0-9]/.test(source[end + 1] || '');
}

// 한 줄 안의 $...$ 를 나눈다. ㎡·㎥ 는 앱처럼 수식으로 바꾼다.
export function parseInlineMath(content) {
  const parts = [];
  let cursor = 0;
  let last = 0;
  while (cursor < content.length) {
    const start = nextSingleDollar(content, cursor);
    if (start < 0) break;
    const end = nextSingleDollar(content, start + 1);
    if (end < 0) break;
    if (isValidInlineMath(content, start, end)) {
      if (start > last) parts.push({ text: content.slice(last, start) });
      parts.push({ expression: content.slice(start + 1, end), source: content.slice(start, end + 1) });
      last = end + 1;
      cursor = last;
    } else {
      cursor = start + 1;
    }
  }
  if (last < content.length) parts.push({ text: content.slice(last) });
  return parts.flatMap(part => part.text == null ? [part] : part.text.split(/([㎡㎥])/).filter(Boolean)
    .map(piece => UNIT_LATEX[piece] ? { expression: UNIT_LATEX[piece], source: piece } : { text: piece }));
}

// \text{…} 안의 가운뎃점(·)을 ㆍ로(앱과 같은 처리)
export function normalizeTextMiddleDots(expression) {
  if (!expression.includes('·')) return expression;
  let result = '';
  let depth = 0;
  let textDepth = 0;
  let index = 0;
  while (index < expression.length) {
    const character = expression[index];
    if (character === '\\') {
      let end = index + 1;
      while (end < expression.length && /[a-zA-Z]/.test(expression[end])) end += 1;
      if (end === index + 1 && end < expression.length) end += 1;
      const command = expression.slice(index, end);
      result += command;
      index = end;
      if (command === '\\text') {
        while (end < expression.length && !expression[end].trim()) end += 1;
        if (end < expression.length && expression[end] === '{') {
          result += expression.slice(index, end + 1);
          depth += 1;
          if (textDepth === 0) textDepth = depth;
          index = end + 1;
        }
      }
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      if (depth === textDepth) textDepth = 0;
      depth -= 1;
    }
    result += character === '·' && textDepth > 0 ? 'ㆍ' : character;
    index += 1;
  }
  return result;
}
