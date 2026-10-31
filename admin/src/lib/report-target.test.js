import test from 'node:test';
import assert from 'node:assert/strict';
import { conceptInspectorJump, conceptReportLabel, isConceptReport } from './report-target.js';

const CONCEPT_REPORT = {
  target_type: 'concept',
  target_id: 'card-1',
  concept_title: '취득시효 — 완성과 효력',
  concept_subject_code: 'minbeob',
  concept_category_id: 'gampyeongsa_1_minbeob_15',
  concept_exam_code: 'GPP',
};

test('tells concept reports from question reports', () => {
  assert.equal(isConceptReport(CONCEPT_REPORT), true);
  assert.equal(isConceptReport({ target_type: 'question' }), false);
  assert.equal(isConceptReport({}), false);
});

test('labels a concept report with its card title, or the raw id when the card is gone', () => {
  assert.equal(conceptReportLabel(CONCEPT_REPORT), '개념 노트 · 취득시효 — 완성과 효력');
  assert.equal(conceptReportLabel({ target_type: 'concept', target_id: 'deleted-card' }), '개념 노트 · deleted-card');
});

test('builds the concept editor jump only when the card can be located', () => {
  assert.deepEqual(conceptInspectorJump(CONCEPT_REPORT), {
    'ci.examCode': 'GPP',
    'ci.subjectCode': 'minbeob',
    'ci.unitId': 'gampyeongsa_1_minbeob_15',
    'ci.openId': 'card-1',
  });
  assert.equal(conceptInspectorJump({ ...CONCEPT_REPORT, concept_title: null }), null);
  assert.equal(conceptInspectorJump({ ...CONCEPT_REPORT, concept_category_id: null }), null);
  assert.equal(conceptInspectorJump({ target_type: 'question' }), null);
});
