import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choiceHeadersTruncation,
  deleteStemBlock,
  insertStemBlock,
  MAX_CHOICE_HEADER_COLUMNS,
  moveStemBlock,
  parseStemBlocks,
  resizeChoiceHeaders,
  serializeStemBlocks,
  updateStemBlock,
  validateStemBlocksForSave,
} from './stem-blocks.js';

// GPS_1_H_28_044. The prompt comes from the pageindex fixture and the table
// is the current two-row-header form exercised by the mobile renderer.
const accounting28Question44 = `(주)감평은 (주)리스가 20x1년 1월 1일에 취득한 기계장치(공정가치 ₩390,000)에 대하여 금융리스계약(리스기간 3년, 연간리스료 ₩150,000 매년 말 지급, (주)감평이 지급한 리스개설직접원가 ₩7,648)을 20x1년 1월 1일에 체결하고 즉시 사용하였다. 리스기간 종료시 예상잔존가치 ₩50,000 중 ₩20,000을 (주)감평이 보증하기로 하였다. 동 금융리스에 적용되는 내재이자율이 연 12%라면, (주)감평이 20x1년도에 인식할 감가상각비는? (단, 리스자산은 정액법으로 감가상각한다.)
[TABLE]기간|단일금액 ₩1의 현재가치|정상연금 ₩1의 현재가치
^|12%|12%
1|0.8929|0.8929
2|0.7972|1.6901
3|0.7118|2.4018[/TABLE]`;

// GPS_1_H_28_062, from data/gampyeongsa-pageindex/hoegye/28.md.
const accounting28Question62 = `(주)감평은 20x1년 1월 1일에 공장건물을 신축하여 20x2년 9월 30일에 완공하였다. 공장건물 신축 관련 자료가 다음과 같을 때, (주)감평이 20x1년도에 자본화할 차입원가는?
(1) 공사비 지출
[TABLE]일자|금액
20x1. 1. 1.|₩600,000
20x1. 7. 1.|500,000
20x2. 3. 1.|500,000[/TABLE]
(2) 차입금 현황
[TABLE]종류|차입금액|차입기간|연이자율
특정차입금|₩300,000|20x1. 4. 1. - 20x1. 12. 31.|3%
일반차입금A|500,000|20x1. 7. 1. - 20x2. 12. 31.|4%
일반차입금B|1,000,000|20x1. 10. 1. - 20x3. 12. 31.|5%[/TABLE]`;

// GPS_1_B_29_88, from the 2026-09-20 corrected-stem backup.
const realEstate29Question88 = String.raw`전국에 세 개의 지역(A, B, C)과 세 개의 산업(제조업, 금융업, 숙박업)만 존재한다고 가정할 때 입지계수에 관한 설명으로 옳은 것은?

[TABLE]산업 \ 지역|A|B|C|전국
제조업 고용자수(명)|150|170|195|515
금융업 고용자수(명)|200|180|190|570
숙박업 고용자수(명)|180|190|200|570
합계(명)|530|540|585|1,655[/TABLE]`;

// GJG_1_G_27_04, from data/corrections/CORRECTIONS.json. The pageindex
// snapshot itself currently has no CHOICE_HEADERS markers.
const choiceHeadersQuestion = `아파트 매매가격이 16% 상승함에 따라 다세대주택의 매매수요량이 8% 증가하고 아파트 매매수요량이 4% 감소한 경우에, 아파트 매매수요의 가격탄력성 (A), 다세대주택 매매수요의 교차탄력성 (B), 아파트에 대한 다세대주택의 관계 (C) 는? (단, 수요의 가격탄력성은 절대값으로 표시하며, 다른 조건은 불변이라고 가정함)
[CHOICE_HEADERS](A)|(B)|(C)[/CHOICE_HEADERS]`;

const mixedBlockStem = '앞  \r\n'
  + '[TABLE]\r\n항목|값\r\nA|1\r\n[/TABLE]\r\n'
  + '[CHOICE_HEADERS] (A) | (B) [/CHOICE_HEADERS]'
  + '[SVG]<svg viewBox="0 0 1 1"/>[/SVG]'
  + ' \r\n뒤 ';

