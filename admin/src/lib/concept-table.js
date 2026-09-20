export const CONCEPT_TABLE_MERGE_LEFT = 'left';
export const CONCEPT_TABLE_MERGE_UP = 'up';

export function sanitizeConceptTableCell(value) {
  return String(value ?? '')
    .replace(/\[\/?TABLE\]/g, '')
    .replace(/[|\r\n]/g, '');
}

export function sanitizeConceptTableDiagonalLabel(value) {
  return sanitizeConceptTableCell(value).replace(/\\/g, '');
}

export function createConceptTableCell(value = '') {
  return {
    value: sanitizeConceptTableCell(value),
    merge: null,
    diagonal: null,
  };
}

function normalizeDiagonal(diagonal) {
  if (!diagonal || typeof diagonal !== 'object') return null;
  return {
    rowLabel: sanitizeConceptTableDiagonalLabel(diagonal.rowLabel),
    columnLabel: sanitizeConceptTableDiagonalLabel(diagonal.columnLabel),
    beforeSlash: String(diagonal.beforeSlash ?? ' ').replace(/[^\t ]/g, ''),
    afterSlash: String(diagonal.afterSlash ?? ' ').replace(/[^\t ]/g, ''),
  };
}

function normalizeConceptTableCell(cell) {
  if (!cell || typeof cell !== 'object' || Array.isArray(cell)) {
    return createConceptTableCell(cell);
  }
  const merge = cell.merge === CONCEPT_TABLE_MERGE_LEFT || cell.merge === CONCEPT_TABLE_MERGE_UP
    ? cell.merge
    : null;
  return {
    value: sanitizeConceptTableCell(cell.value),
    merge,
    diagonal: merge ? null : normalizeDiagonal(cell.diagonal),
  };
}

export function createEmptyConceptTable(rowCount = 2, columnCount = 3) {
  const safeRowCount = Math.max(1, Number.isInteger(rowCount) ? rowCount : 2);
  const safeColumnCount = Math.max(1, Number.isInteger(columnCount) ? columnCount : 3);
  return Array.from({ length: safeRowCount }, () => (
    Array.from({ length: safeColumnCount }, () => createConceptTableCell())
  ));
}

export function normalizeConceptTableRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return createEmptyConceptTable();
  const columnCount = Math.max(1, ...rows.map(row => Array.isArray(row) ? row.length : 0));
  return rows.map(row => Array.from({ length: columnCount }, (_, index) => (
    normalizeConceptTableCell(Array.isArray(row) ? row[index] : '')
  )));
}

function parseDiagonalCell(value) {
  const slashMatches = value.match(/\\/g);
  if (slashMatches?.length !== 1) return null;
  const slashIndex = value.indexOf('\\');
  const before = value.slice(0, slashIndex);
  const after = value.slice(slashIndex + 1);
  const beforeSlash = before.match(/[\t ]*$/)?.[0] || '';
  const afterSlash = after.match(/^[\t ]*/)?.[0] || '';
  return {
    rowLabel: before.slice(0, before.length - beforeSlash.length),
    columnLabel: after.slice(afterSlash.length),
    beforeSlash,
    afterSlash,
  };
}

function parseConceptTableCell(value, rowIndex, columnIndex) {
  const sanitized = sanitizeConceptTableCell(value);
  const marker = sanitized.trim();
  if (marker === CONCEPT_TABLE_MERGE_LEFT_MARKER && columnIndex > 0) {
    return { value: '', merge: CONCEPT_TABLE_MERGE_LEFT, diagonal: null };
  }
  if (marker === CONCEPT_TABLE_MERGE_UP_MARKER && rowIndex > 0) {
    return { value: '', merge: CONCEPT_TABLE_MERGE_UP, diagonal: null };
  }
  const diagonal = rowIndex === 0 && columnIndex === 0 ? parseDiagonalCell(sanitized) : null;
  return { value: diagonal ? '' : sanitized, merge: null, diagonal };
}

export function parseConceptTableRows(content) {
  const body = String(content || '').replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '');
  if (body === '') return [[createConceptTableCell()]];
  const sourceRows = body.split(/\r?\n/).filter(row => row.trim() !== '');
  if (sourceRows.length === 0) return [[createConceptTableCell()]];
  const parsedRows = sourceRows.map((row, rowIndex) => (
    row.split('|').map((cell, columnIndex) => parseConceptTableCell(cell, rowIndex, columnIndex))
  ));
  return normalizeConceptTableRows(parsedRows);
}

export const CONCEPT_TABLE_MERGE_LEFT_MARKER = '<';
export const CONCEPT_TABLE_MERGE_UP_MARKER = '^';

