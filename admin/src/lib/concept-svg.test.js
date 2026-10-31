import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SVG_THEMES,
  hasPaletteColors,
  isMalformedSvgBlock,
  insertSvgBlock,
  locateSvgBlock,
  removeSvgBlock,
  replaceSvgBlock,
  serializeSvgBlock,
  svgBlockMatches,
  svgIssues,
  svgPreviewDataUri,
  svgPreviewMarkup,
} from './concept-svg.js';

const COLOR_SVG = '<svg viewBox="0 0 10 10"><line stroke="#A8243F"/><text fill="currentColor">D</text></svg>';
const MONO_SVG = '<svg viewBox="0 0 10 10"><line stroke="#000"/><path fill="none" stroke="black"/><circle style="fill:#333"/></svg>';

test('finds every SVG block with its source range', () => {
  const source = `앞 문단\n\n[SVG]\n${COLOR_SVG}\n[/SVG]\n\n중간\n\n[SVG]${MONO_SVG}[/SVG]`;
  const blocks = svgBlockMatches(source);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].content, COLOR_SVG);
  assert.equal(source.slice(blocks[1].start, blocks[1].end), `[SVG]${MONO_SVG}[/SVG]`);
  assert.deepEqual(svgBlockMatches(''), []);
});

test('detects palette colors case-insensitively', () => {
  assert.equal(hasPaletteColors(COLOR_SVG), true);
  assert.equal(hasPaletteColors(COLOR_SVG.toLowerCase()), true);
  assert.equal(hasPaletteColors(MONO_SVG), false);
});

test('colored SVG keeps palette in light and brightens it in dark like the app', () => {
  const light = svgPreviewMarkup(COLOR_SVG, { theme: 'light' });
  assert.match(light, /#A8243F/);
  assert.match(light, new RegExp(APP_SVG_THEMES.light.ink));
  assert.doesNotMatch(light, /currentColor/);

  const dark = svgPreviewMarkup(COLOR_SVG, { theme: 'dark' });
  assert.match(dark, /#F07A93/);
  assert.doesNotMatch(dark, /#A8243F/i);
  assert.match(dark, new RegExp(APP_SVG_THEMES.dark.ink));
});

test('monochrome SVG is painted entirely in the text color, keeping none', () => {
  const dark = svgPreviewMarkup(MONO_SVG, { theme: 'dark' });
  const ink = APP_SVG_THEMES.dark.ink;
  assert.match(dark, new RegExp(`stroke="${ink}"`));
  assert.match(dark, /fill="none"/);
  assert.match(dark, new RegExp(`fill:${ink}`));
  assert.doesNotMatch(dark, /#000|black|#333/);
});

test('data URI is encoded for an img source', () => {
  const uri = svgPreviewDataUri(COLOR_SVG);
  assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg'));
  assert.doesNotMatch(uri, /[<>"]/);
});

test('flags blocking problems and viewBox warning', () => {
  const levels = svg => svgIssues(svg).map(issue => issue.level);
  assert.deepEqual(levels(COLOR_SVG), []);
  assert.deepEqual(levels(''), ['error']);
  assert.ok(levels('<div></div>').includes('error'));
  assert.ok(levels('<svg viewBox="0 0 1 1">[/SVG]</svg>').includes('error'));
  assert.ok(levels('<svg viewBox="0 0 1 1"><script>x</script></svg>').includes('error'));
  assert.ok(levels('<svg viewBox="0 0 1 1" onload="x()"></svg>').includes('error'));
  assert.deepEqual(levels('<svg><line/></svg>'), ['warning']);
});

test('inserts a standalone block separated by blank lines', () => {
  const svg = '<svg viewBox="0 0 1 1"></svg>';
  assert.equal(insertSvgBlock('가\n\n나', 1, svg).value, `가\n\n${serializeSvgBlock(svg)}\n\n나`);
  assert.equal(insertSvgBlock('가\n\n나', 3, svg).value, `가\n\n${serializeSvgBlock(svg)}\n\n나`);
  assert.equal(insertSvgBlock('', 0, svg).value, serializeSvgBlock(svg));
  assert.equal(insertSvgBlock('가', 99, svg).value, `가\n\n${serializeSvgBlock(svg)}`);
});

test('replaces and removes a block without leaving extra blank lines', () => {
  const source = `가\n\n[SVG]${MONO_SVG}[/SVG]\n\n나`;
  const [block] = svgBlockMatches(source);
  assert.equal(replaceSvgBlock(source, block.start, block.end, COLOR_SVG).value, `가\n\n[SVG]${COLOR_SVG}[/SVG]\n\n나`);
  assert.equal(removeSvgBlock(source, block.start, block.end).value, '가\n\n나');
  assert.equal(removeSvgBlock(`[SVG]${MONO_SVG}[/SVG]\n\n나`, 0, `[SVG]${MONO_SVG}[/SVG]`.length).value, '나');
});

test('relocates a block after the definition shifted, or reports it gone', () => {
  const original = `[SVG]${MONO_SVG}[/SVG]`;
  const opened = { start: 3, end: 3 + original.length, originalBlock: original };
  const shifted = `가나다라\n\n${original}`;
  assert.deepEqual(locateSvgBlock(shifted, opened), { start: 6, end: 6 + original.length });
  assert.equal(locateSvgBlock('가나다', opened), null);
});

test('style rules without a trailing semicolon keep the stylesheet intact', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:#000}</style><path class="a" d="M0 0L5 5"/></svg>';
  const markup = svgPreviewMarkup(svg, { theme: 'dark' });
  assert.match(markup, new RegExp(`\\.a\\{fill:${APP_SVG_THEMES.dark.ink}\\}</style><path class="a"`));
});

test('monochrome default fill and missing xmlns follow the app', () => {
  const markup = svgPreviewMarkup('<svg viewBox="0 0 10 10"><text>A</text></svg>', { theme: 'dark' });
  assert.match(markup, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(markup, new RegExp(`fill="${APP_SVG_THEMES.dark.ink}"`));
  assert.doesNotMatch(svgPreviewMarkup(COLOR_SVG), /<svg fill=/);
});

test('XML prolog and comments around the root are accepted', () => {
  const svg = '<?xml version="1.0"?>\n<!-- exported -->\n<svg viewBox="0 0 1 1"></svg>\n<!-- end -->';
  assert.deepEqual(svgIssues(svg), []);
  assert.match(svgPreviewMarkup(svg), /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test('removing an inline figure keeps the sentence on one line', () => {
  const source = `앞 문장 [SVG]${MONO_SVG}[/SVG] 뒤 문장`;
  const [block] = svgBlockMatches(source);
  assert.equal(removeSvgBlock(source, block.start, block.end).value, '앞 문장 뒤 문장');
  const lines = `앞\n[SVG]${MONO_SVG}[/SVG]\n뒤`;
  const [lineBlock] = svgBlockMatches(lines);
  assert.equal(removeSvgBlock(lines, lineBlock.start, lineBlock.end).value, '앞\n\n뒤');
});

test('a figure swallowing other markers is malformed', () => {
  const [block] = svgBlockMatches('[SVG]<svg></svg> [TABLE]a|b[/TABLE] [SVG]<svg></svg>[/SVG]');
  assert.equal(isMalformedSvgBlock(block), true);
  assert.equal(isMalformedSvgBlock(svgBlockMatches(`[SVG]${MONO_SVG}[/SVG]`)[0]), false);
});
