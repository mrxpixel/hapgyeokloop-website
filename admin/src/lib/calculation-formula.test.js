// 앱 test/features/notes/calculation_formula_test.dart 와 같은 사례
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculationLineLatex, groupCalculationFormula, splitCalculationFormula } from './calculation-formula.js';

const never = () => false;

test('equivalent production keeps the parenthesized completion rate intact', () => {
  const left = String.raw`\text{가공원가 완성품환산량}`;
  const opening = String.raw`=\text{기초재공품수량}\times(1-\text{기초재공품 완성도})`;
  const completed = String.raw`+\text{당기착수완성품수량}`;
  const ending = String.raw`+\text{기말재공품수량}\times\text{기말재공품 완성도}`;
  assert.deepEqual(splitCalculationFormula(left + opening + completed + ending), [left, opening, completed, ending]);
});

test('equity method keeps all operations within its parentheses intact', () => {
  const left = String.raw`\text{지분법손익}`;
  const parenthesized = String.raw`=(\text{피투자회사의 당기순손익}-\text{상향·하향거래 미실현이익}+\text{상향·하향거래 실현이익})\times\text{투자회사 지분율}`;
  const deduction = String.raw`-\text{피투자회사 …}`;
  assert.deepEqual(splitCalculationFormula(left + parenthesized + deduction), [left, parenthesized, deduction]);
});

test('average cost ratio keeps its complete fraction on the second line', () => {
  const left = String.raw`\text{평균원가율}`;
  const fraction = String.raw`=\dfrac{\text{기초재고액(원가)}+\text{당기매입액(원가)}-\text{비정상파손(원가)}}{\text{기초재고액(매가)}+\text{당기매입액(매가)}+\text{순인상}-\text{순인하}-\text{비정상파손(매가)}}`;
  assert.deepEqual(splitCalculationFormula(left + fraction), [left, fraction]);
  assert.deepEqual(groupCalculationFormula(left + fraction, never), [left, fraction]);
});

test('nested braces, text, parentheses, and brackets protect operators', () => {
  assert.deepEqual(splitCalculationFormula(String.raw`a={b+c-d}+\text{a=b+c-d}+[(b-c)+d]-e`),
    ['a', '={b+c-d}', String.raw`+\text{a=b+c-d}`, '+[(b-c)+d]', '-e']);
});

test('parentheses in text do not affect the surrounding math groups', () => {
  assert.deepEqual(splitCalculationFormula(String.raw`\text{(기초}=a+\text{기말)}-b`),
    [String.raw`\text{(기초}`, '=a', String.raw`+\text{기말)}`, '-b']);
});

test('nested left/right and invisible delimiters protect operators', () => {
  assert.deepEqual(splitCalculationFormula(String.raw`a=\left. b+\left\{c-d\right\}+e\right|+f`),
    ['a', String.raw`=\left. b+\left\{c-d\right\}+e\right|`, '+f']);
  assert.deepEqual(splitCalculationFormula(String.raw`a=\left[b-c\right]+d`), ['a', String.raw`=\left[b-c\right]`, '+d']);
});

test('times, div, fractions, and unbraced fraction arguments stay intact', () => {
  assert.deepEqual(splitCalculationFormula(String.raw`a=b\times c\div d+\frac{x-y}{z+w}`),
    ['a', String.raw`=b\times c\div d`, String.raw`+\frac{x-y}{z+w}`]);
  assert.deepEqual(splitCalculationFormula(String.raw`a=\frac1-+c`), ['a', String.raw`=\frac1-`, '+c']);
});

test('escaped operator commands and escaped braces are not split', () => {
  assert.deepEqual(splitCalculationFormula(String.raw`a=b\+c\-d\=e+f`), ['a', String.raw`=b\+c\-d\=e`, '+f']);
  assert.deepEqual(splitCalculationFormula(String.raw`a=\text{\{b+c\}}-d`), ['a', String.raw`=\text{\{b+c\}}`, '-d']);
});

test('unary signs and unbraced exponents remain with their operands', () => {
  assert.deepEqual(splitCalculationFormula('-a=-b+-c-x^-2+y_{a-b}'), ['-a', '=-b', '+-c', '-x^-2', '+y_{a-b}']);
  assert.deepEqual(splitCalculationFormula(String.raw`a=b\times-c+d`), ['a', String.raw`=b\times-c`, '+d']);
});

for (const operator of ['\\le', '\\ge', '\\leq', '\\geq', '\\neq', '<', '>', ',', ':', '\\approx', '\\pm', '\\to']) {
  test(`a minus after ${operator} stays unary`, () => {
    const unary = `b${operator}-c`;
    assert.deepEqual(splitCalculationFormula(unary), [unary]);
    assert.deepEqual(splitCalculationFormula(`a=${unary}+d-e`), ['a', `=${unary}`, '+d', '-e']);
    assert.deepEqual(splitCalculationFormula(`a=b${operator} \\quad -c+d`), ['a', `=b${operator} \\quad -c`, '+d']);
  });
}

test('manual line breaks and environments remain unchanged', () => {
  for (const expression of [String.raw`\begin{gathered}a=b+c\\d=e-f\end{gathered}`, String.raw`a=b+c\\d=e-f`, String.raw`\begin{aligned}a&=b+c\end{aligned}`]) {
    assert.deepEqual(splitCalculationFormula(expression), [expression]);
    assert.deepEqual(groupCalculationFormula(expression, never), [expression]);
  }
});

test('incomplete grouping conservatively leaves the formula untouched', () => {
  for (const expression of ['a=b+(c-d', String.raw`a=b+\left(c-d`, String.raw`a=b+\frac{c-d}`]) {
    assert.deepEqual(splitCalculationFormula(expression), [expression]);
  }
});

test('a short formula stays on one line when it fits', () => {
  assert.deepEqual(groupCalculationFormula('a=b+c', value => value.length <= 8), ['a=b+c']);
  assert.deepEqual(splitCalculationFormula('abc'), ['abc']);
});

test('wrapping forces the full left side first and greedily packs terms', () => {
  assert.deepEqual(groupCalculationFormula('a+b=c+d+e-f', value => value.length <= 4), ['a+b', '=c+d', '+e-f']);
});

test('greedy packing uses the narrower continuation width', () => {
  assert.deepEqual(groupCalculationFormula('aa+bb+cc+dd+ee', (value, continuation) => value.length <= (continuation ? 3 : 5)),
    ['aa+bb', '+cc', '+dd', '+ee']);
});

test('an indivisible oversized part does not prevent later term packing', () => {
  assert.deepEqual(groupCalculationFormula('a=(verylong+b-c)+d+e', value => value.length <= 4), ['a', '=(verylong+b-c)', '+d+e']);
});

test('continuation lines starting with a sign get an empty left operand', () => {
  assert.equal(calculationLineLatex('+b', true), '{}+b');
  assert.equal(calculationLineLatex('+b', false), '+b');
  assert.equal(calculationLineLatex('=b', true), '=b');
});
