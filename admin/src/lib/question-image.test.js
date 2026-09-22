import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUESTION_IMAGE_BYTES,
  QUESTION_IMAGE_MAX_WIDTH,
  QUESTION_IMAGE_MIME_TYPES,
  fitQuestionImageSize,
  formatByteSize,
  parseQuestionImage,
  questionImageAcceptAttribute,
  questionImageByteLength,
  questionImageForSave,
} from './question-image.js';

// 1x1 투명 PNG — 실제 디코드 가능한 최소 이미지
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const tinyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

test('accepts png and jpeg data urls and reports their decoded size', () => {
  const png = parseQuestionImage(tinyPng);
  assert.equal(png.ok, true);
  assert.equal(png.mime, 'image/png');
  assert.equal(png.reason, null);
  assert.ok(png.byteLength > 0 && png.byteLength < 200, 'a 1x1 png is tiny');

  const jpeg = parseQuestionImage(tinyJpeg);
  assert.equal(jpeg.ok, true);
  assert.equal(jpeg.mime, 'image/jpeg');
});

test('rejects blanks, other schemes, and unsupported image types', () => {
  for (const blank of ['', '   ', null, undefined]) {
    assert.deepEqual(parseQuestionImage(blank), { ok: false, reason: 'empty' }, String(blank));
  }
  for (const bad of [
    'https://example.com/figure.png',
    'data:image/gif;base64,R0lGOD',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png,notbase64',
    'data:image/png;base64,has spaces==',
    'data:image/png;base64,',
  ]) {
    assert.deepEqual(parseQuestionImage(bad), { ok: false, reason: 'format' }, bad);
  }
});

test('rejects an image past the byte cap and reports the size it measured', () => {
  // 상한을 넘기는 최소 길이의 base64. 4의 배수로 맞춰 패딩 없이 만든다.
  const overLimitChars = Math.ceil((MAX_QUESTION_IMAGE_BYTES + 1) * 4 / 3 / 4) * 4;
  const oversized = `data:image/png;base64,${'A'.repeat(overLimitChars)}`;
  const result = parseQuestionImage(oversized);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-large');
  assert.ok(result.byteLength > MAX_QUESTION_IMAGE_BYTES);

  const atLimitChars = Math.floor(MAX_QUESTION_IMAGE_BYTES / 3) * 4;
  const allowed = parseQuestionImage(`data:image/png;base64,${'A'.repeat(atLimitChars)}`);
  assert.equal(allowed.ok, true, 'an image exactly at the cap is still accepted');
});

test('keeps the client cap below the server data-uri cap', () => {
  // admin_update_question_v3 는 data URI 2,000,000자를 거절한다.
  const worstCaseDataUrlLength = 'data:image/jpeg;base64,'.length
    + Math.ceil(MAX_QUESTION_IMAGE_BYTES / 3) * 4;
  assert.ok(
    worstCaseDataUrlLength < 2000000,
    `client cap must stay under the server cap, got ${worstCaseDataUrlLength}`,
  );
});

test('measures base64 byte length including padding', () => {
  assert.equal(questionImageByteLength(''), 0);
  assert.equal(questionImageByteLength('QQ=='), 1);
  assert.equal(questionImageByteLength('QUJD'), 3);
  assert.equal(questionImageByteLength('QUJDRA=='), 4);
  assert.equal(questionImageByteLength(null), 0);
});

test('folds every empty representation to a single null on save', () => {
  assert.equal(questionImageForSave(''), null);
  assert.equal(questionImageForSave('   '), null);
  assert.equal(questionImageForSave(null), null);
  assert.equal(questionImageForSave(undefined), null);
  assert.equal(questionImageForSave(tinyPng), tinyPng);
  assert.equal(questionImageForSave(`  ${tinyPng}  `), tinyPng);
});

test('formats byte sizes the way an editor reads them', () => {
  assert.equal(formatByteSize(0), '0B');
  assert.equal(formatByteSize(512), '512B');
  assert.equal(formatByteSize(1024), '1.0KB');
  assert.equal(formatByteSize(84378), '82.4KB');
  assert.equal(formatByteSize(1024 * 1024), '1.00MB');
  assert.equal(formatByteSize(-1), '-');
  assert.equal(formatByteSize('nope'), '-');
});

test('scales a wide image down to the recommended width and leaves narrow ones alone', () => {
  assert.deepEqual(fitQuestionImageSize(1600, 1200), { width: 800, height: 600 });
  assert.deepEqual(fitQuestionImageSize(800, 450), { width: 800, height: 450 });
  assert.deepEqual(fitQuestionImageSize(320, 240), { width: 320, height: 240 }, 'never upscales');
  assert.deepEqual(fitQuestionImageSize(2400, 7), { width: 800, height: 2 }, 'height stays at least 1px');
  assert.deepEqual(fitQuestionImageSize(0, 0), { width: 1, height: 1 });
  assert.deepEqual(fitQuestionImageSize(1000, 500, 500), { width: 500, height: 250 });
});

test('exposes the accept attribute and constants the editor relies on', () => {
  assert.equal(questionImageAcceptAttribute(), 'image/png,image/jpeg');
  assert.deepEqual(QUESTION_IMAGE_MIME_TYPES, ['image/png', 'image/jpeg']);
  assert.equal(QUESTION_IMAGE_MAX_WIDTH, 800);
});
