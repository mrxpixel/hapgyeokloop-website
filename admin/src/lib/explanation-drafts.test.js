import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPLANATION_DRAFT_EXPORT_FIELDS,
  EXPLANATION_DRAFT_RPC_NAMES,
  buildExplanationDraftRpcParams,
  diffExplanationLines,
  explanationDraftsToCsv,
  explanationDraftsToJsonl,
} from './explanation-drafts.js';

const draftRow = {
  id: 'draft-1',
  question_id: 'Q-1',
  subject_id: 'subject-1',
  year_session: 35,
  question_number: 7,
  status: 'draft',
  base_explanation: '첫 줄\n기존 "설명"',
  draft_explanation: '첫 줄\n새 설명, 보강',
  direction_note: '정의 한 줄\n표로 정리',
  created_at: '2026-09-29T00:00:00Z',
  updated_at: '2026-09-29T01:00:00Z',
  applied_at: null,
};

test('diffs unchanged, deleted, and inserted explanation lines with line numbers', () => {
  assert.deepEqual(
    diffExplanationLines('공통\n삭제할 줄\n마지막', '공통\n추가한 줄\n마지막'),
    [
      { type: 'equal', text: '공통', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'delete', text: '삭제할 줄', oldLineNumber: 2, newLineNumber: null },
      { type: 'insert', text: '추가한 줄', oldLineNumber: null, newLineNumber: 2 },
      { type: 'equal', text: '마지막', oldLineNumber: 3, newLineNumber: 3 },
    ],
  );
});

test('line diff handles repeated lines deterministically and does not mutate source values', () => {
  const base = '반복\n기존\n반복';
  const draft = '반복\n반복\n추가';

  assert.deepEqual(diffExplanationLines(base, draft), [
    { type: 'equal', text: '반복', oldLineNumber: 1, newLineNumber: 1 },
    { type: 'delete', text: '기존', oldLineNumber: 2, newLineNumber: null },
    { type: 'equal', text: '반복', oldLineNumber: 3, newLineNumber: 2 },
    { type: 'insert', text: '추가', oldLineNumber: null, newLineNumber: 3 },
  ]);
  assert.equal(base, '반복\n기존\n반복');
  assert.equal(draft, '반복\n반복\n추가');
});

test('line diff normalizes CRLF and preserves a meaningful trailing empty line', () => {
  assert.deepEqual(diffExplanationLines('가\r\n나', '가\n나'), [
    { type: 'equal', text: '가', oldLineNumber: 1, newLineNumber: 1 },
    { type: 'equal', text: '나', oldLineNumber: 2, newLineNumber: 2 },
  ]);
  assert.deepEqual(diffExplanationLines('가', '가\n'), [
    { type: 'equal', text: '가', oldLineNumber: 1, newLineNumber: 1 },
    { type: 'insert', text: '', oldLineNumber: null, newLineNumber: 2 },
  ]);
  assert.deepEqual(diffExplanationLines('', ''), []);
});

test('JSONL keeps every field and writes exactly one complete object per line', () => {
  const second = { ...draftRow, id: 'draft-2', extra_prompt_tag: '표 중심' };
  const jsonl = explanationDraftsToJsonl([draftRow, second]);
  const lines = jsonl.trimEnd().split('\n');

  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), draftRow);
  assert.deepEqual(JSON.parse(lines[1]), second);
  assert.ok(jsonl.endsWith('\n'));
  assert.equal(explanationDraftsToJsonl([]), '');
});

test('CSV starts with a UTF-8 BOM and keeps stable headers plus additional fields', () => {
  const csv = explanationDraftsToCsv([{ ...draftRow, extra_prompt_tag: '정의,표' }]);
  const [header] = csv.slice(1).split('\r\n');

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(
    header,
    [...EXPLANATION_DRAFT_EXPORT_FIELDS, 'extra_prompt_tag'].join(','),
  );
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(explanationDraftsToCsv([]).charCodeAt(0), 0xfeff);
});

test('CSV escapes quotes, commas, and embedded line breaks without losing Korean text', () => {
  const csv = explanationDraftsToCsv([draftRow]);

  assert.ok(csv.includes('"첫 줄\n기존 ""설명"""'));
  assert.ok(csv.includes('"첫 줄\n새 설명, 보강"'));
  assert.ok(csv.includes('"정의 한 줄\n표로 정리"'));
  assert.ok(csv.includes('draft-1,Q-1,subject-1,35,7,draft'));
});

test('export helpers reject non-array inputs instead of silently coercing them', () => {
  assert.throws(() => explanationDraftsToJsonl(null), TypeError);
  assert.throws(() => explanationDraftsToCsv({}), TypeError);
});

test('maps all question-scoped draft actions to the expected RPC parameters', () => {
  for (const action of ['get', 'delete', 'apply', 'rebase']) {
    assert.deepEqual(
      buildExplanationDraftRpcParams(action, { questionId: ' Q-1 ' }),
      { p_question_id: 'Q-1' },
      action,
    );
  }
  assert.deepEqual(
    buildExplanationDraftRpcParams('save', {
      questionId: 'Q-1',
      draft: '새 해설\n둘째 줄',
      directionNote: '표로 정리',
    }),
    {
      p_question_id: 'Q-1',
      p_draft: '새 해설\n둘째 줄',
      p_direction_note: '표로 정리',
    },
  );
});

test('list RPC parameters explicitly send null for all-subject and all-status filters', () => {
  assert.deepEqual(buildExplanationDraftRpcParams('list'), {
    p_subject_id: null,
    p_status: null,
  });
  assert.deepEqual(
    buildExplanationDraftRpcParams('list', { subjectId: '  ', status: '' }),
    { p_subject_id: null, p_status: null },
  );
  assert.deepEqual(
    buildExplanationDraftRpcParams('list', { subjectId: 'subject-1', status: 'applied' }),
    { p_subject_id: 'subject-1', p_status: 'applied' },
  );
});

test('RPC construction publishes every function name and rejects invalid inputs', () => {
  assert.deepEqual(EXPLANATION_DRAFT_RPC_NAMES, {
    get: 'admin_get_explanation_draft',
    save: 'admin_save_explanation_draft',
    delete: 'admin_delete_explanation_draft',
    apply: 'admin_apply_explanation_draft',
    rebase: 'admin_rebase_explanation_draft',
    list: 'admin_list_explanation_drafts',
  });
  assert.throws(() => buildExplanationDraftRpcParams('get'), /questionId/);
  assert.throws(
    () => buildExplanationDraftRpcParams('list', { status: 'unknown' }),
    RangeError,
  );
  assert.throws(() => buildExplanationDraftRpcParams('unknown'), /Unsupported/);
});
