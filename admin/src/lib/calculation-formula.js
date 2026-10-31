// 앱 mobile/lib/features/notes/utils/calculation_formula.dart 를 그대로 옮긴 것.
// 최상위 =, +, - 앞에서만 나눈다. 괄호·분수·\text 안과 \times·\div 는 나누지 않는다.

const FRACTION_COMMANDS = new Set(['\\frac', '\\dfrac', '\\tfrac', '\\binom', '\\dbinom', '\\tbinom']);
const TEXT_COMMANDS = new Set(['\\text', '\\textrm', '\\textnormal', '\\operatorname']);
const BINARY_COMMANDS = new Set(['\\times', '\\div', '\\cdot', '\\le', '\\ge', '\\leq', '\\geq', '\\neq', '\\approx', '\\pm', '\\to']);
const OPERAND_PRECEDING_CHARACTERS = new Set(['*', '/', '<', '>', ',', ':']);
const SPACING_COMMANDS = new Set(['\\,', '\\;', '\\:', '\\!', '\\ ', '\\quad', '\\qquad', '\\enspace']);
const STYLE_COMMANDS = new Set(['\\displaystyle', '\\textstyle', '\\scriptstyle', '\\scriptscriptstyle']);

const isBlank = character => character.trim() === '';
const isLetter = character => /[A-Za-z]/.test(character);

function commandEnd(source, start) {
  let end = start + 1;
  while (end < source.length && isLetter(source[end])) end += 1;
  return end === start + 1 && end < source.length ? end + 1 : end;
}

function skipWhitespace(source, start) {
  let index = start;
  while (index < source.length && isBlank(source[index])) index += 1;
  return index;
}

function skipAtom(source, start) {
  const index = skipWhitespace(source, start);
  if (index === source.length) return null;
  if (source[index] === '{') return skipGroup(source, index);
  if (source[index] === '\\') return skipCommandAtom(source, index);
  return index + 1;
}

function skipCommandAtom(source, start) {
  let end = commandEnd(source, start);
  const command = source.slice(start, end);
  if (command === '\\left') return skipLeftRight(source, end);
  if (command === '\\right') return null;
  if (FRACTION_COMMANDS.has(command)) {
    for (let argument = 0; argument < 2; argument += 1) {
      const argumentEnd = skipAtom(source, end);
      if (argumentEnd == null) return null;
      end = argumentEnd;
    }
  } else if (TEXT_COMMANDS.has(command)) {
    return skipAtom(source, end);
  }
  return end;
}

function skipGroup(source, start) {
  const opening = source[start];
  const closing = opening === '{' ? '}' : opening === '(' ? ')' : ']';
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === closing) return index + 1;
    if (character === '\\') {
      const end = opening === '{' ? commandEnd(source, index) : skipCommandAtom(source, index);
      if (end == null) return null;
      index = end;
    } else if (character === '{' || (opening !== '{' && (character === '(' || character === '['))) {
      const end = skipGroup(source, index);
      if (end == null) return null;
      index = end;
    } else {
      index += 1;
    }
  }
  return null;
}

function skipDelimiter(source, start) {
  const index = skipWhitespace(source, start);
  if (index === source.length) return null;
  return source[index] === '\\' ? commandEnd(source, index) : index + 1;
}

function skipLeftRight(source, start) {
  const delimiterEnd = skipDelimiter(source, start);
  if (delimiterEnd == null) return null;
  let index = delimiterEnd;
  while (index < source.length) {
    let next;
    if (source[index] === '{') {
      next = skipGroup(source, index);
    } else if (source[index] === '\\') {
      const end = commandEnd(source, index);
      const command = source.slice(index, end);
      if (command === '\\right') return skipDelimiter(source, end);
      next = command === '\\left' ? skipLeftRight(source, end) : end;
    } else {
      next = index + 1;
    }
    if (next == null) return null;
    index = next;
  }
  return null;
}

export function splitCalculationFormula(expression) {
  if (expression.includes('\\\\') || /\\(?:begin|end)\b/.test(expression)) return [expression];

  const parts = [];
  let start = 0;
  let index = 0;
  let expectsOperand = true;

  while (index < expression.length) {
    const character = expression[index];
    if (isBlank(character)) {
      index += 1;
      continue;
    }
    if (character === '\\') {
      const command = expression.slice(index, commandEnd(expression, index));
      const end = skipCommandAtom(expression, index);
      if (end == null) return [expression];
      index = end;
      if (SPACING_COMMANDS.has(command) || STYLE_COMMANDS.has(command)) continue;
      expectsOperand = BINARY_COMMANDS.has(command);
      continue;
    }
    if (character === '{' || character === '(' || character === '[') {
      const end = skipGroup(expression, index);
      if (end == null) return [expression];
      index = end;
      expectsOperand = false;
      continue;
    }
    if (character === '^' || character === '_') {
      const end = skipAtom(expression, index + 1);
      if (end == null) return [expression];
      index = end;
      expectsOperand = false;
      continue;
    }
    if (character === '=' || ((character === '+' || character === '-') && !expectsOperand)) {
      if (expression.slice(start, index).trim()) {
        parts.push(expression.slice(start, index).trim());
        start = index;
      }
      expectsOperand = true;
    } else if (character !== '+' && character !== '-') {
      expectsOperand = OPERAND_PRECEDING_CHARACTERS.has(character);
    }
    index += 1;
  }

  if (!parts.length) return [expression];
  parts.push(expression.slice(start).trim());
  return parts;
}

// fits(line, isContinuation) 는 최소 배율에서 그 줄이 들어가는지 알려준다.
export function groupCalculationFormula(expression, fits) {
  if (fits(expression, false)) return [expression];
  const parts = splitCalculationFormula(expression);
  if (parts.length === 1) return parts;

  const lines = [];
  const equality = parts.findIndex(part => part.startsWith('='));
  let next = 0;
  if (equality > 0) {
    lines.push(parts.slice(0, equality).join(''));
    next = equality;
  }
  let line = parts[next];
  next += 1;
  while (next < parts.length) {
    const candidate = line + parts[next];
    if (fits(candidate, lines.length > 0)) {
      line = candidate;
    } else {
      lines.push(line);
      line = parts[next];
    }
    next += 1;
  }
  lines.push(line);
  return lines;
}

// 이어지는 줄이 +/− 로 시작하면 이항 연산자 간격을 살리려고 {} 를 앞에 붙인다.
export function calculationLineLatex(expression, continuation) {
  return continuation && /^\s*[+\-−]/.test(expression) ? `{}${expression}` : expression;
}
