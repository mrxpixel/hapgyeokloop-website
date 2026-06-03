const BOXED_PATTERN = /\[BOXED\]([\s\S]*?)\[\/BOXED\]/gi;

const HANGUL_CONSONANTS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const HANGUL_SYLLABLE_KEYS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const CIRCLED_HANGUL_KEYS = ['㉠', '㉡', '㉢', '㉣', '㉤', '㉥', '㉦', '㉧', '㉨', '㉩', '㉪', '㉫', '㉬', '㉭'];
const CIRCLED_HANGUL_SYLLABLE_KEYS = ['㉮', '㉯', '㉰', '㉱', '㉲', '㉳', '㉴', '㉵', '㉶', '㉷', '㉸', '㉹', '㉺', '㉻'];
const CIRCLED_NUMBER_KEYS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

export function parseStemGivens(rawStem) {
  const source = String(rawStem ?? '');
  if (!source.trim()) return [];

  const boxedBoxes = parseBoxedBlocks(source);
  const unboxedSource = source.replace(BOXED_PATTERN, '\n');
  const headerBoxes = parseHeaderBlocks(unboxedSource);
  const boxes = [...boxedBoxes, ...headerBoxes];
  if (boxes.length > 0) return boxes;

  const headerlessBox = parseHeaderlessBlock(unboxedSource);
  return headerlessBox ? [headerlessBox] : [];
}

function parseBoxedBlocks(source) {
  const boxes = [];
  const pattern = new RegExp(BOXED_PATTERN);
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const blockText = match[1] || '';
    const nestedHeaderBoxes = parseHeaderBlocks(blockText);
    if (nestedHeaderBoxes.length > 0) {
      boxes.push(...nestedHeaderBoxes);
      continue;
    }

    const lines = toLines(blockText);
    const firstContentIndex = lines.findIndex(line => line.trim() !== '');
    const label = firstContentIndex >= 0 ? standaloneBogiLabel(lines[firstContentIndex]) : null;
    const itemLines = label ? lines.slice(firstContentIndex + 1) : lines;
    const extraction = extractGivenItems(itemLines, { allowLatin: true, allowNumbers: true });
    const box = makeBox(label || '보기', extraction.items);
    if (box) boxes.push(box);
  }

  return boxes;
}

function parseHeaderBlocks(source) {
  const lines = toLines(source);
  const boxes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const standaloneLabel = standaloneBogiLabel(line);
    if (standaloneLabel) {
      const extraction = extractGivenItems(lines.slice(index + 1), {
        allowLatin: true,
        allowNumbers: true,
        stopAtHeader: true,
      });
      const box = makeBox(standaloneLabel, extraction.items);
      if (box) boxes.push(box);
      index += extraction.consumed;
      continue;
    }

    const inlineLabel = inlineBogiLabel(line);
    if (inlineLabel && index < lines.length - 1) {
      const extraction = extractGivenItems(lines.slice(index + 1), {
        allowLatin: false,
        allowNumbers: true,
        stopAtHeader: true,
      });
      const box = makeBox(inlineLabel, extraction.items);
      if (box) boxes.push(box);
      index += extraction.consumed;
    }
  }

  return boxes;
}

function parseHeaderlessBlock(source) {
  const lines = toLines(source);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!matchGivenLine(line, { allowLatin: false, allowNumbers: true })) continue;

    const extraction = extractGivenItems(lines.slice(index), {
      allowLatin: false,
      allowNumbers: true,
      stopAtHeader: true,
    });
    if (!isConfidentHeaderlessItems(extraction.items)) continue;

    return makeBox('보기', extraction.items);
  }

  return null;
}

function extractGivenItems(lines, { allowLatin, allowNumbers, stopAtHeader = false }) {
  const items = [];
  const trailing = [];
  let currentKey = null;
  let currentText = '';
  let collecting = false;
  let done = false;
  let consumed = 0;

  const flushCurrent = () => {
    if (currentKey == null) return;
    const text = currentText.trim();
    if (text) items.push({ key: currentKey, text });
    currentKey = null;
    currentText = '';
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] ?? '').trim();
    if (stopAtHeader && standaloneBogiLabel(line) && (collecting || items.length === 0)) break;
    consumed = index + 1;
    if (!line) continue;

    if (done) {
      trailing.push(line);
      continue;
    }

    const match = matchGivenLine(line, { allowLatin, allowNumbers });
    if (match) {
      collecting = true;
      flushCurrent();
      currentKey = match.key;
      currentText = match.text.trim();
      continue;
    }

    if (collecting && currentKey != null && !looksLikeTrailingQuestion(line)) {
      currentText += (currentText ? ' ' : '') + line;
      continue;
    }

    if (collecting) {
      flushCurrent();
      done = true;
    }
    trailing.push(line);
  }

  flushCurrent();
  return { items, trailing, consumed };
}

