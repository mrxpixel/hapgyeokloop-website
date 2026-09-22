import {
  MAX_CHOICE_HEADER_COLUMNS,
  deleteStemBlock,
  insertStemBlock,
  updateStemBlock,
} from './stem-blocks.js';

/** Column separator inside a single choice's text. */
export const CHOICE_COLUMN_SEPARATOR = '|';

/**
 * Choice columns must track the header cap exactly: the app renders one column
 * per header label and one per choice separator, with no shared validation.
 */
export const MAX_CHOICE_COLUMNS = MAX_CHOICE_HEADER_COLUMNS;

/** Width used when a question first gains choice headers (56 of 105 live rows). */
export const DEFAULT_CHOICE_COLUMNS = 2;

function assertChoiceArray(choices, operation) {
  if (!Array.isArray(choices)) {
    throw new TypeError(`${operation} expects an array of choices`);
  }
}

function assertColumnCount(columnCount, operation) {
  if (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > MAX_CHOICE_COLUMNS) {
    throw new RangeError(`${operation} expects a column count from 1 to ${MAX_CHOICE_COLUMNS}`);
  }
}

function isChoiceObject(choice) {
  return Boolean(choice) && typeof choice === 'object' && !Array.isArray(choice);
}

/** Reads a choice's text whether it is an object entry or a legacy string. */
export function choiceText(choice) {
  if (typeof choice === 'string') return choice;
  return isChoiceObject(choice) ? String(choice.text ?? '') : '';
}

/** Falls back to A~E so choices saved without an id still label themselves. */
export function choiceLabel(choice, index) {
  const id = isChoiceObject(choice) ? choice.id : null;
  return typeof id === 'string' && id !== '' ? id : String.fromCharCode(65 + index);
}

/**
 * Splits one choice into its columns.
 *
 * Deliberately does not trim. Splitting and rejoining on a single-character
 * separator is an exact inverse, which is what keeps an untouched choice
 * byte-for-byte identical through the column editor.
 */
export function splitChoiceColumns(text) {
  return String(text ?? '').split(CHOICE_COLUMN_SEPARATOR);
}

/** Inverse of splitChoiceColumns. */
export function joinChoiceColumns(columns) {
  if (!Array.isArray(columns)) {
    throw new TypeError('joinChoiceColumns expects an array of columns');
  }
  return columns.map(column => String(column ?? '')).join(CHOICE_COLUMN_SEPARATOR);
}

/** Returns a resized copy without mutating the supplied column array. */
export function resizeChoiceColumns(columns, columnCount) {
  if (!Array.isArray(columns)) {
    throw new TypeError('resizeChoiceColumns expects an array of columns');
  }
  assertColumnCount(columnCount, 'resizeChoiceColumns');
  return Array.from({ length: columnCount }, (_, index) => (
    index < columns.length ? String(columns[index] ?? '') : ''
  ));
}

/**
 * Reports non-blank column values that would be lost at the requested width.
 *
 * Mirrors choiceHeadersTruncation: blank columns are deliberately omitted, so
 * count always equals columns.length rather than the number of removed slots.
 */
export function choiceColumnsTruncation(choices, columnCount) {
  assertChoiceArray(choices, 'choiceColumnsTruncation');
  assertColumnCount(columnCount, 'choiceColumnsTruncation');

  const columns = [];
  choices.forEach((choice, index) => {
    splitChoiceColumns(choiceText(choice)).slice(columnCount).forEach((column, offset) => {
      const value = String(column ?? '').trim();
      if (value) {
        columns.push({
          index,
          label: choiceLabel(choice, index),
          columnIndex: columnCount + offset,
          value,
        });
      }
    });
  });

  return { count: columns.length, columns };
}

/** Lists choices whose column count disagrees with the header column count. */
export function choiceColumnMismatches(choices, columnCount) {
  assertChoiceArray(choices, 'choiceColumnMismatches');
  assertColumnCount(columnCount, 'choiceColumnMismatches');

  const mismatches = [];
  choices.forEach((choice, index) => {
    const actual = splitChoiceColumns(choiceText(choice)).length;
    if (actual !== columnCount) {
      mismatches.push({ index, label: choiceLabel(choice, index), columnCount: actual });
    }
  });
  return mismatches;
}

/**
 * Lists columns holding a line break. A single-line input silently drops one,
 * so the editor warns instead of rewriting these columns on the author's behalf.
 */
export function choiceColumnsWithLineBreak(choices) {
  assertChoiceArray(choices, 'choiceColumnsWithLineBreak');

  const columns = [];
  choices.forEach((choice, index) => {
    splitChoiceColumns(choiceText(choice)).forEach((column, columnIndex) => {
      if (/[\r\n]/.test(column)) {
        columns.push({ index, label: choiceLabel(choice, index), columnIndex });
      }
    });
  });
  return columns;
}

