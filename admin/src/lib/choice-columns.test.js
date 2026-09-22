import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStemBlocks, serializeStemBlocks } from './stem-blocks.js';
import {
  appendChoiceHeadersBlock,
  removeChoiceHeadersBlock,
  CHOICE_COLUMN_SEPARATOR,
  DEFAULT_CHOICE_COLUMNS,
  MAX_CHOICE_COLUMNS,
  choiceColumnMismatches,
  choiceColumnsTruncation,
  choiceColumnsWithLineBreak,
  choiceForSave,
  choiceLabel,
  choiceText,
  joinChoiceColumns,
  resizeAllChoiceColumns,
  resizeChoiceColumns,
  setChoiceColumn,
  splitChoiceColumns,
} from './choice-columns.js';

// 공인중개사 2차 공인중개사법 33회 — questions.choices, 3열 헤더 문항
const threeColumnChoices = [
  { id: 'A', text: '4일|4일|4점' },
  { id: 'B', text: '4일|5일|5점' },
  { id: 'C', text: '5일|4일|5점' },
  { id: 'D', text: '5일|5일|4점' },
  { id: 'E', text: '5일|5일|5점' },
];

// 공인중개사 2차 공시법 34회 6번 (GJG_2_GS_34_06) — 칸 안에 의도적 줄바꿈이 있는 라이브 문항
const lineBreakChoices = [
  { id: 'A', text: '등기완료의\n통지서|15일|지적공부|7일' },
  { id: 'B', text: '등기완료의\n통지서|7일|지적공부|15일' },
];

// 공인중개사 2차 중개사법 30회 21번 (GJG_2_J_30_21) — 헤더 3칸인데 선지가 4칸인 라이브 불일치
const mismatchedChoices = [
  { id: 'A', text: '법인|국토교통부장관|중앙회|지회' },
  { id: 'B', text: '개인|시ㆍ도지사' },
];

// 헤더가 없는 일반 문항 — 파이프가 없다
const plainChoices = [
  { id: 'A', text: '지상권은 물권이다' },
  { id: 'B', text: '전세권은 채권이다' },
];

test('splits and rejoins a choice character-for-character', () => {
  assert.deepEqual(splitChoiceColumns('4일|4일|4점'), ['4일', '4일', '4점']);
  assert.equal(joinChoiceColumns(['4일', '4일', '4점']), '4일|4일|4점');

  const sources = [
    '4일|4일|4점',
    '지상권은 물권이다',
    '',
    '|',
    '||',
    'a||b',
    ' 앞뒤 공백 | 유지 ',
    '등기완료의\n통지서|15일|지적공부|7일',
  ];
  for (const source of sources) {
    assert.equal(joinChoiceColumns(splitChoiceColumns(source)), source, source);
  }
});

test('reads text and labels from object and legacy string entries', () => {
  assert.equal(choiceText({ id: 'A', text: '가' }), '가');
  assert.equal(choiceText('가'), '가');
  assert.equal(choiceText({ id: 'A' }), '');
  assert.equal(choiceText(null), '');

  assert.equal(choiceLabel({ id: 'C', text: '' }, 0), 'C');
  assert.equal(choiceLabel({ text: '' }, 2), 'C');
  assert.equal(choiceLabel('legacy', 4), 'E');
});

test('resizes one column array up and down without mutating it', () => {
  const columns = ['4일', '4일'];

  assert.deepEqual(resizeChoiceColumns(columns, 4), ['4일', '4일', '', '']);
  assert.deepEqual(resizeChoiceColumns(columns, 1), ['4일']);
  assert.deepEqual(columns, ['4일', '4일'], 'operations never mutate input');

  assert.throws(() => resizeChoiceColumns(columns, 0), RangeError);
  assert.throws(() => resizeChoiceColumns(columns, MAX_CHOICE_COLUMNS + 1), RangeError);
  assert.throws(() => resizeChoiceColumns('4일|4일', 2), TypeError);
});

test('flags choices whose column count disagrees with the header width', () => {
  const mismatches = choiceColumnMismatches(mismatchedChoices, 3);

  assert.deepEqual(mismatches, [
    { index: 0, label: 'A', columnCount: 4 },
    { index: 1, label: 'B', columnCount: 2 },
  ]);
  assert.deepEqual(choiceColumnMismatches(threeColumnChoices, 3), [], 'matching choices report nothing');
});