function matchGivenLine(line, { allowLatin, allowNumbers }) {
  const patterns = [
    /^\(?\s*([ㄱ-ㅎ])\s*\)?\s*[.:)]?\s*(.*)$/u,
    /^([㉠-㉯㉮-㉻])\s*[.:)]?\s*(.*)$/u,
    /^\(?\s*([가나다라마바사아자차카타파하])\s*\)?\s*[:.)]\s*(.*)$/u,
    /^([○●■×])\s*(.*)$/u,
  ];

  if (allowNumbers) {
    patterns.push(
      /^\(?\s*(\d{1,2})\s*\)?\s*[.:)]\s*(.*)$/u,
      /^([①-⑳])\s*[.:)]?\s*(.*)$/u,
    );
  }

  if (allowLatin) {
    patterns.push(
      /^\(?\s*([A-Za-z])\s*\)?\s*[.:)]\s*(.*)$/u,
      /^([ⓐ-ⓩ])\s*[.:)]?\s*(.*)$/u,
    );
  }

  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match) return { key: match[1], text: match[2] || '' };
  }

  return null;
}

function isConfidentHeaderlessItems(items) {
  if (!Array.isArray(items) || items.length < 2) return false;
  const keys = items.map(item => item.key);
  return isSequentialKeyPrefix(keys, HANGUL_CONSONANTS)
    || isSequentialKeyPrefix(keys, CIRCLED_HANGUL_KEYS)
    || isSequentialKeyPrefix(keys, CIRCLED_HANGUL_SYLLABLE_KEYS)
    || isSequentialKeyPrefix(keys, HANGUL_SYLLABLE_KEYS)
    || isSequentialKeyPrefix(keys, CIRCLED_NUMBER_KEYS)
    || isSequentialNumberPrefix(keys);
}

function isSequentialKeyPrefix(keys, sequence) {
  const start = sequence.indexOf(keys[0]);
  if (start < 0 || start + 1 >= sequence.length) return false;
  const sampleSize = Math.min(keys.length, 3);
  for (let offset = 0; offset < sampleSize; offset += 1) {
    if (sequence[start + offset] !== keys[offset]) return false;
  }
  return true;
}

function isSequentialNumberPrefix(keys) {
  const nums = keys.slice(0, Math.min(keys.length, 3)).map(key => Number(key));
  if (nums.some(num => !Number.isInteger(num))) return false;
  if (nums[0] !== 1) return false;
  return nums.every((num, index) => num === index + 1);
}

function standaloneBogiLabel(line) {
  const trimmed = String(line ?? '').trim();
  const bracketed = /^[■○●]?\s*[〈<\[]\s*([^〉>\]]*보기[^〉>\]]*)\s*[〉>\]]\s*$/u.exec(trimmed);
  if (bracketed) return normalizeLabel(bracketed[1]);

  const plain = /^(?:[■○●]\s*)?(보기(?:\s*[0-9０-９]+)?)\s*$/u.exec(trimmed);
  return plain ? normalizeLabel(plain[1]) : null;
}

function inlineBogiLabel(line) {
  const match = /[〈<\[]\s*([^〉>\]]*보기[^〉>\]]*)\s*[〉>\]]/u.exec(String(line ?? ''));
  return match ? normalizeLabel(match[1]) : null;
}

function normalizeLabel(label) {
  return String(label || '보기').replace(/\s+/g, ' ').trim() || '보기';
}

function looksLikeTrailingQuestion(line) {
  const trimmed = String(line ?? '').trim();
  return trimmed.endsWith('?')
    || trimmed.endsWith('？')
    || trimmed.startsWith('위')
    || trimmed.startsWith('이 중')
    || trimmed.startsWith('다음 중')
    || trimmed.includes('모두 고른 것은')
    || trimmed.includes('옳은 것은')
    || trimmed.includes('틀린 것은')
    || trimmed.includes('올바른 것은')
    || trimmed.includes('바르게 짝지');
}

function makeBox(label, items) {
  const cleanItems = (items || [])
    .map(item => ({
      key: String(item?.key ?? '').trim(),
      text: String(item?.text ?? '').trim(),
    }))
    .filter(item => item.key && item.text);

  if (cleanItems.length === 0) return null;
  return {
    label: normalizeLabel(label),
    markdown_enabled: false,
    items: cleanItems,
  };
}

function toLines(text) {
  return cleanPromptText(text).split('\n');
}

function cleanPromptText(text) {
  const input = String(text ?? '').replace(/\r\n?/g, '\n');
  const cleaned = input
    .replace(/\[\/?BOXED\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || input.trim();
}

export default parseStemGivens;
