import test from 'node:test';
import assert from 'node:assert/strict';
import { ANNOUNCEMENT_EXAMS, announcementExamLabel, announcementExamParam } from './announcement-exam.js';

test('offers 공통 first, then each exam', () => {
  assert.deepEqual(ANNOUNCEMENT_EXAMS.map(e => e.id), [null, 'gongjungaesa', 'gampyeongsa']);
});

test('labels common and per-exam announcements', () => {
  assert.equal(announcementExamLabel(null), '공통');
  assert.equal(announcementExamLabel(undefined), '공통');
  assert.equal(announcementExamLabel(''), '공통');
  assert.equal(announcementExamLabel('gampyeongsa'), '감정평가사');
  assert.equal(announcementExamLabel('unknown_exam'), 'unknown_exam');
});

test('sends null for common so the RPC stores NULL, never an empty string', () => {
  assert.equal(announcementExamParam(null), null);
  assert.equal(announcementExamParam(''), null);
  assert.equal(announcementExamParam('gongjungaesa'), 'gongjungaesa');
});