export function conceptTableCellToken(cell, rowIndex, columnIndex) {
  const normalized = normalizeConceptTableCell(cell);
  if (normalized.merge === CONCEPT_TABLE_MERGE_LEFT && columnIndex > 0) {
    return CONCEPT_TABLE_MERGE_LEFT_MARKER;
  }
  if (normalized.merge === CONCEPT_TABLE_MERGE_UP && rowIndex > 0) {
    return CONCEPT_TABLE_MERGE_UP_MARKER;
  }
  if (rowIndex === 0 && columnIndex === 0 && normalized.diagonal) {
    const diagonal = normalized.diagonal;
    return `${diagonal.rowLabel}${diagonal.beforeSlash}\\${diagonal.afterSlash}${diagonal.columnLabel}`;
  }
  return sanitizeConceptTableCell(normalized.value);
}

export function serializeConceptTable(rows) {
  const normalized = normalizeConceptTableRows(rows);
  const body = normalized.map((row, rowIndex) => row.map((cell, columnIndex) => (
    conceptTableCellToken(cell, rowIndex, columnIndex)
  )).join('|')).join('\n');
  return `[TABLE]${body}[/TABLE]`;
}

const selectionKey = ({ row, column }) => `${row},${column}`;

// Markers always point backwards, so owners can be resolved in row order.
export function conceptTableMergeGroups(rows) {
  const owners = [];
  const groups = new Map();
  rows.forEach((cells, row) => {
    owners[row] = [];
    cells.forEach((cell, column) => {
      const owner = cell.merge === CONCEPT_TABLE_MERGE_LEFT && column > 0
        ? owners[row][column - 1]
        : cell.merge === CONCEPT_TABLE_MERGE_UP && row > 0
          ? owners[row - 1][column]
          : `${row},${column}`;
      owners[row][column] = owner;
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push({ row, column });
    });
  });
  return [...groups.values()];
}

export function expandConceptTableSelection(rows, selection) {
  const keys = new Set(selection.map(selectionKey));
  return conceptTableMergeGroups(rows)
    .filter(group => group.some(cell => keys.has(selectionKey(cell))))
    .flat();
}

export function selectConceptTableRange(rows, anchor, focus) {
  const selection = [];
  for (let row = Math.min(anchor.row, focus.row); row <= Math.max(anchor.row, focus.row); row++) {
    for (let column = Math.min(anchor.column, focus.column); column <= Math.max(anchor.column, focus.column); column++) {
      if (rows[row]?.[column]) selection.push({ row, column });
    }
  }
  return expandConceptTableSelection(rows, selection);
}

export function isRectangularConceptTableSelection(selection) {
  if (!selection.length || selection.some(({ row, column }) => (
    !Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0
  ))) return false;
  const height = Math.max(...selection.map(cell => cell.row)) - Math.min(...selection.map(cell => cell.row)) + 1;
  const width = Math.max(...selection.map(cell => cell.column)) - Math.min(...selection.map(cell => cell.column)) + 1;
  return new Set(selection.map(selectionKey)).size === height * width;
}

export function canMergeConceptTableSelection(rows, selection) {
  if (selection.some(({ row, column }) => !rows[row]?.[column])) return false;
  const expanded = expandConceptTableSelection(rows, selection);
  return new Set(selection.map(selectionKey)).size === expanded.length
    && expanded.length > 1 && isRectangularConceptTableSelection(expanded);
}

export function conceptTableMergeDiscardCount(rows, selection) {
  const top = Math.min(...selection.map(cell => cell.row));
  const left = Math.min(...selection.map(cell => cell.column));
  return selection.filter(({ row, column }) => {
    const cell = rows[row][column];
    return (row !== top || column !== left) && !cell.merge
      && Boolean(cell.value || cell.diagonal?.rowLabel || cell.diagonal?.columnLabel);
  }).length;
}

export function mergeConceptTableSelection(rows, selection) {
  if (!canMergeConceptTableSelection(rows, selection)) return rows;
  const next = normalizeConceptTableRows(rows);
  const top = Math.min(...selection.map(cell => cell.row));
  const left = Math.min(...selection.map(cell => cell.column));
  selection.forEach(({ row, column }) => {
    if (row === top && column === left) return;
    next[row][column] = {
      ...createConceptTableCell(),
      merge: column === left ? CONCEPT_TABLE_MERGE_UP : CONCEPT_TABLE_MERGE_LEFT,
    };
  });
  return next;
}

export function unmergeConceptTableSelection(rows, selection) {
  const next = normalizeConceptTableRows(rows);
  expandConceptTableSelection(rows, selection).forEach(({ row, column }) => {
    next[row][column].merge = null;
  });
  return next;
}
