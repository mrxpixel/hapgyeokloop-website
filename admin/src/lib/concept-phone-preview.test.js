import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTextMiddleDots, parseConceptPhoneBlocks, parseInlineMath, planConceptBodyLines } from './concept-phone-preview.js';

test('splits tables first, then figures, keeping text order', () => {
  const blocks = parseConceptPhoneBlocks('앞\n[TABLE]가|나\n1|2[/TABLE]\n중간\n[SVG]<svg></svg>[/SVG]\n뒤');
  assert.deepEqual(blocks.map(block => block.type), ['text', 'table', 'text', 'svg', 'text']);
  assert.equal(blocks[1].hasHeader, true);
  assert.equal(parseConceptPhoneBlocks('[TABLE noheader]a|b[/TABLE]')[0].hasHeader, false);
});

test('table merges follow ^ (up) and < (left) markers', () => {
  const [table] = parseConceptPhoneBlocks('[TABLE]구분|내용|<\nA|x\\ny|z\n^|w|v[/TABLE]');
  const [head, first, second] = table.rows;
  assert.equal(head[1].colSpan, 2);
  assert.equal(head[2], null);
  assert.equal(first[0].rowSpan, 2);
  assert.deepEqual(first[1].lines, ['x', 'y']);
  assert.equal(second[0], null);
  assert.equal(table.rows.headerRows, 1);
});

test('calculation section numbers formulas only when there are two or more', () => {
  const plan = planConceptBodyLines('**계산 방법**\n$a=b$\n\n설명 하나\n$c=d$\n설명 둘\n**다른 소제목**\n$e=f$');
  const formulas = plan.filter(item => item.type === 'formula');
  assert.deepEqual(formulas.map(item => [item.number, item.description]), [[1, '설명 하나'], [2, '설명 둘']]);
  assert.equal(plan.at(-1).type, 'latex');
  const single = planConceptBodyLines('**계산 방법**\n$a=b$\n설명').filter(item => item.type === 'formula');
  assert.equal(single[0].number, null);
});

test('a description that mentions symbols stays a description, but a formula line does not', () => {
  const plan = planConceptBodyLines('**계산 방법**\n$a=b$\n$x$ 와 $y$ 를 비교');
  assert.equal(plan[1].description, '$x$ 와 $y$ 를 비교');
  const next = planConceptBodyLines('**계산 방법**\n$a=b$\n$c=d$');
  assert.equal(next[1].description, null);
});

test('sentences with inline math wrap; whole formulas and $$ blocks stay fitted', () => {
  const plan = planConceptBodyLines('긴 문장 $P$를 구한 뒤 $Q$를 구합니다.\n$Q_D=Q_S$\n$$a=b$$');
  assert.deepEqual(plan.map(item => item.type), ['inline', 'latex', 'latex']);
});

test('inline math parsing matches the app rules', () => {
  assert.deepEqual(parseInlineMath('가격 $P$와 $Q$'), [
    { text: '가격 ' }, { expression: 'P', source: '$P$' }, { text: '와 ' }, { expression: 'Q', source: '$Q$' },
  ]);
  assert.deepEqual(parseInlineMath('$100-$200'), [{ text: '$100-$200' }]);
  assert.deepEqual(parseInlineMath('면적 10㎡'), [{ text: '면적 10' }, { expression: '\\text{m}^2', source: '㎡' }]);
});

test('middle dots become ㆍ only inside \\text', () => {
  assert.equal(normalizeTextMiddleDots('\\text{상향·하향}·x'), '\\text{상향ㆍ하향}·x');
});
