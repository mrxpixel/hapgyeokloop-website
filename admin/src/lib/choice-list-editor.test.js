import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resizeChoiceHeaders } from './stem-blocks.js';
import {
  MAX_CHOICE_COLUMNS,
  choiceText,
  resizeAllChoiceColumns,
} from './choice-columns.js';

function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== 'object') return [];
  return [node, ...descendants(node.props?.children)];
}

function elementByAriaLabel(tree, ariaLabel) {
  return descendants(tree).find(element => element.props?.['aria-label'] === ariaLabel);
}

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return textContent(node.props?.children);
}

function editorProps(headers, choices, onResizeHeaders) {
  return {
    choices,
    correct: 0,
    headers,
    onSelectCorrect() {},
    onChangeText() {},
    onChangeColumn() {},
    onAddHeaders() {},
    onRemoveHeaders() {},
    onResizeHeaders,
    onSyncColumns() {},
  };
}

test('choice-list toolbar minus and plus resize both headers and choice cells', async t => {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  t.after(() => server.close());
  const { ChoiceListEditor } = await server.ssrLoadModule('/admin-sections.jsx');

  let headers = ['첫째', '둘째'];
  let choices = [
    { id: 'A', text: 'x|y' },
    { id: 'B', text: '가|나' },
  ];
  const resize = nextCount => {
    headers = resizeChoiceHeaders(headers, nextCount);
    choices = resizeAllChoiceColumns(choices, nextCount);
  };

  let tree = ChoiceListEditor(editorProps(headers, choices, resize));
  assert.match(textContent(tree), /헤더 2칸/);

  const plus = elementByAriaLabel(tree, '선택지 헤더 한 칸 늘리기');
  assert.equal(plus.props.disabled, false);
  plus.props.onClick();
  assert.deepEqual(headers, ['첫째', '둘째', '']);
  assert.deepEqual(choices.map(choiceText), ['x|y|', '가|나|']);

  tree = ChoiceListEditor(editorProps(headers, choices, resize));
  assert.match(textContent(tree), /헤더 3칸/);
  const minus = elementByAriaLabel(tree, '선택지 헤더 한 칸 줄이기');
  assert.equal(minus.props.disabled, false);
  minus.props.onClick();
  assert.deepEqual(headers, ['첫째', '둘째']);
  assert.deepEqual(choices.map(choiceText), ['x|y', '가|나']);

  tree = ChoiceListEditor(editorProps(['하나'], [{ id: 'A', text: 'x' }], resize));
  assert.equal(elementByAriaLabel(tree, '선택지 헤더 한 칸 줄이기').props.disabled, true);

  const maxHeaders = Array.from({ length: MAX_CHOICE_COLUMNS }, () => '');
  tree = ChoiceListEditor(editorProps(maxHeaders, [{ id: 'A', text: '' }], resize));
  assert.equal(elementByAriaLabel(tree, '선택지 헤더 한 칸 늘리기').props.disabled, true);
});