test('splits two tables, surrounding text, and a circle-marker line at exact boundaries', () => {
  const firstTable = `[TABLE]항목|금액
토지|100[/TABLE]`;
  const middle = `
○ 별도 조건은 없다.
중간 본문
`;
  const secondTable = `[TABLE]구분|값
A|1
B|2[/TABLE]`;
  const source = `앞 본문
${firstTable}${middle}${secondTable}
뒤 본문`;

  const blocks = parseStemBlocks(source);

  assert.deepEqual(blocks.map(block => block.kind), [
    'text', 'table', 'text', 'table', 'text',
  ]);
  assert.equal(blocks.length, 5);
  assert.deepEqual(blocks.map(block => block.raw), [
    '앞 본문\n', firstTable, middle, secondTable, '\n뒤 본문',
  ]);
  assert.equal(serializeStemBlocks(blocks), source);
});

test('round-trips all four real stem fixtures character-for-character', async t => {
  const fixtures = [
    ['회계학 28회 44번', accounting28Question44],
    ['회계학 28회 62번', accounting28Question62],
    ['부동산학원론 29회 88번', realEstate29Question88],
    ['CHOICE_HEADERS 문항', choiceHeadersQuestion],
  ];

  for (const [name, source] of fixtures) {
    await t.test(name, () => {
      assert.equal(serializeStemBlocks(parseStemBlocks(source)), source);
    });
  }

  const question44Table = parseStemBlocks(accounting28Question44)
    .find(block => block.kind === 'table');
  assert.equal(question44Table.rows[1][0].merge, 'up');

  const question88Table = parseStemBlocks(realEstate29Question88)
    .find(block => block.kind === 'table');
  assert.deepEqual(question88Table.rows[0][0].diagonal, {
    rowLabel: '산업',
    columnLabel: '지역',
    beforeSlash: ' ',
    afterSlash: ' ',
  });

  const headers = parseStemBlocks(choiceHeadersQuestion)
    .find(block => block.kind === 'choiceHeaders');
  assert.deepEqual(headers.headers, ['(A)', '(B)', '(C)']);
});

test('block to source to block keeps the original parsed block structure', () => {
  const blocks = parseStemBlocks(mixedBlockStem);
  const reparsed = parseStemBlocks(serializeStemBlocks(blocks));

  assert.deepEqual(reparsed, blocks);
  assert.equal(serializeStemBlocks(reparsed), mixedBlockStem);
});

test('serializes only the table whose raw value was explicitly invalidated', () => {
  const blocks = parseStemBlocks(accounting28Question62);
  const tables = blocks.filter(block => block.kind === 'table');
  assert.equal(tables.length, 2);

  // Payload changes do not take effect while raw remains valid.
  tables[0].rows[1][1].value = '원문에 쓰이면 안 됨';

  tables[1].rows[1][1].value = '₩400,000';
  tables[1].raw = null;

  const updated = serializeStemBlocks(blocks);
  const expected = accounting28Question62.replace(
    '특정차입금|₩300,000|',
    '특정차입금|₩400,000|',
  );

  assert.equal(updated, expected);
  assert.ok(updated.includes(tables[0].raw));
  assert.equal(
    updated.slice(0, expected.indexOf('[TABLE]종류')),
    accounting28Question62.slice(0, accounting28Question62.indexOf('[TABLE]종류')),
  );
});

