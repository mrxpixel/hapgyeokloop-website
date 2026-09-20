import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONCEPT_TABLE_MERGE_LEFT,
  CONCEPT_TABLE_MERGE_UP,
  canMergeConceptTableSelection,
  conceptTableMergeDiscardCount,
  isRectangularConceptTableSelection,
  mergeConceptTableSelection,
  selectConceptTableRange,
  unmergeConceptTableSelection,
  createEmptyConceptTable,
  parseConceptTableRows,
  sanitizeConceptTableCell,
  serializeConceptTable,
} from './concept-table.js';

function roundTrip(block) {
  const match = /^\[TABLE\]([\s\S]*)\[\/TABLE\]$/.exec(block);
  assert.ok(match, 'valid table fixture');
  return serializeConceptTable(parseConceptTableRows(match[1]));
}

test('round-trips the two-row merged header example', () => {
  const source = `[TABLE]기간|단일금액 ₩1의 현재가치|<|정상연금 ₩1의 현재가치|<
^|7%|12%|7%|12%
1|0.9346|0.8929|0.9346|0.8929[/TABLE]`;
  const rows = parseConceptTableRows(source.slice(7, -8));

  assert.equal(rows[0][2].merge, CONCEPT_TABLE_MERGE_LEFT);
  assert.equal(rows[0][4].merge, CONCEPT_TABLE_MERGE_LEFT);
  assert.equal(rows[1][0].merge, CONCEPT_TABLE_MERGE_UP);
  assert.equal(serializeConceptTable(rows), source);
});

test('round-trips and restores the diagonal header example', () => {
  const source = `[TABLE]산업 \\ 지역|A|B|C|전국
제조업 고용자수(명)|150|170|195|515[/TABLE]`;
  const rows = parseConceptTableRows(source.slice(7, -8));

  assert.deepEqual(rows[0][0].diagonal, {
    rowLabel: '산업',
    columnLabel: '지역',
    beforeSlash: ' ',
    afterSlash: ' ',
  });
  assert.equal(serializeConceptTable(rows), source);
});

test('round-trips a legacy table without merge metadata', () => {
  const source = `[TABLE]구분|내용
취득|소유권을 넘겨받음
처분|소유권을 넘김[/TABLE]`;

  assert.equal(roundTrip(source), source);
});

test('only exact marker cells and one top-left backslash are structural', () => {
  const source = `[TABLE]두\\개\\역슬래시|A ^ B|x<y
<|^^|\가나다\\라마바[/TABLE]`;
  const rows = parseConceptTableRows(source.slice(7, -8));

  assert.equal(rows[0][0].diagonal, null);
  assert.equal(rows[0][1].merge, null);
  assert.equal(rows[0][2].merge, null);
  assert.equal(rows[1][0].merge, null);
  assert.equal(rows[1][1].merge, null);
  assert.equal(roundTrip(source), source);
});

test('sanitizes table delimiters but preserves merge and diagonal characters', () => {
  assert.equal(
    sanitizeConceptTableCell('[TABLE]A|B\n^<\\[/TABLE]'),
    'AB^<\\',
  );

  const rows = createEmptyConceptTable(2, 2);
  rows[0][0].value = 'A';
  rows[0][1].merge = CONCEPT_TABLE_MERGE_LEFT;
  rows[1][0].value = 'B';
  rows[1][1].merge = CONCEPT_TABLE_MERGE_UP;
  assert.equal(serializeConceptTable(rows), '[TABLE]A|<\nB|^[/TABLE]');
});

test('drops internal blank rows the same way as the mobile renderer', () => {
  const rows = parseConceptTableRows('A|B\n   \nC|D');

  assert.equal(rows.length, 2);
  assert.equal(serializeConceptTable(rows), '[TABLE]A|B\nC|D[/TABLE]');
});

const fullRange = rows => selectConceptTableRange(rows, { row: 0, column: 0 }, {
  row: rows.length - 1, column: rows[0].length - 1,
});

test('merges a 2×2 rectangle using mobile row and column markers', () => {
  const rows = parseConceptTableRows('A|B\nC|D');
  const selection = fullRange(rows);
  assert.equal(conceptTableMergeDiscardCount(rows, selection), 3);
  assert.equal(serializeConceptTable(mergeConceptTableSelection(rows, selection)), '[TABLE]A|<\n^|<[/TABLE]');
  assert.equal(serializeConceptTable(rows), '[TABLE]A|B\nC|D[/TABLE]', 'does not mutate input');
});

test('round-trips a combined horizontal and vertical merge', () => {
  assert.equal(roundTrip('[TABLE]A|<\n^|<[/TABLE]'), '[TABLE]A|<\n^|<[/TABLE]');
});

test('rejects L-shaped and partial merged selections', () => {
  const rows = parseConceptTableRows('A|<\nB|C');
  const selection = selectConceptTableRange(rows, { row: 0, column: 1 }, { row: 1, column: 1 });
  assert.equal(selection.length, 3, 'includes the whole intersected horizontal merge');
  assert.equal(isRectangularConceptTableSelection(selection), false);
  assert.equal(canMergeConceptTableSelection(rows, selection), false);
  assert.equal(mergeConceptTableSelection(rows, selection), rows);
  assert.equal(canMergeConceptTableSelection(rows, [{ row: 0, column: 1 }, { row: 1, column: 1 }]), false);
  assert.equal(isRectangularConceptTableSelection([]), false);
  assert.equal(canMergeConceptTableSelection(rows, [{ row: 1, column: 0 }]), false);
});

test('unmerges every selected group and leaves discarded content empty', () => {
  const rows = parseConceptTableRows('A|\n|');
  const merged = mergeConceptTableSelection(rows, fullRange(rows));
  const selection = selectConceptTableRange(merged, { row: 1, column: 1 }, { row: 1, column: 1 });
  assert.equal(selection.length, 4, 'selecting a continuation selects the entire 2×2 merge');
  assert.equal(serializeConceptTable(unmergeConceptTableSelection(merged, selection)), serializeConceptTable(rows));
  const filled = parseConceptTableRows('A|B\nC|D');
  assert.equal(serializeConceptTable(unmergeConceptTableSelection(
    mergeConceptTableSelection(filled, fullRange(filled)), fullRange(filled),
  )), '[TABLE]A|\n|[/TABLE]');
});

test('merges and unmerges multiple groups without changing surrounding cells', () => {
  const rows = parseConceptTableRows('outside|A|<\nkeep|B|<');
  const selection = selectConceptTableRange(rows, { row: 1, column: 2 }, { row: 0, column: 1 });
  assert.equal(canMergeConceptTableSelection(rows, selection), true);
  assert.equal(serializeConceptTable(mergeConceptTableSelection(rows, selection)), '[TABLE]outside|A|<\nkeep|^|<[/TABLE]');
  assert.equal(serializeConceptTable(unmergeConceptTableSelection(rows, selection)), '[TABLE]outside|A|\nkeep|B|[/TABLE]');
});

test('preserves diagonal labels when merging and unmerging the header', () => {
  const rows = parseConceptTableRows('행 \\ 열|\n|');
  const merged = mergeConceptTableSelection(rows, fullRange(rows));
  assert.deepEqual(merged[0][0].diagonal, rows[0][0].diagonal);
  assert.equal(serializeConceptTable(unmergeConceptTableSelection(merged, fullRange(merged))), serializeConceptTable(rows));
});
