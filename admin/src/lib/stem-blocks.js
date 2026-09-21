import {
  listConceptTableBlocks,
  parseConceptTableRows,
  serializeConceptTable,
} from './concept-table.js';

const MARKER_PATTERN = /\[(\/)?(TABLE|CHOICE_HEADERS|SVG)\]/g;
export const MAX_CHOICE_HEADER_COLUMNS = 100;

function markerTokens(source) {
  return [...source.matchAll(MARKER_PATTERN)].map(match => ({
    type: match[2],
    closing: Boolean(match[1]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function matchingCloseIndexes(tokens) {
  const openers = new Map();
  const matches = new Map();

  tokens.forEach((token, index) => {
    if (!openers.has(token.type)) openers.set(token.type, []);
    const stack = openers.get(token.type);
    if (!token.closing) {
      stack.push(index);
    } else if (stack.length > 0) {
      matches.set(stack.pop(), index);
    }
  });

  return matches;
}

function textBlock(raw) {
  return { kind: 'text', raw, text: raw };
}

function tableBlock(table) {
  return {
    kind: 'table',
    raw: table.full,
    rows: parseConceptTableRows(table.content),
  };
}

function choiceHeadersBlock(source, opener, closer) {
  const content = source.slice(opener.end, closer.start);
  return {
    kind: 'choiceHeaders',
    raw: source.slice(opener.start, closer.end),
    headers: content.split('|').map(header => header.trim()),
  };
}

function assertChoiceHeaderResizeArguments(headers, columnCount, operation) {
  if (!Array.isArray(headers)) {
    throw new TypeError(`${operation} expects an array of headers`);
  }
  if (!Number.isInteger(columnCount) || columnCount < 0 || columnCount > MAX_CHOICE_HEADER_COLUMNS) {
    throw new RangeError(
      `${operation} expects a column count from 0 to ${MAX_CHOICE_HEADER_COLUMNS}`,
    );
  }
}

/**
 * Reports non-blank header labels that would be lost at the requested width.
 * Empty (including whitespace-only) truncated columns are deliberately omitted,
 * so count always equals labels.length rather than the number of removed slots.
 */
export function choiceHeadersTruncation(headers, columnCount) {
  assertChoiceHeaderResizeArguments(headers, columnCount, 'choiceHeadersTruncation');
  const labels = headers.slice(columnCount)
    .map(header => String(header ?? '').trim())
    .filter(Boolean);
  return { count: labels.length, labels };
}

/** Returns a resized copy without mutating the supplied header array. */
export function resizeChoiceHeaders(headers, columnCount) {
  assertChoiceHeaderResizeArguments(headers, columnCount, 'resizeChoiceHeaders');
  return Array.from({ length: columnCount }, (_, index) => (
    index < headers.length ? headers[index] : ''
  ));
}

function figureBlock(source, opener, closer = null) {
  return {
    kind: 'figure',
    raw: source.slice(opener.start, closer?.end ?? opener.end),
    format: 'svg',
    content: closer ? source.slice(opener.end, closer.start) : '',
    standalone: closer === null,
  };
}

/**
 * Splits a stem into lossless, editable blocks.
 *
 * Every returned block owns its exact source text in `raw`. To serialize an
 * edited block from its payload, callers must explicitly set `raw` to `null`.
 * Leaving `raw` intact always preserves the original characters verbatim.
 */
export function parseStemBlocks(stem) {
  const source = String(stem ?? '');
  if (source === '') return [];

  const tokens = markerTokens(source);
  if (tokens.length === 0) return [textBlock(source)];
  const closeIndexes = matchingCloseIndexes(tokens);

  const tablesByStart = new Map(
    listConceptTableBlocks(source).map(table => [table.start, table]),
  );
  const blocks = [];
  let sourceCursor = 0;
  let tokenIndex = 0;

  const appendStructuredBlock = (start, end, block) => {
    if (start > sourceCursor) {
      blocks.push(textBlock(source.slice(sourceCursor, start)));
    }
    blocks.push(block);
    sourceCursor = end;
  };

  while (tokenIndex < tokens.length) {
    const opener = tokens[tokenIndex];
    if (opener.closing) {
      tokenIndex += 1;
      continue;
    }

    const closerIndex = closeIndexes.get(tokenIndex) ?? -1;

    // An unpaired SVG marker is a supported figure placeholder. Other
    // unclosed markers make the remaining source plain text.
    if (closerIndex < 0) {
      if (opener.type === 'SVG') {
        appendStructuredBlock(
          opener.start,
          opener.end,
          figureBlock(source, opener),
        );
        tokenIndex += 1;
        continue;
      }
      break;
    }

    const closer = tokens[closerIndex];

    // Any recognized marker inside another marker is unsupported nesting.
    // Keep the complete outer region in the surrounding text block.
    if (closerIndex !== tokenIndex + 1) {
      tokenIndex = closerIndex + 1;
      continue;
    }

    if (opener.type === 'TABLE') {
      const table = tablesByStart.get(opener.start);
      if (table && table.end === closer.end) {
        appendStructuredBlock(table.start, table.end, tableBlock(table));
      }
    } else if (opener.type === 'CHOICE_HEADERS') {
      appendStructuredBlock(
        opener.start,
        closer.end,
        choiceHeadersBlock(source, opener, closer),
      );
    } else {
      appendStructuredBlock(
        opener.start,
        closer.end,
        figureBlock(source, opener, closer),
      );
    }

    tokenIndex = closerIndex + 1;
  }

  if (sourceCursor < source.length) {
    blocks.push(textBlock(source.slice(sourceCursor)));
  }

  return blocks;
}

function serializePayload(block, index) {
  switch (block?.kind) {
    case 'text':
      return String(block.text ?? '');
    case 'table':
      return serializeConceptTable(block.rows);
    case 'choiceHeaders': {
      const headers = Array.isArray(block.headers) ? block.headers : [];
      return `[CHOICE_HEADERS]${headers.map(header => String(header ?? '')).join('|')}[/CHOICE_HEADERS]`;
    }
    case 'figure':
      if (block.format !== 'svg') {
        throw new TypeError(`Unsupported figure format at block ${index}: ${block.format}`);
      }
      return block.standalone
        ? '[SVG]'
        : `[SVG]${String(block.content ?? '')}[/SVG]`;
    default:
      throw new TypeError(`Unsupported stem block kind at block ${index}: ${block?.kind}`);
  }
}

/**
 * Reassembles stem blocks. A string `raw` always wins; set `raw: null` on an
 * edited (or newly-created) block to serialize its current payload instead.
 */
export function serializeStemBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    throw new TypeError('serializeStemBlocks expects an array of blocks');
  }

  return blocks.map((block, index) => (
    typeof block?.raw === 'string' ? block.raw : serializePayload(block, index)
  )).join('');
}

function assertStemBlockArray(blocks, operation) {
  if (!Array.isArray(blocks)) {
    throw new TypeError(`${operation} expects an array of blocks`);
  }
}

function assertStemBlockIndex(blocks, index, operation, allowEnd = false) {
  const maximum = allowEnd ? blocks.length : blocks.length - 1;
  if (!Number.isInteger(index) || index < 0 || index > maximum) {
    throw new RangeError(`${operation} received an out-of-range block index: ${index}`);
  }
}

function assertStemBlockObject(block, operation) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new TypeError(`${operation} expects a stem block object`);
  }
}

/**
 * Replaces fields on one block without mutating the source array or block.
 * The updated block is always marked dirty so its payload wins on serialize.
 */
export function updateStemBlock(blocks, index, patch) {
  assertStemBlockArray(blocks, 'updateStemBlock');
  assertStemBlockIndex(blocks, index, 'updateStemBlock');
  assertStemBlockObject(blocks[index], 'updateStemBlock');
  assertStemBlockObject(patch, 'updateStemBlock');

  const next = blocks.slice();
  next[index] = { ...blocks[index], ...patch, raw: null };
  return next;
}

/**
 * Inserts a new payload block at a gap from 0 through blocks.length.
 * A supplied raw value is deliberately ignored so stale source cannot mask it.
 */
export function insertStemBlock(blocks, index, block) {
  assertStemBlockArray(blocks, 'insertStemBlock');
  assertStemBlockIndex(blocks, index, 'insertStemBlock', true);
  assertStemBlockObject(block, 'insertStemBlock');

  const next = blocks.slice();
  next.splice(index, 0, { ...block, raw: null });
  return next;
}

/** Removes exactly one block and retains all surviving block objects as-is. */
export function deleteStemBlock(blocks, index) {
  assertStemBlockArray(blocks, 'deleteStemBlock');
  assertStemBlockIndex(blocks, index, 'deleteStemBlock');
  return [...blocks.slice(0, index), ...blocks.slice(index + 1)];
}

/**
 * Moves one block to its final array index. Existing block objects, including
 * their raw values, are retained verbatim.
 */
export function moveStemBlock(blocks, fromIndex, toIndex) {
  assertStemBlockArray(blocks, 'moveStemBlock');
  assertStemBlockIndex(blocks, fromIndex, 'moveStemBlock');
  assertStemBlockIndex(blocks, toIndex, 'moveStemBlock');

  const next = blocks.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Safety pin used immediately before saving a stem.
 *
 * The original source must still satisfy the lossless parser contract. The
 * current blocks must serialize successfully, and a caller-declared untouched
 * stem must remain byte-for-byte equal to the original.
 */
export function validateStemBlocksForSave(originalStem, blocks, untouched = false) {
  const original = String(originalStem ?? '');
  let originalRoundTrip = null;
  let originalRoundTripFailed = false;
  let stem = null;
  let serializationFailed = false;

  try {
    originalRoundTrip = serializeStemBlocks(parseStemBlocks(original));
  } catch {
    originalRoundTripFailed = true;
  }

  try {
    stem = serializeStemBlocks(blocks);
  } catch {
    serializationFailed = true;
  }

  if (originalRoundTripFailed || originalRoundTrip !== original) {
    return { ok: false, stem, reason: 'original-round-trip-mismatch' };
  }
  if (serializationFailed) {
    return { ok: false, stem: null, reason: 'current-serialization-failed' };
  }
  if (untouched && stem !== original) {
    return { ok: false, stem, reason: 'untouched-stem-changed' };
  }
  return { ok: true, stem, reason: null };
}