test('keeps unclosed, nested, and differently-cased markers as text', () => {
  const malformed = [
    '[TABLE]A|B',
    '[TABLE]outer[TABLE]inner[/TABLE][/TABLE]',
    '[TABLE]outer[CHOICE_HEADERS]A|B[/CHOICE_HEADERS][/TABLE]',
    '[CHOICE_HEADERS]A|B',
    '[CHOICE_HEADERS]outer[CHOICE_HEADERS]inner[/CHOICE_HEADERS][/CHOICE_HEADERS]',
    '[SVG]outer[SVG]inner[/SVG][/SVG]',
    '앞 [table]A|B[/table] 뒤',
    '앞 [choice_headers]A|B[/choice_headers] 뒤',
    '앞 [svg]<svg/>[/svg] 뒤',
    '고아 닫기 [/TABLE] 뒤',
  ];

  for (const source of malformed) {
    assert.doesNotThrow(() => parseStemBlocks(source));
    assert.deepEqual(parseStemBlocks(source), [{
      kind: 'text', raw: source, text: source,
    }]);
    assert.equal(serializeStemBlocks(parseStemBlocks(source)), source);
  }
});

test('recovers after a balanced nested region without exposing its inner marker', () => {
  const invalid = '[TABLE]outer[TABLE]inner[/TABLE][/TABLE]';
  const valid = '[TABLE]A|B[/TABLE]';
  const blocks = parseStemBlocks(`${invalid}\n${valid}`);

  assert.deepEqual(blocks.map(block => block.kind), ['text', 'table']);
  assert.equal(blocks[0].raw, `${invalid}\n`);
  assert.equal(blocks[1].raw, valid);
});

test('handles empty, plain, marker-only, SVG, and unknown-marker boundaries', () => {
  assert.deepEqual(parseStemBlocks(''), []);
  assert.equal(serializeStemBlocks([]), '');

  for (const source of ['   \n\n', '[BOXED]내용[/BOXED]']) {
    assert.deepEqual(parseStemBlocks(source), [{
      kind: 'text', raw: source, text: source,
    }]);
  }

  const table = parseStemBlocks('[TABLE][/TABLE]');
  assert.equal(table.length, 1);
  assert.equal(table[0].kind, 'table');

  const choiceHeaders = parseStemBlocks('[CHOICE_HEADERS][/CHOICE_HEADERS]');
  assert.deepEqual(choiceHeaders[0].headers, ['']);

  const standaloneSvg = parseStemBlocks('[SVG]');
  assert.deepEqual(standaloneSvg, [{
    kind: 'figure',
    raw: '[SVG]',
    format: 'svg',
    content: '',
    standalone: true,
  }]);

  const pairedSvgSource = '[SVG]<svg viewBox="0 0 1 1"/>[/SVG]';
  const pairedSvg = parseStemBlocks(pairedSvgSource);
  assert.equal(pairedSvg[0].kind, 'figure');
  assert.equal(pairedSvg[0].format, 'svg');
  assert.equal(pairedSvg[0].standalone, false);
  assert.equal(pairedSvg[0].content, '<svg viewBox="0 0 1 1"/>');

  for (const source of [
    '[TABLE][/TABLE]',
    '[CHOICE_HEADERS][/CHOICE_HEADERS]',
    '[SVG]',
    pairedSvgSource,
  ]) {
    assert.equal(serializeStemBlocks(parseStemBlocks(source)), source);
  }
});

test('preserves CRLF, blank rows, and table-envelope whitespace while raw is valid', () => {
  const source = '앞  \r\n\r\n[TABLE]\r\n A | B \r\n\r\n C|D\r\n[/TABLE]\r\n 뒤 ';
  const blocks = parseStemBlocks(source);

  assert.deepEqual(blocks.map(block => block.kind), ['text', 'table', 'text']);
  assert.equal(serializeStemBlocks(blocks), source);
});

test('rebuilds dirty text, choice-header, and figure payloads', () => {
  const blocks = parseStemBlocks(
    '본문[CHOICE_HEADERS] A | B [/CHOICE_HEADERS][SVG]<svg/>[/SVG]',
  );
  const [text, headers, figure] = blocks;

  text.text = '수정 본문';
  text.raw = null;
  headers.headers[1] = 'C';
  headers.raw = null;
  figure.content = '<svg viewBox="0 0 2 2"/>';
  figure.raw = null;

  assert.equal(
    serializeStemBlocks(blocks),
    '수정 본문[CHOICE_HEADERS]A|C[/CHOICE_HEADERS]'
      + '[SVG]<svg viewBox="0 0 2 2"/>[/SVG]',
  );
});