test('pads a short choice for display without changing its stored text', () => {
  const short = mismatchedChoices[1];
  const padded = resizeChoiceColumns(splitChoiceColumns(choiceText(short)), 3);

  assert.deepEqual(padded, ['개인', '시ㆍ도지사', '']);
  assert.equal(choiceText(short), '개인|시ㆍ도지사', 'the stored choice is untouched by padding');
});

test('counts the non-blank content a narrower width would drop', () => {
  const truncated = choiceColumnsTruncation(mismatchedChoices, 2);

  assert.equal(truncated.count, 2);
  assert.deepEqual(truncated.columns, [
    { index: 0, label: 'A', columnIndex: 2, value: '중앙회' },
    { index: 0, label: 'A', columnIndex: 3, value: '지회' },
  ]);

  const blankTail = choiceColumnsTruncation([{ id: 'A', text: '가|나|   ' }], 2);
  assert.deepEqual(blankTail, { count: 0, columns: [] }, 'blank columns are not reported as losses');
});

test('syncs every choice when the header column count changes', () => {
  const widened = resizeAllChoiceColumns(threeColumnChoices, 4);
  assert.deepEqual(widened.map(choiceText), [
    '4일|4일|4점|',
    '4일|5일|5점|',
    '5일|4일|5점|',
    '5일|5일|4점|',
    '5일|5일|5점|',
  ]);

  const narrowed = resizeAllChoiceColumns(threeColumnChoices, 2);
  assert.deepEqual(narrowed.map(choiceText), ['4일|4일', '4일|5일', '5일|4일', '5일|5일', '5일|5일']);

  assert.deepEqual(widened.map(choice => choice.id), ['A', 'B', 'C', 'D', 'E'], 'ids survive a resize');
  assert.deepEqual(
    threeColumnChoices.map(choiceText),
    ['4일|4일|4점', '4일|5일|5점', '5일|4일|5점', '5일|5일|4점', '5일|5일|5점'],
    'operations never mutate input',
  );
});

test('returns the same array when a resize changes nothing', () => {
  assert.strictEqual(resizeAllChoiceColumns(threeColumnChoices, 3), threeColumnChoices);
  assert.strictEqual(setChoiceColumn(threeColumnChoices, 0, 1, '4일'), threeColumnChoices);
});

test('writes one column and leaves the other columns byte-for-byte intact', () => {
  const edited = setChoiceColumn(lineBreakChoices, 0, 1, '20일');

  assert.equal(choiceText(edited[0]), '등기완료의\n통지서|20일|지적공부|7일');
  assert.equal(edited[0].id, 'A', 'the id survives a column edit');
  assert.strictEqual(edited[1], lineBreakChoices[1], 'untouched choices keep their identity');
  assert.equal(
    choiceText(lineBreakChoices[0]),
    '등기완료의\n통지서|15일|지적공부|7일',
    'operations never mutate input',
  );
});

test('grows a short choice only as far as the edited column', () => {
  const edited = setChoiceColumn(mismatchedChoices, 1, 3, '지회');

  assert.equal(choiceText(edited[1]), '개인|시ㆍ도지사||지회');
  assert.throws(() => setChoiceColumn(mismatchedChoices, 2, 0, '가'), RangeError);
  assert.throws(() => setChoiceColumn(mismatchedChoices, 0, MAX_CHOICE_COLUMNS, '가'), RangeError);
});

test('leaves a question without headers as a single unsplit column', () => {
  for (const [index, choice] of plainChoices.entries()) {
    const columns = splitChoiceColumns(choiceText(choice));
    assert.equal(columns.length, 1, `choice ${index} stays whole`);
    assert.equal(joinChoiceColumns(columns), choiceText(choice));
  }
  assert.deepEqual(choiceColumnMismatches(plainChoices, 1), []);
});

test('reports columns holding a line break a single-line input would drop', () => {
  assert.deepEqual(choiceColumnsWithLineBreak(lineBreakChoices), [
    { index: 0, label: 'A', columnIndex: 0 },
    { index: 1, label: 'B', columnIndex: 0 },
  ]);
  assert.deepEqual(choiceColumnsWithLineBreak(threeColumnChoices), []);
});