/** Retains the original entry, and its id, whenever the text is unchanged. */
function replaceChoiceText(choices, index, text) {
  const choice = choices[index];
  if (choiceText(choice) === text) return choices;

  const next = choices.slice();
  next[index] = isChoiceObject(choice) ? { ...choice, text } : { text };
  return next;
}

/**
 * Writes one column of one choice.
 *
 * Only the edited column is rewritten, so untouched columns keep their exact
 * characters — including line breaks that a single-line input cannot hold.
 * A choice shorter than the edited column grows only as far as that column.
 */
export function setChoiceColumn(choices, choiceIndex, columnIndex, value) {
  assertChoiceArray(choices, 'setChoiceColumn');
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= choices.length) {
    throw new RangeError(`setChoiceColumn received an out-of-range choice index: ${choiceIndex}`);
  }
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= MAX_CHOICE_COLUMNS) {
    throw new RangeError(`setChoiceColumn received an out-of-range column index: ${columnIndex}`);
  }

  const next = splitChoiceColumns(choiceText(choices[choiceIndex]));
  while (next.length <= columnIndex) next.push('');
  next[columnIndex] = String(value ?? '');
  return replaceChoiceText(choices, choiceIndex, joinChoiceColumns(next));
}

/**
 * Forces every choice to the given column count.
 *
 * Unchanged entries are returned by reference, and an array that needs no
 * change at all comes back as the very same array.
 */
export function resizeAllChoiceColumns(choices, columnCount) {
  assertChoiceArray(choices, 'resizeAllChoiceColumns');
  assertColumnCount(columnCount, 'resizeAllChoiceColumns');

  return choices.reduce((current, choice, index) => replaceChoiceText(
    current,
    index,
    joinChoiceColumns(resizeChoiceColumns(splitChoiceColumns(choiceText(choice)), columnCount)),
  ), choices);
}

/**
 * Normalizes a choice entry for saving.
 *
 * Object entries pass through untouched so `id` survives even when the text is
 * blank; only a legacy non-object entry is wrapped.
 */
export function choiceForSave(choice) {
  return isChoiceObject(choice) ? choice : { text: choiceText(choice) };
}

/**
 * Appends a choice header block as the stem's own final line.
 *
 * All 105 live rows carry the marker at the very end, preceded by exactly one
 * newline, so the trailing text block is extended instead of the marker being
 * dropped at the cursor — which could also land it inside a [TABLE] block and
 * break the parser. `decorate` lets the editor tag the blocks it creates.
 */
export function appendChoiceHeadersBlock(blocks, columnCount, decorate = block => block) {
  if (!Array.isArray(blocks)) {
    throw new TypeError('appendChoiceHeadersBlock expects an array of blocks');
  }
  assertColumnCount(columnCount, 'appendChoiceHeadersBlock');
  if (blocks.some(block => block?.kind === 'choiceHeaders')) {
    // A second marker would be silently erased: the app reads the first match
    // and then strips every match from the stem.
    throw new Error('appendChoiceHeadersBlock expects a stem without choice headers');
  }

  let next = blocks;
  const lastIndex = next.length - 1;
  if (lastIndex >= 0) {
    const last = next[lastIndex];
    if (last?.kind === 'text') {
      const text = String(last.text ?? '');
      if (!text.endsWith('\n')) {
        next = updateStemBlock(next, lastIndex, { text: `${text}\n` });
      }
    } else {
      next = insertStemBlock(next, next.length, decorate({ kind: 'text', text: '\n' }));
    }
  }

  return insertStemBlock(next, next.length, decorate({
    kind: 'choiceHeaders',
    headers: Array.from({ length: columnCount }, () => ''),
  }));
}

/**
 * Removes the choice header block, and the newline that appended it, so that
 * adding then removing a header returns the stem to its original characters.
 */
export function removeChoiceHeadersBlock(blocks) {
  if (!Array.isArray(blocks)) {
    throw new TypeError('removeChoiceHeadersBlock expects an array of blocks');
  }
  const blockIndex = blocks.findIndex(block => block?.kind === 'choiceHeaders');
  if (blockIndex < 0) return blocks;

  let next = deleteStemBlock(blocks, blockIndex);
  const previousIndex = blockIndex - 1;
  if (blockIndex === blocks.length - 1 && previousIndex >= 0 && next[previousIndex]?.kind === 'text') {
    const text = String(next[previousIndex].text ?? '');
    if (text.endsWith('\n')) {
      next = updateStemBlock(next, previousIndex, { text: text.slice(0, -1) });
    }
  }
  return next;
}