test('stores choice-header line breaks as \\n tokens and restores them when parsed', () => {
  const serialized = serializeStemBlocks([{
    kind: 'choiceHeaders',
    raw: null,
    headers: ['가격\n탄력성', '대체\r\n관계', ''],
  }]);

  assert.equal(
    serialized,
    String.raw`[CHOICE_HEADERS]가격\n탄력성|대체\n관계|[/CHOICE_HEADERS]`,
  );
  assert.equal(serialized.includes('\n'), false, 'stored marker content must not contain a real line break');

  const [parsed] = parseStemBlocks(serialized);
  assert.deepEqual(parsed.headers, ['가격\n탄력성', '대체\n관계', '']);

  parsed.raw = null;
  assert.equal(serializeStemBlocks([parsed]), serialized);
});

test('resizes choice headers up and down without mutating the source blocks', () => {
  const source = '앞  \r\n[CHOICE_HEADERS] (A) | (B) [/CHOICE_HEADERS]\r\n뒤 ';
  const blocks = parseStemBlocks(source);
  const headerIndex = blocks.findIndex(block => block.kind === 'choiceHeaders');
  const originalHeaders = blocks[headerIndex].headers;

  const increased = updateStemBlock(blocks, headerIndex, {
    headers: resizeChoiceHeaders(originalHeaders, 4),
  });
  assert.deepEqual(increased[headerIndex].headers, ['(A)', '(B)', '', '']);
  assert.equal(
    serializeStemBlocks(increased),
    '앞  \r\n[CHOICE_HEADERS](A)|(B)||[/CHOICE_HEADERS]\r\n뒤 ',
  );

  const decreased = updateStemBlock(increased, headerIndex, {
    headers: resizeChoiceHeaders(increased[headerIndex].headers, 1),
  });
  assert.deepEqual(decreased[headerIndex].headers, ['(A)']);
  assert.equal(
    serializeStemBlocks(decreased),
    '앞  \r\n[CHOICE_HEADERS](A)[/CHOICE_HEADERS]\r\n뒤 ',
  );

  assert.deepEqual(originalHeaders, ['(A)', '(B)']);
  assert.equal(serializeStemBlocks(blocks), source, 'unchanged raw remains byte-for-byte intact');
});

test('reports only non-blank choice labels that a shrink would truncate', () => {
  const headers = ['(A)', '(B)', '', '   ', ' (E) ', null, '(G)'];

  assert.deepEqual(choiceHeadersTruncation(headers, 2), {
    count: 2,
    labels: ['(E)', '(G)'],
  });
  assert.deepEqual(choiceHeadersTruncation(headers, headers.length), {
    count: 0,
    labels: [],
  });
  assert.deepEqual(headers, ['(A)', '(B)', '', '   ', ' (E) ', null, '(G)']);
  assert.throws(
    () => resizeChoiceHeaders(headers, MAX_CHOICE_HEADER_COLUMNS + 1),
    RangeError,
  );
});

test('immutably updates one mixed stem block while retaining every untouched raw block', () => {
  const blocks = parseStemBlocks(mixedBlockStem);
  const tableIndex = blocks.findIndex(block => block.kind === 'table');
  const rows = blocks[tableIndex].rows.map(row => row.map(cell => ({ ...cell })));
  rows[1][1].value = '2';

  const updated = updateStemBlock(blocks, tableIndex, {
    rows,
    raw: 'stale source that must not win',
  });

  assert.notStrictEqual(updated, blocks);
  assert.notStrictEqual(updated[tableIndex], blocks[tableIndex]);
  assert.equal(updated[tableIndex].raw, null);
  blocks.forEach((block, index) => {
    if (index === tableIndex) return;
    assert.strictEqual(updated[index], block);
    assert.equal(updated[index].raw, block.raw);
  });
  assert.equal(serializeStemBlocks(blocks), mixedBlockStem, 'source input remains untouched');
  assert.equal(
    serializeStemBlocks(updated),
    mixedBlockStem.replace(
      '[TABLE]\r\n항목|값\r\nA|1\r\n[/TABLE]',
      '[TABLE]항목|값\nA|2[/TABLE]',
    ),
  );
});