test('keeps the id when saving a choice whose text was cleared', () => {
  assert.deepEqual(choiceForSave({ id: 'A', text: '' }), { id: 'A', text: '' });
  assert.deepEqual(choiceForSave({ id: 'A', text: '가' }), { id: 'A', text: '가' });
  assert.deepEqual(choiceForSave('legacy'), { text: 'legacy' });
  assert.deepEqual(choiceForSave(null), { text: '' });
});

test('exposes a separator and defaults that match the live corpus', () => {
  assert.equal(CHOICE_COLUMN_SEPARATOR, '|');
  assert.equal(DEFAULT_CHOICE_COLUMNS, 2);
  assert.equal(MAX_CHOICE_COLUMNS, 100);
});

test('appends choice headers as the stem final line with exactly one newline', () => {
  // 감평사 부동산학원론 27회 4번 관행: 마커가 맨 끝, 앞 개행 1개, 뒤에는 아무것도 없다
  const sources = [
    '주택 공급 변화요인과 공급량 변화요인이 옳게 묶인 것은?',
    '이미 줄바꿈으로 끝나는 지문입니다.\n',
    '표로 끝나는 지문\n[TABLE]구분|A|B\n기울기|-0.8|0.3\n[/TABLE]',
  ];
  const expected = [
    '주택 공급 변화요인과 공급량 변화요인이 옳게 묶인 것은?\n[CHOICE_HEADERS]|[/CHOICE_HEADERS]',
    '이미 줄바꿈으로 끝나는 지문입니다.\n[CHOICE_HEADERS]|[/CHOICE_HEADERS]',
    '표로 끝나는 지문\n[TABLE]구분|A|B\n기울기|-0.8|0.3\n[/TABLE]\n[CHOICE_HEADERS]|[/CHOICE_HEADERS]',
  ];

  sources.forEach((source, index) => {
    const appended = appendChoiceHeadersBlock(parseStemBlocks(source), DEFAULT_CHOICE_COLUMNS);
    assert.equal(serializeStemBlocks(appended), expected[index], source);
  });

  const empty = appendChoiceHeadersBlock(parseStemBlocks(''), 3);
  assert.equal(serializeStemBlocks(empty), '[CHOICE_HEADERS]||[/CHOICE_HEADERS]');
});

test('round-trips a stem through adding and removing choice headers', () => {
  const sources = [
    '주택 공급 변화요인과 공급량 변화요인이 옳게 묶인 것은?',
    '표로 끝나는 지문\n[TABLE]구분|A|B\n기울기|-0.8|0.3\n[/TABLE]',
  ];

  for (const source of sources) {
    const blocks = parseStemBlocks(source);
    const appended = appendChoiceHeadersBlock(blocks, DEFAULT_CHOICE_COLUMNS);
    assert.equal(serializeStemBlocks(removeChoiceHeadersBlock(appended)), source, source);
    assert.equal(serializeStemBlocks(blocks), source, 'operations never mutate input');
  }
});

test('removes a header authored with the live two-newline variant', () => {
  // 105건 중 3건은 마커 앞이 빈 줄이다. 삭제는 개행 하나만 되돌린다.
  const source = '발문입니다.\n\n[CHOICE_HEADERS](A)|(B)[/CHOICE_HEADERS]';
  const stripped = serializeStemBlocks(removeChoiceHeadersBlock(parseStemBlocks(source)));

  assert.equal(stripped, '발문입니다.\n');
  assert.deepEqual(
    removeChoiceHeadersBlock(parseStemBlocks('헤더가 없는 지문')),
    parseStemBlocks('헤더가 없는 지문'),
    'a stem without headers is returned unchanged',
  );
});

test('refuses to append a second choice header block', () => {
  const blocks = appendChoiceHeadersBlock(parseStemBlocks('발문입니다.'), 2);

  assert.throws(() => appendChoiceHeadersBlock(blocks, 2), /without choice headers/);
  assert.throws(() => appendChoiceHeadersBlock('nope', 2), TypeError);
  assert.throws(() => appendChoiceHeadersBlock([], 0), RangeError);
});

test('rejects malformed arguments instead of silently coercing them', () => {
  assert.throws(() => choiceColumnMismatches('nope', 2), TypeError);
  assert.throws(() => choiceColumnsTruncation(threeColumnChoices, 0), RangeError);
  assert.throws(() => choiceColumnsWithLineBreak(null), TypeError);
  assert.throws(() => resizeAllChoiceColumns(threeColumnChoices, -1), RangeError);
  assert.throws(() => joinChoiceColumns('4일|4일'), TypeError);
});