test('insert, delete, and move serialize a mixed block list in the requested order', () => {
  const blocks = parseStemBlocks(mixedBlockStem);
  const headerIndex = blocks.findIndex(block => block.kind === 'choiceHeaders');
  const figureIndex = blocks.findIndex(block => block.kind === 'figure');

  const inserted = insertStemBlock(blocks, headerIndex, {
    kind: 'text',
    text: '\n새 본문\n',
    raw: 'stale inserted source',
  });
  assert.equal(inserted[headerIndex].raw, null);
  assert.strictEqual(inserted[headerIndex + 1], blocks[headerIndex]);
  assert.equal(
    serializeStemBlocks(inserted),
    blocks.slice(0, headerIndex).map(block => block.raw).join('')
      + '\n새 본문\n'
      + blocks.slice(headerIndex).map(block => block.raw).join(''),
  );

  const deleted = deleteStemBlock(blocks, figureIndex);
  assert.equal(
    serializeStemBlocks(deleted),
    blocks.filter((_, index) => index !== figureIndex).map(block => block.raw).join(''),
  );
  deleted.forEach((block, index) => {
    const originalIndex = index < figureIndex ? index : index + 1;
    assert.strictEqual(block, blocks[originalIndex]);
  });

  const moved = moveStemBlock(blocks, headerIndex, figureIndex);
  const expectedOrder = blocks.slice();
  const [expectedMoved] = expectedOrder.splice(headerIndex, 1);
  expectedOrder.splice(figureIndex, 0, expectedMoved);
  assert.deepEqual(moved, expectedOrder);
  moved.forEach(block => assert.ok(blocks.includes(block)));
  assert.equal(
    serializeStemBlocks(moved),
    expectedOrder.map(block => block.raw).join(''),
  );
  assert.equal(serializeStemBlocks(blocks), mixedBlockStem, 'operations never mutate input');
});

test('save validation safety-pins untouched equality and permits intentional edits', () => {
  const blocks = parseStemBlocks(mixedBlockStem);
  assert.deepEqual(
    validateStemBlocksForSave(mixedBlockStem, blocks, true),
    { ok: true, stem: mixedBlockStem, reason: null },
  );

  const textIndex = blocks.findIndex(block => block.kind === 'text');
  const changed = updateStemBlock(blocks, textIndex, { text: '수정된 본문' });
  const changedStem = serializeStemBlocks(changed);
  assert.deepEqual(
    validateStemBlocksForSave(mixedBlockStem, changed, false),
    { ok: true, stem: changedStem, reason: null },
  );
  assert.deepEqual(
    validateStemBlocksForSave(mixedBlockStem, changed, true),
    { ok: false, stem: changedStem, reason: 'untouched-stem-changed' },
  );

  const invalid = insertStemBlock(blocks, blocks.length, { kind: 'unsupported' });
  assert.deepEqual(
    validateStemBlocksForSave(mixedBlockStem, invalid, false),
    { ok: false, stem: null, reason: 'current-serialization-failed' },
  );
});

test('block operations reject invalid indexes without mutating their input', () => {
  const blocks = parseStemBlocks('[SVG]');

  assert.throws(() => updateStemBlock(blocks, -1, {}), RangeError);
  assert.throws(() => insertStemBlock(blocks, 2, { kind: 'text', text: '' }), RangeError);
  assert.throws(() => deleteStemBlock(blocks, 1), RangeError);
  assert.throws(() => moveStemBlock(blocks, 0, 1), RangeError);
  assert.equal(serializeStemBlocks(blocks), '[SVG]');
});
